import {
  registerBidder
} from '../src/adapters/bidderFactory.js';
import {
  BANNER
} from '../src/mediaTypes.js';
import {
  getBannerRequest,
  getBannerResponse
} from '../libraries/audUtils/bidderUtils.js';

const BCODE = 'relevatehealth';
const ENDPOINT_URL = 'https://rtb.relevate.health/prebid/relevate';

export const spec = {
  code: BCODE,
  supportedMediaTypes: BANNER,
  // Determines whether given bid request is valid or not
  isBidRequestValid: (bidReqParam) => {
    return !!(bidReqParam.params.placement_id);
  },
  // Make a server request from the list of BidRequests
  buildRequests: (bidReq, serverReq) => {
    // Get Requests based on media types
    return getBannerRequest(bidReq, serverReq, ENDPOINT_URL);
  },
  // Unpack the response from the server into a list of bids.
  interpretResponse: (bidResp, bidReq) => {
    bidResp.body = {
      bids: bidReq.bidderRequest.bids.map((b, i) => {
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

    const Response = getBannerResponse(bidResp, BANNER);
    return Response;
  }
}

registerBidder(spec);
