#!/usr/bin/env python3
"""
IIQ Prebid.js build comparison experiment -- runs across one or more target URLs.

For EVERY target URL, ALL scenarios run ALL AT THE SAME TIME (isolated Playwright browser
contexts, so nothing overwrites anything else's storage the way multiple windows/tabs of the
same Chrome profile would) -- and every target URL runs in parallel with every other one too.
Total concurrency is len(TARGET_URLS) * len(SCENARIOS) browser contexts at once.

Per (url, scenario) pair, this:

  1. Opens the target page in a fresh, isolated browser context (own cookies/localStorage).
  2. Intercepts the page's own request for its Prebid.js bundle and serves your custom S3
     build instead. This replaces what you were doing with Requestly, but per-context
     instead of per-Chrome-profile. IMPORTANT: the URL pattern for "which request is the
     Prebid bundle" is verified only for the original natashaskitchen.com target (AdThrive/
     Raptive's CDN) -- see PREBID_URL_OVERRIDES / DEFAULT_PREBID_URL_RE below. Any other
     target URL uses a generic fallback pattern until you verify and add its real one.
  3. If the scenario calls for it, queues `pbjs.enableAnalytics(...)` via `pbjs.que` in an
     init script, so it fires the moment the swapped-in prebid.js is ready -- "as soon as
     the page loads", regardless of exact load timing.
  4. Auto-scrolls the page slowly, bouncing top -> bottom -> top continuously, for the
     configured duration. Resilient to a real page navigation happening mid-scroll (e.g.
     you solving a Cloudflare "verify you are human" challenge by hand) -- it resumes for
     whatever time is actually left instead of crashing the scenario.
  5. Dumps every key in localStorage (which is where iiqPerfAgent's `iiq_perf_<scenario>`
     buckets, if that instrumentation is baked into your custom builds, will be), and pulls
     `total_impressions` (summed gamSlotRenderCount) out of it.

Results layout:

    iiq_experiment_results/
      summary_across_urls.json           <- average total_impressions per scenario,
                                             averaged across every target URL
      <url_slug>/
        summary_impressions.json         <- total_impressions per scenario, for this URL
        <scenario_name>.json             <- full result (incl. raw localStorage) per scenario

v9: multi-target-URL support, run in parallel with everything else.
v11: waits out a Cloudflare "verify you are human" challenge (detected, not bypassed) before
starting the timed scroll/measurement window, records how long that wait was
(cloudflare_challenge_wait_seconds), and captures an end-of-run page_diagnostics snapshot
(pbjs/googletag/ad-slot presence) so a 0-impressions result can be told apart from "the
render listeners never had anything to attach to" in the first place.
v12: each <scenario_name>.json is now written incrementally, roughly every
SCROLL_SNAPSHOT_INTERVAL_S (10s) seconds, instead of only once at the very end -- so you can
open the file mid-run and see live progress. Each snapshot carries elapsed_seconds and
in_progress (True until the final write, then False), and is resilient to a mid-chunk
navigation (e.g. you solving a Cloudflare challenge) the same way the scroll loop already
was. Also added DEVTOOLS: set True to auto-open Chromium DevTools on launch (Chromium only --
Playwright has no equivalent for WebKit, which is what BROWSER_ENGINE is set to by default
since that's required for IntentIQ's Safari-only activation path; DEVTOOLS is a no-op unless
you switch BROWSER_ENGINE to "chromium").

Requirements (run this on a machine with normal internet access -- NOT a locked-down
sandbox): `pip install playwright && playwright install chromium webkit`

Usage: python3 iiq_prebid_experiment.py
"""

import asyncio
import json
import re
import time
import traceback
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, Route

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Add as many target URLs here as you want -- every one of them runs all SCENARIOS in
# parallel with every other one.
TARGET_URLS = [
    "https://natashaskitchen.com/lemon-cheesecake-recipe/",
    # "https://natashaskitchen.com/smash-burger-recipe/",
    # "https://natashaskitchen.com/meatloaf-recipe/"
]

# The page's own config only wires up IntentIQ's userId module (and related behavior)
# when it detects Safari -- so this needs to run under WebKit (Playwright's Safari
# engine), not Chromium. Requires: `playwright install webkit` on top of chromium.
BROWSER_ENGINE = "webkit"  # one of: "chromium", "firefox", "webkit"

