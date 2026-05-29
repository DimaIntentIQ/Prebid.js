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
  interpretResponse: function(serverResponse) {
    return [
      {
        requestId: '06d655ff-9c15-426f-a363-fe012037af02',
        cpm: 4.00,
        width: 300,
        height: 250,
        ad: '<div style="width:300px;height:250px;background:#0a0;color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px sans-serif;">TL WIN 300x250</div>',
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
      }
    ];
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
