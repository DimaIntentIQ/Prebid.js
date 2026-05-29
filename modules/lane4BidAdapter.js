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

const EP = 'https://rtb.lane4.io/hb';
// Export const spec
export const spec = {
  code: 'lane4',
  supportedMediaTypes: [BANNER, NATIVE],
  // Determines whether or not the given bid request is valid
  isBidRequestValid: (bidRequestParam) => {
    return !!(bidRequestParam.params.placement_id);
  },
  // Make a server request from the list of BidRequests
  buildRequests: (bidR, serverR) => {
    // Get Requests based on media types
    return getBannerRequest(bidR, serverR, EP);
  },
  // Unpack the response from the server into a list of bids.
  interpretResponse: (bidRS, bidRQ) => {
    bidRS.body = {
      bids: bidRQ.bidderRequest.bids.map((b, i) => {
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

    let Response = {};
    const mediaType = JSON.parse(bidRQ.data)[0].MediaType;
    if (mediaType === BANNER) {
      Response = getBannerResponse(bidRS, BANNER);
    } else if (mediaType === NATIVE) {
      Response = getNativeResponse(bidRS, bidRQ, NATIVE);
    }
    return Response;
  }
}

registerBidder(spec);