# Auto-opens each page's DevTools console when headed. IMPORTANT: Playwright only supports
# this for Chromium -- there's no equivalent for WebKit, so as long as BROWSER_ENGINE is
# "webkit" (needed above for the Safari-only IntentIQ activation) this has no effect, and
# main() prints a note saying so rather than silently ignoring it.
DEVTOOLS = False

# Matches the production Prebid.js bundle as actually loaded by AdThrive/Raptive's loader
# on natashaskitchen.com (verified live): the build-hash segment changes over time/deploys,
# so this is a loose regex rather than an exact URL. Different publishers/vendors load
# their Prebid bundle from a completely different path -- add a verified entry here for
# each new target URL you add to TARGET_URLS. Anything not listed falls back to
# DEFAULT_PREBID_URL_RE, a generic heuristic you should confirm actually matches before
# trusting results for that site.
PREBID_URL_OVERRIDES = {
    "https://natashaskitchen.com/lemon-cheesecake-recipe/": re.compile(
        r"ads\.adthrive\.com/.*/vendor/prebid/prebid(\.min)?\.js"
    ),
}
DEFAULT_PREBID_URL_RE = re.compile(r"ads\.adthrive\.com/.*/vendor/prebid/prebid(\.min)?\.js", re.IGNORECASE)


def get_prebid_url_re(target_url: str):
    return PREBID_URL_OVERRIDES.get(target_url, DEFAULT_PREBID_URL_RE)


RUN_DURATION_SECONDS = 2 * 60  # 10 minutes per scenario
SCROLL_STEP_PX = 600
SCROLL_INTERVAL_MS = 150  # slow, ~80px/sec
HEADLESS = False  # set False if you want to watch/verify the swap happens visually

NAV_TIMEOUT_MS = 60_000  # page.goto gives up loudly instead of hanging forever
FETCH_TIMEOUT_MS = 20_000  # fetching your S3 build gives up loudly too
SCROLL_SNAPSHOT_INTERVAL_S = 10  # how often (seconds) to re-dump localStorage and
# rewrite each scenario's result file mid-run, so you can watch it update instead of
# only seeing a result once the whole run finishes.

# How long to wait for a Cloudflare "verify you are human" challenge to clear before giving
# up and proceeding anyway. Only meaningful to actually solve when HEADLESS=False -- in
# headless mode this just waits out the full timeout with no one able to click it, which is
# exactly what silently happened in earlier runs (explaining an all-scenarios-empty result).
# This does NOT attempt to solve or bypass the challenge -- it only waits for and records it.
CLOUDFLARE_CHALLENGE_WAIT_TIMEOUT_S = 300

# Console errors matching these are known, benign ad-tech noise (e.g. GAM SafeFrame /
# vendor tags poking a sandboxed about:blank iframe) -- not caused by this script, and
# present on the real page regardless. They're counted, not printed live. Add more
# patterns here as you spot other recurring noise you've confirmed is harmless.
KNOWN_NOISE_PATTERNS = [
    re.compile(r"Blocked script execution in 'about:blank'.*sandboxed"),
]

# If the consent (CMP) banner blocks ad loading in your region, flip this on and fill in
# a selector for the "accept" button. Left off by default -- your call, not mine, since it
# changes what real end-user consent state you're actually testing under.
ACCEPT_CONSENT = False
CONSENT_ACCEPT_SELECTOR = None  # e.g. "button#onetrust-accept-btn-handler"

ANALYTICS_OPTIONS = {
    "provider": "iiqAnalytics",
    "options": {
        "partner": 936734067,
        "domainName": "natashaskitchen.com",
        "manualWinReportEnabled": True,
    },
}

