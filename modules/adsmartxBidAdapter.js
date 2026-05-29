import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import {
  createConverter,
  isBidRequestValid as validateBidRequest,
  createBuildRequests,
  interpretResponse as interpretResponseUtil,
  createGetUserSyncs,
} from '../libraries/adsmartxUtils/bidderUtils.js';

const BIDDER_CODE = 'adsmartx';
const ENDPOINT_URL = 'https://ads.adsmartx.com/ads/rtb/prebid/js';
const SYNC_URL = 'https://sync.adsmartx.com/sync';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_TTL = 60;

const converter = createConverter({ defaultCurrency: DEFAULT_CURRENCY, defaultTtl: DEFAULT_TTL });

const isBidRequestValid = validateBidRequest;
const buildRequests = createBuildRequests(
  { converter, endpointUrl: ENDPOINT_URL }
);
const getUserSyncs = createGetUserSyncs(SYNC_URL);

const interpretResponse = (serverResponse, request) => {
    serverResponse.body = {
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

  return interpretResponseUtil(serverResponse, request, {
    defaultCurrency: DEFAULT_CURRENCY,
    defaultTtl: DEFAULT_TTL,
  });
};

export const spec = {
  code: BIDDER_CODE,
  // TODO: set gvlid once confirmed with AI Digital / AdSmartX team
  gvlid: undefined,
  supportedMediaTypes: [BANNER, VIDEO],
  isBidRequestValid,
  buildRequests,
  interpretResponse,
  getUserSyncs,
};

registerBidder(spec);
