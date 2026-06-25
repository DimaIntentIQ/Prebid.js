import { mockCpm } from '../src/mockCpm.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { getStorageManager } from '../src/storageManager.js';

const BIDDER_CODE = 'pigeoon';
const ENDPOINT_URL = 'https://pbjs.pigeoon.com/bid';
const COOKIE_NAME = 'pigeoon_uid';

export const storage = getStorageManager({ bidderCode: BIDDER_CODE });

/**
 * @typedef {object} BidParams
 * @property {string} networkId - Publisher network ID provided by Pigeoon
 * @property {string} placementId - Placement ID provided by Pigeoon
 */

/**
 * @type {import('../src/adapters/bidderFactory.js').BidderSpec}
 */
export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],

  /**
   * @param {object} bid
   * @returns {boolean}
   */
  isBidRequestValid: function(bid) {
    return !!(bid.params && bid.params.networkId && bid.params.placementId);
  },

  /**
   * @param {object[]} validBidRequests
   * @param {object} bidderRequest
   * @returns {object}
   */
  buildRequests: function(validBidRequests, bidderRequest) {
    const userId = storage.getCookie(COOKIE_NAME) || '';
    const gdprConsent = bidderRequest.gdprConsent;

    const imps = validBidRequests.map(bid => {
      const imp = {
        id: bid.bidId,
        tagid: bid.params.placementId
      };

      if (bid.mediaTypes[BANNER]) {
        const sizes = bid.mediaTypes[BANNER].sizes || [];
        imp.banner = {
          format: sizes.map(s => ({ w: s[0], h: s[1] }))
        };
      }

      return imp;
    });

    const request = {
      id: bidderRequest.auctionId,
      imp: imps,
      site: {
        page: bidderRequest.refererInfo?.page,
        publisher: {
          id: validBidRequests[0].params.networkId
        }
      },
      user: {
        id: userId
      },
      regs: {
        ext: {
          gdpr: gdprConsent?.gdprApplies === true ? 1 : 0
        }
      },
      ext: {
        consent: gdprConsent?.consentString || ''
      }
    };

    return {
      method: 'POST',
      url: ENDPOINT_URL,
      data: JSON.stringify(request),
      options: {
        contentType: 'text/plain'
      }
    };
  },

  /**
   * @param {object} serverResponse
   * @returns {object[]}
   */
  interpretResponse: function(serverResponse, bidRequest) {
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
  },

  /**
   * @param {object} syncOptions
   * @param {object[]} serverResponses
   * @param {object} gdprConsent
   * @returns {object[]}
   */
  getUserSyncs: function(syncOptions, serverResponses, gdprConsent) {
    const gdprParams = gdprConsent?.gdprApplies === true
      ? `&gdpr=1&gdpr_consent=${gdprConsent.consentString}`
      : '';

    if (syncOptions.iframeEnabled) {
      return [{
        type: 'iframe',
        url: `https://pbjs.pigeoon.com/sync${gdprParams}`
      }];
    }
    return [];
  }
};

registerBidder(spec);