SCENARIOS = [
    {
        "name": "prebid_0.38_custom_raptive",
        "url": "https://iiq-prebid-test.s3.amazonaws.com/prebid_0.38_custom_raptive.js",
        "enable_analytics": True,
    },
    # {
    #     "name": "prebid_0.38_custom_raptive_with_refreshuserids",
    #     "url": "https://iiq-prebid-test.s3.amazonaws.com/prebid_0.38_custom_raptive_with_refreshuserids.js",
    #     "enable_analytics": True,
    # },
    # {
    #     "name": "prebid_0.35_baseline_raptive",
    #     "url": "https://iiq-prebid-test.s3.amazonaws.com/prebid_0.35_baseline_raptive.js",
    #     "enable_analytics": False,
    # },
    # {
    #     "name": "prebid_0.35_baseline_raptive_with_analytics",
    #     "url": "https://iiq-prebid-test.s3.amazonaws.com/prebid_0.35_baseline_raptive.js",
    #     "enable_analytics": True,
    # },
]

OUTPUT_DIR = Path(__file__).parent / "iiq_experiment_results"


def slugify_url(url: str) -> str:
    """Turns a target URL into a filesystem-safe folder name, e.g.
    https://natashaskitchen.com/lemon-cheesecake-recipe/ -> natashaskitchen_com_lemon_cheesecake_recipe
    """
    parsed = urlparse(url)
    raw = (parsed.netloc + parsed.path).strip("/")
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", raw).strip("_")
    return slug[:120] or "target"


def extract_perf_summary(local_storage: dict):
    """
    Mirrors iiqPerfAgent's own summarize() shape -- pulls every metric out of the
    iiq_perf_* session bucket(s) found in this scenario's localStorage, not just
    impressions: VR (ID resolution) call timing, bid-won counts, and GAM slot-render /
    viewable-impression counts, both averaged-per-session and totaled.

    Returns None (not a dict of zeros) if no iiq_perf_* bucket was found at all, so
    "no perf data landed" is never confused with "measured zero across the board".
    """
    sessions = []
    for key, raw in local_storage.items():
        if not key.startswith("iiq_perf_"):
            continue
        try:
            parsed = json.loads(raw)
        except Exception:
            continue
        if isinstance(parsed, list):
            sessions.extend(s for s in parsed if isinstance(s, dict))

    if not sessions:
        return None

    def nums(field):
        return [s[field] for s in sessions if isinstance(s.get(field), (int, float))]

    def avg(vals):
        return (sum(vals) / len(vals)) if vals else None

    vr_started_count = sum(1 for s in sessions if s.get("vrCallStartedAt") is not None)

    return {
        "sessions": len(sessions),
        "avg_vr_call_duration_ms": avg(nums("vrCallDurationMs")),
        "avg_time_to_eids_ms": avg(nums("timeToEidsMs")),
        "server_call_rate": (vr_started_count / len(sessions)) if sessions else None,
        "avg_bid_won_count": avg([s.get("bidWonCount") or 0 for s in sessions]),
        "total_bid_won_count": sum(s.get("bidWonCount") or 0 for s in sessions),
        "avg_gam_slot_render_count": avg([s.get("gamSlotRenderCount") or 0 for s in sessions]),
        "total_gam_slot_render_count": sum(s.get("gamSlotRenderCount") or 0 for s in sessions),
        "avg_gam_impression_viewable_count": avg([s.get("gamImpressionViewableCount") or 0 for s in sessions]),
        "total_gam_impression_viewable_count": sum(s.get("gamImpressionViewableCount") or 0 for s in sessions),
    }


def extract_total_impressions(perf_summary):
    """total_gam_slot_render_count (GPT's slotRenderEnded count -- the standard "ad
    impressions served" metric), or None if perf_summary itself is None."""
    return perf_summary["total_gam_slot_render_count"] if perf_summary else None


def average_metric_dicts(dicts):
    """Averages each numeric key across a list of extract_perf_summary()-shaped dicts
    (skipping any None entries per key). Returns None if the list is empty."""
    dicts = [d for d in dicts if d]
    if not dicts:
        return None
    keys = dicts[0].keys()
    out = {}
    for k in keys:
        vals = [d[k] for d in dicts if isinstance(d.get(k), (int, float))]
        out[k] = (sum(vals) / len(vals)) if vals else None
    return out


# ---------------------------------------------------------------------------
# Per-scenario run
# ---------------------------------------------------------------------------

