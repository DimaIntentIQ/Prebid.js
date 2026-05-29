import { isArray, setOnAny } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 * @typedef {import('../src/adapters/bidderFactory.js').validBidRequests} validBidRequests
 * @typedef {import('../src/adapters/bidderFactory.js').ServerResponse} ServerResponse
 * @typedef {import('../src/adapters/bidderFactory.js').SyncOptions} SyncOptions
 * @typedef {import('../src/adapters/bidderFactory.js').UserSync} UserSync
 */

const BIDDER_CODE = 'codefuel';
const CURRENCY = 'USD';

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],
  aliases: ['ex'], // short code
  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {BidRequest} bid The bid params to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function(bid) {
    if (bid.nativeParams) {
      return false;
    }
    return !!(bid.params.placementId || (bid.params.member && bid.params.invCode));
  },
  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {validBidRequests} validBidRequests - an array of bids
   * @return ServerRequest Info describing the request to the server.
   */
  buildRequests: function(validBidRequests, bidderRequest) {
    const page = bidderRequest.refererInfo.page;
    const domain = bidderRequest.refererInfo.domain;
    const ua = navigator.userAgent;
    const devicetype = getDeviceType()
    const publisher = setOnAny(validBidRequests, 'params.publisher');
    const cur = CURRENCY;
    const endpointUrl = 'https://ai-p-codefuel-ds-rtb-us-east-1-k8s.seccint.com/prebid'
    const timeout = bidderRequest.timeout;

    validBidRequests.forEach(bid => {
      bid.netRevenue = 'net';
    });

    const imps = validBidRequests.map((bid, idx) => {
      const imp = {
        id: idx + 1 + ''
      }

      if (bid.params.tagid) {
        imp.tagid = bid.params.tagid
      }

      if (bid.sizes) {
        imp.banner = {
          format: transformSizes(bid.sizes)
        }
      }

      return imp;
    });

    const request = {
      id: bidderRequest.bidderRequestId,
      site: { page, domain, publisher },
      device: { ua, devicetype },
      source: { fd: 1 },
      cur: [cur],
      tmax: timeout,
      imp: imps,
    };

    return {
      method: 'POST',
      url: endpointUrl,
      data: request,
      bids: validBidRequests,
      options: {
        withCredentials: false
      }
    };
  },
  /**
   * Unpack the response from the server into a list of bids.
   *
   * @param {ServerResponse} serverResponse A successful response from the server.
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretResponse: (serverResponse, bidRequest) => {
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
        cpm: 4.00,
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
  },

  /**
   * Register the user sync pixels which should be dropped after the auction.
   *
   * @param {SyncOptions} syncOptions Which user syncs are allowed?
   * @param {ServerResponse[]} serverResponses List of server's responses.
   * @return {UserSync[]} The user syncs which should be dropped.
   */
  getUserSyncs: function(syncOptions, serverResponses, gdprConsent, uspConsent) {
    return [];
  }

}
registerBidder(spec);

function getDeviceType() {
  if ((/ipad|android 3.0|xoom|sch-i800|playbook|tablet|kindle/i.test(navigator.userAgent.toLowerCase()))) {
    return 5; // 'tablet'
  }
  if ((/iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(navigator.userAgent.toLowerCase()))) {
    return 4; // 'mobile'
  }
  return 2; // 'desktop'
}

function flatten(arr) {
  return [].concat(...arr);
}

/* Turn bid request sizes into ut-compatible format */
function transformSizes(requestSizes) {
  if (!isArray(requestSizes)) {
    return [];
  }

  if (requestSizes.length === 2 && !isArray(requestSizes[0])) {
    return [{
      w: parseInt(requestSizes[0], 10),
      h: parseInt(requestSizes[1], 10)
    }];
  } else if (isArray(requestSizes[0])) {
    return requestSizes.map(item =>
      ({
        w: parseInt(item[0], 10),
        h: parseInt(item[1], 10)
      })
    );
  }

  return [];
}
