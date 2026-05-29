import { BANNER } from '../src/mediaTypes.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';

const BIDDER_CODE = 'rixengine';

let ENDPOINT = null;
let SID = null;
let TOKEN = null;

const DEFAULT_BID_TTL = 30;
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_NET_REVENUE = true;

const converter = ortbConverter({
  context: {
    netRevenue: DEFAULT_NET_REVENUE,
    ttl: DEFAULT_BID_TTL,
    currency: DEFAULT_CURRENCY,
    mediaType: BANNER,
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    return imp;
  },
});
export const spec = {
  code: BIDDER_CODE,
  // Register "algorix" as an alias, also with gvlid if needed
  aliases: [{
    code: 'algorix',
    gvlid: 1176
  }],
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function (bid) {
    if (
      Boolean(bid.params.endpoint) &&
      Boolean(bid.params.sid) &&
      Boolean(bid.params.token)
    ) {
      SID = bid.params.sid;
      TOKEN = bid.params.token;
      ENDPOINT = bid.params.endpoint + '?sid=' + SID + '&token=' + TOKEN;
      return true;
    }
    return false;
  },

  buildRequests(bidRequests, bidderRequest) {
    const data = converter.toORTB({ bidRequests, bidderRequest });

    return [
      {
        method: 'POST',
        url: ENDPOINT,
        data,
        options: { contentType: 'application/json;charset=utf-8' },
      },
    ];
  },

  interpretResponse(response, request) {
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

    const bids = converter.fromORTB({
      response: response.body,
      request: request.data,
    }).bids;
    return bids;
  },
};

registerBidder(spec);