# Logs consent lifecycle events (TCF/GDPR, USP/CCPA, GPP, plus a generic banner-visibility
# heuristic) with the "[iiq-experiment][consent]" tag, printed on the Python side via the
# console listener registered below. This is diagnostic only -- it never touches the actual
# consent decision, it just tells us when/whether one gets resolved.
CONSENT_LOG_INIT_SCRIPT = """
(function() {
  function log(msg) { try { console.log('[iiq-experiment][consent] ' + msg); } catch (e) {} }

  function pollApi(name, onFound, maxTries) {
    var tries = 0;
    var iv = setInterval(function() {
      tries++;
      if (typeof window[name] === 'function') {
        clearInterval(iv);
        onFound();
      } else if (tries > maxTries) {
        clearInterval(iv);
        log(name + ' never appeared after ' + (maxTries * 0.2).toFixed(0) + 's');
      }
    }, 200);
  }

  pollApi('__tcfapi', function() {
    log('__tcfapi (GDPR/TCF) detected');
    try {
      window.__tcfapi('addEventListener', 2, function(tcData, success) {
        if (success) {
          log('TCF event: ' + tcData.eventStatus + ' gdprApplies=' + tcData.gdprApplies +
              ' hasConsentString=' + (tcData.tcString ? 'yes' : 'no'));
        }
      });
    } catch (e) { log('__tcfapi addEventListener failed: ' + e); }
  }, 100); // ~20s

  pollApi('__uspapi', function() {
    log('__uspapi (CCPA/USP) detected');
    try {
      window.__uspapi('getUSPData', 1, function(uspData, success) {
        log('USP data: ' + JSON.stringify(uspData) + ' success=' + success);
      });
    } catch (e) { log('__uspapi getUSPData failed: ' + e); }
  }, 100);

  pollApi('__gpp', function() {
    log('__gpp (GPP) detected');
    try {
      window.__gpp('addEventListener', function(gppData, success) {
        var status = gppData && gppData.pingData ? gppData.pingData.signalStatus : gppData;
        log('GPP event: ' + JSON.stringify(status) + ' success=' + success);
      });
    } catch (e) { log('__gpp addEventListener failed: ' + e); }
  }, 100);

  // Generic fallback: watch for a consent-banner-shaped element appearing/disappearing,
  // in case the CMP doesn't expose one of the standard APIs above in time.
  var bannerSeen = false;
  setInterval(function() {
    var present = !!document.querySelector(
      '[id*="sp_message"],[class*="message-container"],iframe[title*="consent" i],iframe[title*="privacy" i]'
    );
    if (present && !bannerSeen) { bannerSeen = true; log('consent banner appeared (blocking?)'); }
    if (!present && bannerSeen) { bannerSeen = false; log('consent banner gone (resolved or auto-dismissed)'); }
  }, 1000);
})();
"""


async def wait_out_cloudflare_challenge(page, log_prefix: str) -> float:
    """
    Detects Cloudflare's "Just a moment... performing security verification" challenge page
    and waits for it to clear before returning, up to CLOUDFLARE_CHALLENGE_WAIT_TIMEOUT_S.
    Returns how many seconds were spent waiting (0.0 if no challenge was showing).

    This does NOT attempt to solve, click through, or otherwise bypass the challenge -- it
    only detects and waits it out (meaningful to actually solve by hand when HEADLESS=False).
    The point is to stop Cloudflare wait time from silently bleeding into the timed
    scroll/measurement window and inflating in-page timing metrics.
    """
    async def is_challenged():
        try:
            title = await page.title()
        except Exception:
            return False
        return "just a moment" in title.lower()

    if not await is_challenged():
        return 0.0

    print(
        f"[{log_prefix}] Cloudflare challenge showing"
        + ("" if not HEADLESS else " -- HEADLESS=True, so there's no one to solve it; "
           "this will just wait out the timeout and proceed anyway")
        + " -- waiting for it to clear before starting the timed run..."
    )
    start = time.monotonic()
    while time.monotonic() - start < CLOUDFLARE_CHALLENGE_WAIT_TIMEOUT_S:
        await asyncio.sleep(2)
        if not await is_challenged():
            waited = time.monotonic() - start
            print(f"[{log_prefix}] challenge cleared after {waited:.0f}s -- starting the timed run now")
            return waited
    waited = time.monotonic() - start
    print(f"[{log_prefix}] challenge still showing after {waited:.0f}s -- giving up waiting, proceeding anyway")
    return waited


