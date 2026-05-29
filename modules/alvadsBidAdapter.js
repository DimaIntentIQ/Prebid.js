import { registerBidder } from '../src/adapters/bidderFactory.js';
import * as utils from '../src/utils.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
const BIDDER_CODE = 'alvads';
const ENDPOINT_BANNER = 'https://helios-ads-qa-core.ssidevops.com/decision/openrtb';

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, VIDEO],
  isBidRequestValid: (bid) => {
    return Boolean(
      bid.params &&
      bid.params.publisherId &&
      (bid.mediaTypes?.[BANNER] ? bid.params.tagid : true)
    );
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    return validBidRequests.map(bid => {
      const floorInfo = (typeof bid.getFloor === 'function')
        ? bid.getFloor({
          currency: 'USD',
          mediaType: bid.mediaTypes?.banner ? BANNER : VIDEO,
          size: '*'
        })
        : { floor: 0, currency: 'USD' };

      const imps = [];
      // Banner
      if (bid.mediaTypes?.banner) {
        const sizes = utils.parseSizesInput(bid.mediaTypes.banner.sizes || bid.sizes)
          .map(s => {
            const parts = s.split('x').map(Number);
            return { w: parts[0], h: parts[1] };
          });

        sizes.forEach(size => {
          imps.push({
            id: bid.bidId,
            banner: { w: size.w, h: size.h },
            tagid: bid.params.tagid,
            bidfloor: floorInfo.floor,
            bidfloorcur: floorInfo.currency,
            ext: { userId: bid.params.userId }
          });
        });
      }

      // Video
      if (bid.mediaTypes?.video) {
        const wh = (bid.mediaTypes.video.playerSize && bid.mediaTypes.video.playerSize[0]) || [1280, 720];
        imps.push({
          id: bid.bidId,
          video: { w: wh[0], h: wh[1] },
          tagid: bid.params.tagid,
          bidfloor: floorInfo.floor,
          bidfloorcur: floorInfo.currency,
          ext: { userId: bid.params.userId }
        });
      }

      // Payload OpenRTB por bid
      const payload = {
        id: 'REQ-OPENRTB-' + Date.now(),
        site: {
          page: bidderRequest.refererInfo.page,
          ref: bidderRequest.refererInfo.ref,
          publisher: { id: bid.params.publisherId }
        },
        imp: imps,
        device: {
          ua: navigator.userAgent
        },
        user: {
          id: bid.params.userId || utils.generateUUID(),
          buyeruid: utils.generateUUID()
        },
        regs: {
          gpp: '',
          gpp_sid: [],
          ext: {
            gdpr: Number(bidderRequest.gdprConsent?.gdprApplies)
          }
        },
        ext: {
          user_fingerprint: utils.generateUUID()
        }
      };
      const endpoint = bid.params.endpoint || ENDPOINT_BANNER;

      return {
        method: 'POST',
        url: endpoint,
        data: JSON.stringify(payload),
        options: { withCredentials: false }
      };
    });
  },

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

  onTimeout: (timeoutData) => {
    utils.logWarn('Timeout  bids ALVA:', timeoutData);
  },

  onBidWon: (bid) => {
    utils.logInfo('Bid winner ALVA:', bid);
  }
};

registerBidder(spec);
