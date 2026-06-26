let _config = null;

function parse() {
  try {
    const param = new URLSearchParams(window.location.search).get('bidders');
    return param ? JSON.parse(decodeURIComponent(param)) : {};
  } catch (e) {
    return {};
  }
}

// Returns 'wins' | 'no_bid' | 'below_floor' | 'no_floor' | null
export function getBidderMode(bidderCode) {
  if (!_config) _config = parse();
  return _config[bidderCode] || null;
}