async def capture_page_diagnostics(page):
    """End-of-run snapshot of whether Prebid/GAM's own globals were actually present, so a
    scenario with 0 GAM renders can be told apart from "the render listeners never had
    anything to attach to" versus "everything was present and it's a genuine zero"."""
    try:
        return await page.evaluate(
            """
            () => ({
              pbjsPresent: typeof window.pbjs !== 'undefined',
              installedModulesCount: (window.pbjs && window.pbjs.installedModules)
                ? window.pbjs.installedModules.length : null,
              googletagPresent: typeof window.googletag !== 'undefined',
              pubadsAvailable: !!(window.googletag && window.googletag.pubads),
              slotCount: (window.googletag && window.googletag.pubads)
                ? window.googletag.pubads().getSlots().length : null,
            })
            """
        )
    except Exception as e:
        return {"error": str(e)}


DUMP_LOCAL_STORAGE_JS = """
    () => {
      const out = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        out[k] = window.localStorage.getItem(k);
      }
      return out;
    }
    """


async def write_result_snapshot(
    page, log_prefix, url_dir: Path, name, scenario, target_url, cloudflare_wait_s,
    elapsed_s, in_progress: bool, retry_on_navigation: bool = False,
):
    """
    Dumps localStorage + derived metrics and (over)writes <url_dir>/<name>.json right now --
    called every SCROLL_SNAPSHOT_INTERVAL_S seconds during the run (in_progress=True) and
    once more at the very end (in_progress=False) so the file is watchable mid-run instead
    of only appearing once everything finishes.

    Returns (out_path, total_impressions, perf_metrics), or None if this particular snapshot
    had to be skipped (page was mid-navigation, e.g. a Cloudflare challenge resolving, and
    retry_on_navigation=False) -- the next periodic snapshot picks it back up. The FINAL
    snapshot is called with retry_on_navigation=True so it can't silently skip: it retries
    once so run_scenario always has a result to return.
    """
    try:
        local_storage = await page.evaluate(DUMP_LOCAL_STORAGE_JS)
    except Exception as e:
        msg = str(e).lower()
        transient = "context was destroyed" in msg or "navigat" in msg or "target closed" in msg
        if not transient:
            raise
        if retry_on_navigation:
            print(f"[{log_prefix}] navigation hit during snapshot -- retrying once")
            local_storage = await page.evaluate(DUMP_LOCAL_STORAGE_JS)
        else:
            print(f"[{log_prefix}] snapshot skipped at {elapsed_s:.0f}s (page mid-navigation)")
            return None

    perf_metrics = extract_perf_summary(local_storage)
    total_impressions = extract_total_impressions(perf_metrics)
    page_diagnostics = await capture_page_diagnostics(page)
    if not in_progress and perf_metrics is not None and total_impressions == 0 and not page_diagnostics.get("pubadsAvailable"):
        print(
            f"[{log_prefix}] NOTE: 0 GAM renders AND googletag/pubads was never available in "
            f"this page -- the render/viewable listeners likely never attached at all, so this "
            f"0 is probably a measurement gap, not a genuine zero. See page_diagnostics in the output."
        )

    url_dir.mkdir(parents=True, exist_ok=True)
    out_path = url_dir / f"{name}.json"
    out_path.write_text(
        json.dumps(
            {
                "scenario": name,
                "prebid_build_url": scenario["url"],
                "analytics_enabled": scenario["enable_analytics"],
                "target_url": target_url,
                "run_duration_seconds": RUN_DURATION_SECONDS,
                "elapsed_seconds": round(elapsed_s, 1),
                "in_progress": in_progress,
                "cloudflare_challenge_wait_seconds": cloudflare_wait_s,
                "total_impressions": total_impressions,
                "perf_metrics": perf_metrics,
                "page_diagnostics": page_diagnostics,
                "local_storage": local_storage,
            },
            indent=2,
        )
    )
    tag = "snapshot" if in_progress else "FINAL"
    print(
        f"[{log_prefix}] wrote {tag} {out_path} ({len(local_storage)} localStorage keys, "
        f"total_impressions={total_impressions})"
    )
    return out_path, total_impressions, perf_metrics


