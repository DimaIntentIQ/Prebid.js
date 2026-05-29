import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js';

const BIDDER_CODE = 'mabidder';
export const baseUrl = 'https://prebid.ecdrsvc.com/bid';
const converter = ortbConverter({})

export const spec = {
  supportedMediaTypes: [BANNER],
  code: BIDDER_CODE,
  isBidRequestValid: function(bid) {
    if (typeof bid.params === 'undefined') {
      return false;
    }
    return !!(bid.params.ppid && bid.sizes && Array.isArray(bid.sizes) && Array.isArray(bid.sizes[0]))
  },
  buildRequests: function(validBidRequests, bidderRequest) {
    const fpd = converter.toORTB({ bidRequests: validBidRequests, bidderRequest: bidderRequest });

    const bids = [];
    validBidRequests.forEach(bidRequest => {
      const sizes = [];
      bidRequest.sizes.forEach(size => {
        sizes.push({
          width: size[0],
          height: size[1]
        });
      });
      bids.push({
        bidId: bidRequest.bidId,
        sizes: sizes,
        ppid: bidRequest.params.ppid,
        mediaType: BANNER
      })
    });
    const req = {
      url: baseUrl,
      method: 'POST',
      data: {
        v: 'v' + '$prebid.version$',
        bids: bids,
        url: bidderRequest.refererInfo.page || '',
        referer: bidderRequest.refererInfo.ref || '',
        fpd: fpd || {}
      }
    };

    return req;
  },
  interpretResponse: function(serverResponse, request) {
    serverResponse.body = {
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

    const bidResponses = [];
    if (serverResponse.body) {
      const body = serverResponse.body;
      if (!body || typeof body !== 'object' || !body.Responses || !(body.Responses.length > 0)) {
        return [];
      }
      body.Responses.forEach((bidResponse) => {
        bidResponses.push(bidResponse);
      });
    }
    return bidResponses;
  }
}
registerBidder(spec);
