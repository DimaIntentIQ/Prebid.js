import { registerBidder } from '../src/adapters/bidderFactory.js';
import * as utils from '../src/utils.js';
import { BANNER } from '../src/mediaTypes.js';

const ENDPOINT_URL = 'https://s2s.yieldlove-ad-serving.net/openrtb2/auction';

const DEFAULT_BID_TTL = 300; /* 5 minutes */
const DEFAULT_CURRENCY = 'EUR';

const participatedBidders = []

export const spec = {
  gvlid: 251,
  code: 'yieldlove',
  aliases: [],
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function (bid) {
    return !!(bid.params.pid && bid.params.rid)
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    const anyValidBidRequest = validBidRequests[0]

    const impressions = validBidRequests.map(bidRequest => {
      return {
        ext: {
          prebid: {
            storedrequest: {
              id: bidRequest.params.pid?.toString()
            }
          }
        },
        banner: {
          format: bidRequest.sizes.map(sizeArr => ({
            w: sizeArr[0],
            h: sizeArr[1],
          }))
        },
        secure: 1,
        id: bidRequest.bidId
      }
    })

    const s2sRequest = {
      device: {
        ua: window.navigator.userAgent,
        w: utils.getWinDimensions().innerWidth,
        h: utils.getWinDimensions().innerHeight,
      },
      site: {
        ver: '1.9.0',
        publisher: {
          id: anyValidBidRequest.params.rid
        },
        page: window.location.href,
        domain: anyValidBidRequest.params.rid
      },
      ext: {
        prebid: {
          targeting: {},
          cache: {
            bids: {}
          },
          storedrequest: {
            id: anyValidBidRequest.params.rid
          },
        }
      },
      user: {
        ext: {
          consent: bidderRequest.gdprConsent?.consentString
        },
      },
      id: utils.generateUUID(),
      imp: impressions,
      regs: {
        ext: {
          gdpr: 1
        }
      }
    }

    return {
      method: 'POST',
      url: ENDPOINT_URL,
      data: s2sRequest,
      options: {
        contentType: 'text/plain',
        withCredentials: true
      },
    };
  },

  interpretResponse: function (serverResponse) {
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

  getUserSyncs: function (syncOptions, serverResponses, gdprConsent, uspConsent) {
    const syncs = []

    let gdprParams = ''
    gdprParams = `gdpr=${Number(gdprConsent?.gdprApplies)}&`
    gdprParams += `gdpr_consent=${gdprConsent?.consentString || ''}`

    let bidderParams = ''
    if (participatedBidders.length > 0) {
      bidderParams = `bidders=${participatedBidders.join(',')}`
    }

    syncs.push({
      type: 'iframe',
      url: `https://cdn-a.yieldlove.com/load-cookie.html?endpoint=yieldlove&max_sync_count=100&${gdprParams}&${bidderParams}`
    })

    return syncs
  },

};

registerBidder(spec);
