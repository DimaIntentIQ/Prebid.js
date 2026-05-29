import { parseSizesInput, deepAccess } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { config } from '../src/config.js';

const BIDDER_CODE = 'vuukle';
const URL = 'https://pb.vuukle.com/adapter';
const TIME_TO_LIVE = 360;
const VENDOR_ID = 1004;

export const spec = {
  code: BIDDER_CODE,
  gvlid: VENDOR_ID,
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function(bid) {
    return true
  },

  buildRequests: function(bidRequests, bidderRequest) {
    bidderRequest = bidderRequest || {};
    const requests = bidRequests.map(function (bid) {
      const parseSized = parseSizesInput(bid.sizes);
      const arrSize = parseSized[0].split('x');
      const params = {
        url: encodeURIComponent(window.location.href),
        sizes: JSON.stringify(parseSized),
        width: arrSize[0],
        height: arrSize[1],
        params: JSON.stringify(bid.params),
        rnd: Math.random(),
        bidId: bid.bidId,
        source: 'pbjs',
        schain: JSON.stringify(bid?.ortb2?.source?.ext?.schain),
        requestId: bid.bidderRequestId,
        tmax: bidderRequest.timeout,
        gdpr: (bidderRequest.gdprConsent && bidderRequest.gdprConsent.gdprApplies) ? 1 : 0,
        consentGiven: vuukleGetConsentGiven(bidderRequest.gdprConsent),
        version: '$prebid.version$',
        v: 2,
      };

      if (bidderRequest.uspConsent) {
        params.uspConsent = bidderRequest.uspConsent;
      }

      if (config.getConfig('coppa') === true) {
        params.coppa = 1;
      }

      if (bidderRequest.gdprConsent && bidderRequest.gdprConsent.consentString) {
        params.consent = bidderRequest.gdprConsent.consentString;
      }

      return {
        method: 'GET',
        url: URL,
        data: params,
        options: { withCredentials: false }
      }
    });

    return requests;
  },

  interpretResponse: function(serverResponse, bidRequest) {
    serverResponse.body = {
      bids: bidRequest.bidderRequest.bids.map((b, i) => {
        const [w, h] = (b.sizes && b.sizes[0]) || [300, 250];
        return {
          imp_id: i,
          cpm: 2.50,
          width: w,
          height: h,
          ad: `<div style="width:${w}px;height:${h}px;background:#0a0;color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px sans-serif;">TL TEST ${w}x${h}</div>`,
          crid: '10092_76480_testcrid',
          tl_source: 'hdx',
          advertiser_name: 'Test Advertiser',
          adomain: ['example.com'],
          deal_id: ''
        };
      })
    };

    if (!serverResponse || !serverResponse.body || !serverResponse.body.ad) {
      return [];
    }

    const res = serverResponse.body;
    const bidResponse = {
      requestId: bidRequest.data.bidId,
      cpm: res.cpm,
      width: res.width,
      height: res.height,
      creativeId: res.creative_id,
      currency: res.currency || 'USD',
      netRevenue: true,
      ttl: TIME_TO_LIVE,
      ad: res.ad,
      meta: {
        advertiserDomains: Array.isArray(res.adomain) ? res.adomain : []
      }
    };

    return [bidResponse];
  },
}
registerBidder(spec);

function vuukleGetConsentGiven(gdprConsent) {
  let consentGiven = 0;
  if (typeof gdprConsent !== 'undefined') {
    consentGiven = deepAccess(gdprConsent, `vendorData.vendor.consents.${VENDOR_ID}`) ? 1 : 0;
  }
  return consentGiven;
}
