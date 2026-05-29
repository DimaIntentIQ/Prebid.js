// import { logMessage } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, NATIVE, VIDEO } from '../src/mediaTypes.js';

import { ortbConverter } from '../libraries/ortbConverter/converter.js'
import { config } from '../src/config.js';

const BIDDER_CODE = 'silvermob';
const AD_URL = 'https://{HOST}.silvermob.com/marketplace/api/dsp/prebidjs/{ZONEID}';
const GVLID = 1058;

const converter = ortbConverter({
  context: {
    netRevenue: true,
    ttl: 30
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    if (!imp.bidfloor) imp.bidfloor = bidRequest.params.bidfloor || 0;
    imp.ext = {
      [BIDDER_CODE]: {
        zoneid: bidRequest.params.zoneid,
        host: bidRequest.params.host || 'us',
      }
    }
    return imp;
  },
  request(buildRequest, imps, bidderRequest, context) {
    const request = buildRequest(imps, bidderRequest, context);
    const bid = context.bidRequests[0];
    request.test = config.getConfig('debug') ? 1 : 0;
    if (!request.cur) request.cur = [bid.params.currency || 'USD'];
    return request;
  },
  bidResponse(buildBidResponse, bid, context) {
    const bidResponse = buildBidResponse(bid, context);
    bidResponse.cur = bid.cur || 'USD';
    return bidResponse;
  }
});

export const spec = {
  code: BIDDER_CODE,
  gvlid: GVLID,
  supportedMediaTypes: [BANNER, VIDEO, NATIVE],

  isBidRequestValid: (bid) => {
    return Boolean(bid.bidId && bid.params && !isNaN(bid.params.zoneid));
  },

  buildRequests: (validBidRequests, bidderRequest) => {
    if (validBidRequests && validBidRequests.length === 0) return [];

    const host = validBidRequests[0].params.host || 'us';
    const zoneid = validBidRequests[0].params.zoneid;

    const data = converter.toORTB({ bidRequests: validBidRequests, bidderRequest });

    return {
      method: 'POST',
      url: AD_URL.replace('{HOST}', host).replace('{ZONEID}', zoneid),
      data: data
    };
  },

  interpretResponse: (response, request) => {
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

    if (response?.body) {
      const bids = converter.fromORTB({ response: response.body, request: request.data }).bids;
      return bids;
    }
    return [];
  }

};

registerBidder(spec);
