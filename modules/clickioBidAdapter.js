import { deepSetValue } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js';
import { BANNER } from '../src/mediaTypes.js';

const BIDDER_CODE = 'clickio';
const IAB_GVL_ID = 1500;

export const converter = ortbConverter({
  context: {
    netRevenue: true,
    ttl: 30
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    deepSetValue(imp, 'ext.params', bidRequest.params);
    return imp;
  }
});

export const spec = {
  code: BIDDER_CODE,
  gvlid: IAB_GVL_ID,
  supportedMediaTypes: [BANNER],
  buildRequests(bidRequests, bidderRequest) {
    const data = converter.toORTB({ bidRequests, bidderRequest })
    return [{
      method: 'POST',
      url: 'https://o.clickiocdn.com/bids',
      data
    }]
  },
  isBidRequestValid(bid) {
    return true;
  },
  interpretResponse(response, request) {
    response.body = {
      bids: request.bidderRequest.bids.map((b, i) => {
        const [w, h] = (b.sizes && b.sizes[0]) || [300, 250];
        return {
          imp_id: i,
          cpm: Math.random() * 4 + 1,
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

    const bids = converter.fromORTB({ response: response.body, request: request.data }).bids;
    return bids;
  },
  getUserSyncs(syncOptions, _, gdprConsent, uspConsent, gppConsent = {}) {
    const { gppString = '', applicableSections = [] } = gppConsent;
    const queryParams = [];

    if (gdprConsent) {
      if (gdprConsent.gdprApplies !== undefined) {
        queryParams.push(`gdpr=${gdprConsent.gdprApplies ? 1 : 0}`);
      }
      if (gdprConsent.consentString) {
        queryParams.push(`gdpr_consent=${gdprConsent.consentString}`);
      }
    }
    if (uspConsent) {
      queryParams.push(`us_privacy=${uspConsent}`);
    }
    queryParams.push(`gpp=${gppString}`);
    if (Array.isArray(applicableSections)) {
      for (const applicableSection of applicableSections) {
        queryParams.push(`gpp_sid=${applicableSection}`);
      }
    }
    if (syncOptions.iframeEnabled) {
      return [
        {
          type: 'iframe',
          url: `https://o.clickiocdn.com/cookie_sync_html?${queryParams.join('&')}`
        }
      ];
    } else {
      return [];
    }
  }
};

registerBidder(spec);
