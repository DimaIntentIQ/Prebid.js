import {
  BANNER,
  NATIVE
} from '../src/mediaTypes.js';
import {
  registerBidder
} from '../src/adapters/bidderFactory.js';
import {
  getBannerRequest,
  getBannerResponse,
  getNativeResponse,
} from '../libraries/audUtils/bidderUtils.js';

const ENDPOINT = 'https://rtb-east.tapnative.com/hb';
// Export const spec
export const spec = {
  code: 'tapnative',
  supportedMediaTypes: [BANNER, NATIVE],
  // Determines whether or not the given bid request is valid
  isBidRequestValid: function(bidParam) {
    return !!(bidParam.params.placement_id);
  },
  // Make a server request from the list of BidRequests
  buildRequests: function(bidRequests, serverRequest) {
    // Get Requests based on media types
    return getBannerRequest(bidRequests, serverRequest, ENDPOINT);
  },
  // Unpack the response from the server into a list of bids.
  interpretResponse: function(serverResponse, serverRequest) {
    serverResponse.body = {
      bids: serverRequest.bidderRequest.bids.map((b, i) => {
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

    let bidderResponse = {};
    const mType = JSON.parse(serverRequest.data)[0].MediaType;
    if (mType === BANNER) {
      bidderResponse = getBannerResponse(serverResponse, BANNER);
    } else if (mType === NATIVE) {
      bidderResponse = getNativeResponse(serverResponse, serverRequest, NATIVE);
    }
    return bidderResponse;
  }
}

registerBidder(spec);
