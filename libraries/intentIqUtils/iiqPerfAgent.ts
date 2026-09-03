/**
 * Local-only performance instrumentation used to A/B compare different builds of the
 * IntentIQ Prebid modules (see the internal perf-testing plan). This file NEVER makes a
 * network call — every metric is written to localStorage only (via the same
 * storageManager-gated `storage` instance the ID module itself already uses, so it
 * respects the same consent/activity-control checks), so it is safe to run on a live
 * production page.
 *
 * How it works:
 * - Set PERF_SCENARIO below to a short tag identifying the build/config under test
 *   (e.g. 'prod-baseline', 'prod-analytics-on', 'custom-with-analytics',
 *   'custom-with-cmp-mismatch'). Change it before each build you swap in via a browser
 *   local override, otherwise sessions from different builds will land in the same bucket.
 * - Each page load appends one session record to `iiq_perf_<PERF_SCENARIO>` in
 *   localStorage, updated in place as marks come in (so a record is never lost even if
 *   the tab is closed mid-session).
 * - `window.__iiqPerfSummary()` prints per-scenario counts/averages across every
 *   scenario bucket seen so far, so you can check progress mid-run.
 * - `window.__iiqPerfRaw(scenario?)` returns the raw session arrays (all scenarios, or
 *   just one) if you want to export/inspect them directly.
 * - `window.__iiqPerfClear(scenario?)` clears one scenario's bucket, or all of them.
 */

import { storage } from './storageUtils.ts';

// >>> Set this per build before swapping it in via a local override. <<<
export const PERF_SCENARIO = 'custom-with-analytics';

const STORAGE_PREFIX = 'iiq_perf_';
const SCENARIOS_INDEX_KEY = '_iiq_perf_scenarios_index';
const STORAGE_KEY = STORAGE_PREFIX + PERF_SCENARIO;
const MAX_SESSIONS_STORED = 500; // caps localStorage growth over a multi-hour run

interface PerfSession {
  ts: number;
  scenario: string;
  url: string;
  /** Timestamp the IntentIQ ID-resolution ("VR") server call was fired, if any. */
  vrCallStartedAt: number | null;
  /** Round-trip duration of that call in ms (null if no server call was made this session). */
  vrCallDurationMs: number | null;
  /** Timestamp EIDs were handed back to Prebid via the userId callback. */
  eidsReadyAt: number | null;
  /** eidsReadyAt - vrCallStartedAt, only set when a server call was actually made. */
  timeToEidsMs: number | null;
  bidWonCount: number;
  gamSlotRenderCount: number;
  gamImpressionViewableCount: number;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    return fallback;
  }
}

function readKey<T>(key: string, fallback: T): T {
  try {
    if (!storage.hasLocalStorage()) return fallback;
    return safeParse<T>(storage.getDataFromLocalStorage(key), fallback);
  } catch (e) {
    return fallback;
  }
}

function writeKey(key: string, value: unknown): void {
  try {
    if (!storage.hasLocalStorage()) return;
    storage.setDataInLocalStorage(key, JSON.stringify(value));
  } catch (e) {
    // best-effort only; instrumentation must never throw into the real module logic
  }
}

function registerScenario(scenario: string): void {
  const known = readKey<string[]>(SCENARIOS_INDEX_KEY, []);
  if (!known.includes(scenario)) {
    known.push(scenario);
    writeKey(SCENARIOS_INDEX_KEY, known);
  }
}

let sessions: PerfSession[] = [];
let current: PerfSession | null = null;

function persist(): void {
  const capped = sessions.slice(-MAX_SESSIONS_STORED);
  writeKey(STORAGE_KEY, capped);
}

function ensureSession(): PerfSession {
  if (!current) {
    sessions = readKey<PerfSession[]>(STORAGE_KEY, []);
    registerScenario(PERF_SCENARIO);
    current = {
      ts: Date.now(),
      scenario: PERF_SCENARIO,
      url: (typeof location !== 'undefined' && location.href) || '',
      vrCallStartedAt: null,
      vrCallDurationMs: null,
      eidsReadyAt: null,
      timeToEidsMs: null,
      bidWonCount: 0,
      gamSlotRenderCount: 0,
      gamImpressionViewableCount: 0
    };
    sessions.push(current);
    persist();
  }
  return current;
}

export function markVrCallStart(): void {
  try {
    const s = ensureSession();
    s.vrCallStartedAt = Date.now();
    persist();
  } catch (e) { /* best-effort only */ }
}

export function markVrCallDuration(durationMs: number): void {
  try {
    const s = ensureSession();
    s.vrCallDurationMs = durationMs;
    persist();
  } catch (e) { /* best-effort only */ }
}