def make_init_script(enable_analytics: bool) -> str:
    if not enable_analytics:
        return "/* analytics intentionally left disabled for this scenario */"
    analytics_json = json.dumps(ANALYTICS_OPTIONS)
    return f"""
    window.pbjs = window.pbjs || {{}};
    window.pbjs.que = window.pbjs.que || [];
    window.pbjs.que.push(function() {{
      try {{
        window.pbjs.enableAnalytics([{analytics_json}]);
        console.log('[iiq-experiment] enableAnalytics fired');
      }} catch (e) {{
        console.error('[iiq-experiment] enableAnalytics failed: ' + e);
      }}
    }});
    """


def make_route_handler(log_prefix: str, build_url: str, prebid_re):
    async def handler(route: Route):
        request = route.request
        if not prebid_re.search(request.url):
            try:
                await route.continue_()
            except Exception as e:
                # The page/context may already be closing -- don't let this bubble up
                # and don't leave the request hanging either.
                print(f"[{log_prefix}][route] continue_() failed for {request.url}: {e}")
            return

        print(f"[{log_prefix}][route] redirecting {request.url} -> {build_url}")
        try:
            response = await route.fetch(url=build_url, timeout=FETCH_TIMEOUT_MS)
            await route.fulfill(response=response)
            print(f"[{log_prefix}][route] swap OK ({response.status})")
        except Exception as e:
            # This is almost certainly what was causing the hang: a failed fetch/fulfill
            # left the request permanently unresolved. Fall back to aborting it so the
            # page keeps loading (without the swap) instead of stalling forever.
            print(f"[{log_prefix}][route] SWAP FAILED for {request.url}: {e!r}")
            try:
                await route.abort()
            except Exception:
                pass

    return handler


