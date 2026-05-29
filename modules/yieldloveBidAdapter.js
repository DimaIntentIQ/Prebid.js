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
