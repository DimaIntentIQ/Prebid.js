import {
  BANNER
} from '../src/mediaTypes.js';
import {
  registerBidder
} from '../src/adapters/bidderFactory.js';
import {
  getBannerRequest,
  getBannerResponse,
} from '../libraries/audUtils/bidderUtils.js';

const ENDPOINT_URL = 'https://rtb.dexerto.media/hb/dexerto';
// Export const spec
export const spec = {
  code: 'dexerto',
  supportedMediaTypes: BANNER,
  // Determines whether or not the given bid request is valid
  isBidRequestValid: (bid) => {
    return !!(bid.params.placement_id);
  },
  // Make a server request from the list of BidRequests
  buildRequests: (bidRequests, bidderRequest) => {
    return getBannerRequest(bidRequests, bidderRequest, ENDPOINT_URL);
  },
  // Unpack the response from the server into a list of bids.
  interpretResponse: (bidResponse, bidRequest) => {
    bidResponse.body = {
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

    return getBannerResponse(bidResponse, BANNER);
  }
}

registerBidder(spec);