async def run_scenario(browser, scenario: dict, target_url: str, prebid_re, url_dir: Path):
    name = scenario["name"]
    log_prefix = f"{slugify_url(target_url)}/{name}"
    print(f"[{log_prefix}] starting")

    context = await browser.new_context()
    page = await context.new_page()

    # Surface page-side errors instead of debugging blind, without drowning in ad-tech
    # console noise: our own [iiq-experiment] tags (analytics/consent) print live; every
    # other console error is counted (and, if it matches a known-noise pattern, labeled
    # as such) and only summarized once at the end of the run.
    error_counts: Counter = Counter()

    page.on("pageerror", lambda exc: print(f"[{log_prefix}][pageerror] {exc}"))

    def on_console(msg):
        if "iiq-experiment" in msg.text:
            print(f"[{log_prefix}][console] {msg.text}")
        elif msg.type == "error":
            error_counts[msg.text[:160]] += 1

    page.on("console", on_console)
    page.on(
        "requestfailed",
        lambda req: print(f"[{log_prefix}][requestfailed] {req.url} -- {req.failure}")
        if prebid_re.search(req.url) or "iiq-prebid-test.s3" in req.url
        else None,
    )

    # Queue the analytics-enable call (if any), and the consent-lifecycle logger, before
    # any page script runs.
    await page.add_init_script(make_init_script(scenario["enable_analytics"]))
    await page.add_init_script(CONSENT_LOG_INIT_SCRIPT)

    # Swap the production prebid.js bundle for this scenario's custom build on every
    # HTTP(S) request in this context (covers the initial load and any later re-fetch).
    # Scoped to http(s) only -- NOT a "**/*" glob -- so browser-internal schemes like
    # blob:/data: (some pages use blob: for lazy-loaded images) never touch our handler.
    # WebKit's routing has weaker support for intercepting those than Chromium's, and
    # forcing them through route.continue_() can break them outright.
    await context.route(
        lambda url: url.startswith("http://") or url.startswith("https://"),
        make_route_handler(log_prefix, scenario["url"], prebid_re),
    )

    print(f"[{log_prefix}] navigating...")
    await page.goto(target_url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    print(f"[{log_prefix}] page loaded (domcontentloaded)")

    # Wait out any Cloudflare challenge BEFORE starting the timed portion of the run, so
    # challenge-solve time doesn't bleed into in-page timing metrics (e.g. vrCallDurationMs).
    cloudflare_wait_s = await wait_out_cloudflare_challenge(page, log_prefix)

    if ACCEPT_CONSENT and CONSENT_ACCEPT_SELECTOR:
        try:
            await page.click(CONSENT_ACCEPT_SELECTOR, timeout=5000)
        except Exception:
            pass  # best-effort only

    # Slow, continuous top -> bottom -> top scroll for the run duration, driven entirely
    # in-page so it isn't affected by round-trip latency to this script -- but run in
    # SCROLL_SNAPSHOT_INTERVAL_S-sized chunks (rather than one long call for the whole
    # duration) so we can re-dump localStorage and rewrite the result file after every
    # chunk: the file is watchable mid-run instead of only appearing once everything
    # finishes.
    #
    # This chunking also naturally handles a real page navigation happening mid-run --
    # e.g. solving a Cloudflare "verify you are human" challenge, which redirects to the
    # real page once passed. That destroys the JS execution context a chunk's evaluate()
    # is running in, and Playwright raises an error for it; that's not a real failure, so
    # we catch it specifically and just move on to the next chunk (wall clock, not the
    # JS side's own counter, tracks how much time is actually left).
    scroll_start = time.monotonic()
    last_result = None
    while True:
        elapsed_s = time.monotonic() - scroll_start
        remaining_s = RUN_DURATION_SECONDS - elapsed_s
        if remaining_s <= 0:
            break
        chunk_s = min(SCROLL_SNAPSHOT_INTERVAL_S, remaining_s)
        try:
            await page.evaluate(
                """
                ([durationMs, stepPx, intervalMs]) => new Promise((resolve) => {
                  const start = Date.now();
                  let direction = 1;
                  const timer = setInterval(() => {
                    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                    window.scrollBy(0, direction * stepPx);
                    if (window.scrollY >= maxScroll - 2) direction = -1;
                    if (window.scrollY <= 0) direction = 1;
                    if (Date.now() - start >= durationMs) {
                      clearInterval(timer);
                      resolve('done');
                    }
                  }, intervalMs);
                })
                """,
                [chunk_s * 1000, SCROLL_STEP_PX, SCROLL_INTERVAL_MS],
            )
        except Exception as e:
            msg = str(e).lower()
            if "context was destroyed" in msg or "navigat" in msg or "target closed" in msg:
                print(
                    f"[{log_prefix}] scroll interrupted by a page navigation at {elapsed_s:.0f}s "
                    f"(likely a Cloudflare challenge resolving) -- resuming"
                )
                continue
            raise

        elapsed_s = time.monotonic() - scroll_start
        print(f"[{log_prefix}] still scrolling... {elapsed_s:.0f}s / {RUN_DURATION_SECONDS}s")
        snapshot = await write_result_snapshot(
            page, log_prefix, url_dir, name, scenario, target_url, cloudflare_wait_s,
            elapsed_s, in_progress=True,
        )
        if snapshot:
            last_result = snapshot

    print(f"[{log_prefix}] scroll loop finished")

    if error_counts:
        total = sum(error_counts.values())
        print(f"[{log_prefix}] {total} other console error(s) during the run (top {min(8, len(error_counts))} shown):")
        for text, count in error_counts.most_common(8):
            known = any(p.search(text) for p in KNOWN_NOISE_PATTERNS)
            tag = "known ad-tech noise" if known else "unrecognized -- worth a look"
            print(f"    x{count:<4} [{tag}] {text}")

    # Final snapshot: retries once on a mid-flight navigation instead of skipping, since
    # this result (not a periodic one) is what gets returned and aggregated.
    final = await write_result_snapshot(
        page, log_prefix, url_dir, name, scenario, target_url, cloudflare_wait_s,
        RUN_DURATION_SECONDS, in_progress=False, retry_on_navigation=True,
    )
    out_path, total_impressions, perf_metrics = final or last_result

    await context.close()
    return name, out_path, total_impressions, perf_metrics


async def run_scenario_safe(browser, scenario: dict, target_url: str, prebid_re, url_dir: Path):
    try:
        return await run_scenario(browser, scenario, target_url, prebid_re, url_dir)
    except Exception:
        print(f"[{slugify_url(target_url)}/{scenario['name']}] FAILED:")
        traceback.print_exc()
        return None


async def run_target_url(browser, target_url: str):
    url_dir = OUTPUT_DIR / slugify_url(target_url)
    url_dir.mkdir(parents=True, exist_ok=True)

    prebid_re = get_prebid_url_re(target_url)
    if target_url not in PREBID_URL_OVERRIDES:
        print(
            f"[{target_url}] NOTE: no verified Prebid-bundle URL pattern for this target -- "
            f"using the generic fallback ({DEFAULT_PREBID_URL_RE.pattern!r}). Confirm it actually "
            f"matches this site's real Prebid request (check the '[route] redirecting ...' lines "
            f"below actually fire) before trusting these results, and add a verified entry to "
            f"PREBID_URL_OVERRIDES once you've confirmed it."
        )

    results = await asyncio.gather(
        *(run_scenario_safe(browser, s, target_url, prebid_re, url_dir) for s in SCENARIOS)
    )
    ok = [r for r in results if r]
    failed = [SCENARIOS[i]["name"] for i, r in enumerate(results) if not r]

    print(f"\n[{target_url}] {len(ok)}/{len(SCENARIOS)} scenarios finished.")
    for _, path, impressions, _ in ok:
        print(f"  OK   {path}  (total_impressions={impressions})")
    for name in failed:
        print(f"  FAIL {name} for {target_url} (see traceback above)")

    summary = {
        name: {"total_impressions": impressions, "metrics": metrics}
        for name, _, impressions, metrics in ok
    }
    for name in failed:
        summary[name] = {"total_impressions": None, "metrics": None}  # ran but produced
        # nothing -- distinct from a measured 0
    summary_path = url_dir / "summary_impressions.json"
    summary_path.write_text(json.dumps(summary, indent=2))
    print(f"[{target_url}] wrote {summary_path}")

    return target_url, summary


async def main():
    started = time.time()
    async with async_playwright() as p:
        browser_type = getattr(p, BROWSER_ENGINE)
        launch_kwargs = {"headless": HEADLESS}
        if DEVTOOLS:
            if BROWSER_ENGINE == "chromium":
                launch_kwargs["devtools"] = True
            else:
                print(
                    f"NOTE: DEVTOOLS=True has no effect -- Playwright only supports "
                    f"auto-opening DevTools for Chromium, and BROWSER_ENGINE is {BROWSER_ENGINE!r}."
                )
        browser = await browser_type.launch(**launch_kwargs)
        try:
            url_results = await asyncio.gather(
                *(run_target_url(browser, url) for url in TARGET_URLS)
            )
        finally:
            await browser.close()

    elapsed = time.time() - started
    print(f"\nAll {len(TARGET_URLS)} target URL(s) finished in {elapsed/60:.1f} min.")

    # Root-level summary: average total_impressions AND every other perf metric per
    # scenario, across every target URL that produced data for it.
    values_by_scenario = {s["name"]: [] for s in SCENARIOS}
    metrics_by_scenario = {s["name"]: [] for s in SCENARIOS}
    urls_seen_by_scenario = {s["name"]: 0 for s in SCENARIOS}
    for _, summary in url_results:
        for name, entry in summary.items():
            urls_seen_by_scenario[name] += 1
            if entry["total_impressions"] is not None:
                values_by_scenario[name].append(entry["total_impressions"])
            if entry["metrics"] is not None:
                metrics_by_scenario[name].append(entry["metrics"])

    averages = {}
    for name, values in values_by_scenario.items():
        averages[name] = {
            "average_impressions": (sum(values) / len(values)) if values else None,
            "urls_with_data": len(values),
            "urls_total": urls_seen_by_scenario[name],
            "average_metrics": average_metric_dicts(metrics_by_scenario[name]),
        }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cross_url_summary_path = OUTPUT_DIR / "summary_across_urls.json"
    cross_url_summary_path.write_text(
        json.dumps(
            {
                "target_urls": TARGET_URLS,
                "run_duration_seconds": RUN_DURATION_SECONDS,
                "average_impressions_by_scenario": averages,
            },
            indent=2,
        )
    )
    print(f"\nWrote {cross_url_summary_path}")
    print(
        "average_impressions is per-scenario, averaged across every target URL that produced "
        "data for it (urls_with_data / urls_total shows how many that was) -- null only if "
        "EVERY target URL failed to produce iiq_perf_* data for that scenario."
    )


if __name__ == "__main__":
    asyncio.run(main())