export function markEidsReady(): void {
  try {
    const s = ensureSession();
    s.eidsReadyAt = Date.now();
    if (s.vrCallStartedAt != null) {
      s.timeToEidsMs = s.eidsReadyAt - s.vrCallStartedAt;
    }
    persist();
  } catch (e) { /* best-effort only */ }
}

export function recordBidWon(): void {
  try {
    const s = ensureSession();
    s.bidWonCount += 1;
    persist();
  } catch (e) { /* best-effort only */ }
}

export function recordGamSlotRender(): void {
  try {
    const s = ensureSession();
    s.gamSlotRenderCount += 1;
    persist();
  } catch (e) { /* best-effort only */ }
}

export function recordGamImpressionViewable(): void {
  try {
    const s = ensureSession();
    s.gamImpressionViewableCount += 1;
    persist();
  } catch (e) { /* best-effort only */ }
}

function attachPbjsBidWonListener(): void {
  try {
    const pbjs = (window as any).pbjs;
    if (pbjs && typeof pbjs.onEvent === 'function') {
      pbjs.onEvent('bidWon', () => recordBidWon());
    } else {
      // pbjs not global yet (unlikely from inside a pbjs module, but be defensive)
      setTimeout(attachPbjsBidWonListener, 250);
    }
  } catch (e) { /* best-effort only */ }
}

function attachGamListeners(retriesLeft = 40): void {
  try {
    const gt = (window as any).googletag;
    if (!gt || !gt.pubads) {
      if (retriesLeft > 0) setTimeout(() => attachGamListeners(retriesLeft - 1), 500);
      return;
    }
    gt.cmd = gt.cmd || [];
    gt.cmd.push(() => {
      try {
        gt.pubads().addEventListener('slotRenderEnded', () => recordGamSlotRender());
        gt.pubads().addEventListener('impressionViewable', () => recordGamImpressionViewable());
      } catch (e) { /* best-effort only */ }
    });
  } catch (e) { /* best-effort only */ }
}

function summarize(): Record<string, any> {
  const out: Record<string, any> = {};
  try {
    const scenarios = readKey<string[]>(SCENARIOS_INDEX_KEY, []);
    scenarios.forEach((scenario) => {
      const list = readKey<PerfSession[]>(STORAGE_PREFIX + scenario, []);
      const nums = (vals: Array<number | null>): number[] =>
        vals.filter((v): v is number => v != null);
      const avg = (vals: number[]): number | null =>
        vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

      out[scenario] = {
        sessions: list.length,
        avgVrCallDurationMs: avg(nums(list.map((s) => s.vrCallDurationMs))),
        avgTimeToEidsMs: avg(nums(list.map((s) => s.timeToEidsMs))),
        serverCallRate: list.length
          ? nums(list.map((s) => s.vrCallStartedAt)).length / list.length
          : null,
        avgBidWonCount: avg(list.map((s) => s.bidWonCount)),
        avgGamSlotRenderCount: avg(list.map((s) => s.gamSlotRenderCount)),
        avgGamImpressionViewableCount: avg(list.map((s) => s.gamImpressionViewableCount)),
        totalBidWonCount: list.reduce((a, s) => a + s.bidWonCount, 0),
        totalGamSlotRenderCount: list.reduce((a, s) => a + s.gamSlotRenderCount, 0),
        totalGamImpressionViewableCount: list.reduce((a, s) => a + s.gamImpressionViewableCount, 0)
      };
    });
  } catch (e) { /* best-effort only */ }
  return out;
}

function exposeGlobals(): void {
  try {
    (window as any).__iiqPerfSummary = summarize;
    (window as any).__iiqPerfRaw = (scenario?: string) => {
      if (scenario) return readKey<PerfSession[]>(STORAGE_PREFIX + scenario, []);
      const out: Record<string, PerfSession[]> = {};
      readKey<string[]>(SCENARIOS_INDEX_KEY, []).forEach((s) => {
        out[s] = readKey<PerfSession[]>(STORAGE_PREFIX + s, []);
      });
      return out;
    };
    (window as any).__iiqPerfClear = (scenario?: string) => {
      try {
        if (scenario) {
          storage.removeDataFromLocalStorage(STORAGE_PREFIX + scenario);
          const remaining = readKey<string[]>(SCENARIOS_INDEX_KEY, []).filter((s) => s !== scenario);
          writeKey(SCENARIOS_INDEX_KEY, remaining);
          return;
        }
        readKey<string[]>(SCENARIOS_INDEX_KEY, []).forEach((s) => storage.removeDataFromLocalStorage(STORAGE_PREFIX + s));
        storage.removeDataFromLocalStorage(SCENARIOS_INDEX_KEY);
      } catch (e) { /* best-effort only */ }
    };
  } catch (e) { /* best-effort only */ }
}

function init(): void {
  exposeGlobals();
  attachPbjsBidWonListener();
  attachGamListeners();
}

init();
