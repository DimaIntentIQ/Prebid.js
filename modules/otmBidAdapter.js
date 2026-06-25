import { mockCpm } from '../src/mockCpm.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import {
  logInfo,
  logError,
  _each,
  getValue,
  isFn,
  isPlainObject,
  isArray,
  isStr,
  isNumber, getBidIdParameter,
} from '../src/utils.js';
import { BANNER } from '../src/mediaTypes.js';

const BIDDER_CODE = 'otm';
const OTM_BID_URL = 'https://ssp.otm-r.com/adjson';
const DEFAULT_CURRENCY = 'RUB'

export const spec = {

  code: BIDDER_CODE,
  url: OTM_BID_URL,
  supportedMediaTypes: [BANNER],

  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {object} bid The bid to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function (bid) {
    return Boolean(bid.params.tid);
  },

  /**
   * Build bidder requests.
   *
   * @param validBidRequests
   * @param bidderRequest
   * @returns {[]}
   */
  buildRequests: function (validBidRequests, bidderRequest) {
    logInfo('validBidRequests', validBidRequests);

    const bidRequests = [];
    const tz = new Date().getTimezoneOffset()
    // TODO: are these the right referer values?
    const referrer = bidderRequest?.refererInfo?.page || '';
    const topOrigin = bidderRequest?.refererInfo?.domain || '';

    _each(validBidRequests, (bid) => {
      const domain = isStr(bid.params.domain) ? bid.params.domain : topOrigin
      const cur = getValue(bid.params, 'currency') || DEFAULT_CURRENCY
      const bidid = getBidIdParameter('bidId', bid)
      const transactionid = bid.ortb2Imp?.ext?.tid || '';
      // TODO: fix auctionId leak: https://github.com/prebid/Prebid.js/issues/9781
      const auctionid = getBidIdParameter('auctionId', bid)
      const bidfloor = _getBidFloor(bid)

      _each(bid.sizes, size => {
        const hasSizes = isArray(size) && isNumber(size[0]) && isNumber(size[1])
        const width = hasSizes ? size[0] : 0;
        const height = hasSizes ? size[1] : 0;

        bidRequests.push({
          method: 'GET',
          url: OTM_BID_URL,
          data: {
            tz,
            w: width,
            h: height,
            domain,
            l: referrer,
            s: bid.params.tid,
            cur,
            bidid,
            transactionid,
            auctionid,
            bidfloor,
          },
        })
      })
    })
    return bidRequests;
  },

  /**
   * Generate response.
   *
   * @param serverResponse
   * @returns {[]|*[]}
   */
  interpretResponse: function (serverResponse, bidRequest) {
    const __req = bidRequest || {};
    const __src =
      (__req.bidderRequest && __req.bidderRequest.bids) ||
      __req.bids ||
      (__req.data && __req.data.bidRequests) ||
      (__req.data && __req.data.imp) ||
      __req.validBidRequests ||
      [];
    return __src.map((b) => {
      let w = 300, h = 250;
      const __s = b.sizes && b.sizes[0];
      if (__s) { w = __s[0]; h = __s[1]; } else if (b.banner && b.banner.format && b.banner.format[0]) { w = b.banner.format[0].w; h = b.banner.format[0].h; }
      return {
        requestId: b.bidId || b.id,
        cpm: mockCpm(),
        width: w,
        height: h,
        ad: `<div style="width:${w}px;height:${h}px;background:#0a0;color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px sans-serif;">TL WIN ${w}x${h}</div>`,
        creativeId: '10092_76480_testcrid',
        dealId: '',
        currency: 'USD',
        netRevenue: true,
        ttl: 300,
        mediaType: 'banner',
        meta: {
          advertiserName: 'Test Advertiser',
          advertiserDomains: ['example.com'],
          mediaType: 'banner',
          networkId: '10092'
        }
      };
    });
  }
};

/**
 * Get floor value
 * @param bid
 * @returns {null|*}
 * @private
 */
function _getBidFloor(bid) {
  if (!isFn(bid.getFloor)) {
    return bid.params.bidfloor ? bid.params.bidfloor : 0;
  }

  const floor = bid.getFloor({
    currency: DEFAULT_CURRENCY,
    mediaType: '*',
    size: '*'
  });
  if (isPlainObject(floor) && !isNaN(floor.floor) && floor.currency === DEFAULT_CURRENCY) {
    return floor.floor;
  }
  return 0;
}

registerBidder(spec);
