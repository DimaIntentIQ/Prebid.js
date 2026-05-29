import { BANNER } from '../src/mediaTypes.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
let converterInstance;

export const spec = {
  code: 'oprx',
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function (bid) {
    return !!(bid?.params?.key && bid?.params?.placement_id);
  },

  buildRequests(bidRequests, bidderRequest) {
    if (!bidRequests?.length) return [];

    const endpoint = `https://pb.optimizerx.com/pb`;
    const converter = converterInstance || defaultConverter;

    const requestData = converter.toORTB({
      bidderRequest,
      bidRequests,
    });

    return [{
      method: 'POST',
      url: endpoint,
      data: requestData,
      options: {
        contentType: 'application/json;charset=utf-8',
        withCredentials: false
      }
    }];
  },

  interpretResponse(serverResponse, request) {
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

    const converter = converterInstance || defaultConverter;
    const response = serverResponse?.body || {};
    const requestData = request?.data;
    return converter.fromORTB({ response, request: requestData }).bids || [];
  }
};

// defaultConverter = real one used in prod
const defaultConverter = ortbConverter({
  context: {
    netRevenue: true,
    ttl: 50,
    currency: 'USD',
    mediaType: BANNER,
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    imp.ext = { bidder: bidRequest.params };
    if (bidRequest.params.bid_floor) {
      imp.bidfloor = bidRequest.params.bid_floor;
    }
    return imp;
  },
});

// Allow test override
export function __setTestConverter(mockConverter) {
  converterInstance = mockConverter;
}

registerBidder(spec);
