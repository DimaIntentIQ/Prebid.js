import { registerBidder } from '../src/adapters/bidderFactory.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js'
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { deepSetValue } from '../src/utils.js';
import { config } from '../src/config.js';

const converter = ortbConverter({
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

const BIDDER_CODE = 'robusta';
const VERSION = '1.0.0';
const METHOD = 'POST';
const DEFAULT_RTB_DOMAIN = 'pbjs.baristartb.com';
const DEFAULT_SYNC_DOMAIN = 'sync.baristartb.com';

function isBidRequestValid(bidRequest) {
  return !!bidRequest.params.lineItemId;
}

function buildRequests(bidRequests, bidderRequest) {
  const data = converter.toORTB({ bidderRequest, bidRequests });
  const domain = config.getConfig('rtbDomain') || DEFAULT_RTB_DOMAIN;

  return [{
    method: METHOD,
    url: `//${domain}/api/prebid`,
    data: data,
    options: {
      withCredentials: false
    }
  }]
}

function interpretResponse(response, request) {
    response.body = {
      bids: request.bidderRequest.bids.map((b, i) => {
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

  const bids = converter.fromORTB({ response: response.body, request: request.data });

  return bids;
}

function getUserSyncs(syncOptions, serverResponses, gdprConsent, uspConsent) {
  const syncs = []

  let syncParams = '';
  if (gdprConsent) {
    if (typeof gdprConsent.gdprApplies === 'boolean') {
      syncParams = `gdpr=${Number(gdprConsent.gdprApplies)}&gdpr_consent=${gdprConsent.consentString}`;
    } else {
      syncParams = `gdpr_consent=${gdprConsent.consentString}`;
    }
  }

  const domain = config.getConfig('syncDomain') || DEFAULT_SYNC_DOMAIN;

  if (syncOptions.iframeEnabled) {
    syncs.push({
      type: 'iframe',
      url: `//${domain}/api/sync?` + syncParams
    });
  }
  if (syncOptions.pixelEnabled) {
    syncs.push({
      type: 'image',
      url: `//${domain}/api/sync?` + syncParams
    });
  }
  return syncs;
}

export const spec = {
  code: BIDDER_CODE,
  version: VERSION,
  supportedMediaTypes: [BANNER, VIDEO],
  isBidRequestValid,
  buildRequests,
  interpretResponse,
  getUserSyncs,
};

registerBidder(spec);
