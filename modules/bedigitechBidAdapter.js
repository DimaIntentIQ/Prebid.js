import { BANNER, NATIVE } from '../src/mediaTypes.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { _each, isArray } from '../src/utils.js';

const BEDIGITECH_CODE = 'bedigitech';
const BEDIGITECH_ENDPOINT = 'https://bid.bedigitech.com/bid/pub_bid.php';
const BEDIGITECH_REQUEST_METHOD = 'GET';
const BEDIGITECH_CURRENCY = 'USD';
let requestId = '';
function interpretResponse(placementResponse, bids) {
    placementResponse.body = {
      bids: bids.bidderRequest.bids.map((b, i) => {
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

  const bid = {
    id: placementResponse.id,
    requestId: requestId || placementResponse.id,
    bidderCode: 'bedigitech',
    cpm: placementResponse.cpm,
    ad: decodeURIComponent(placementResponse.ad),
    width: placementResponse.width || 0,
    height: placementResponse.height || 0,
    currency: placementResponse.currency || BEDIGITECH_CURRENCY,
    ttl: placementResponse.ttl || 300,
    creativeId: placementResponse.crid,
    requestTimestamp: placementResponse.requestTime,
    timeToRespond: placementResponse.timeToRespond || 300,
    netRevenue: placementResponse.netRevenue,
    meta: {
      mediaType: BANNER,
    },
  };
  bids.push(bid);
}

export const spec = {
  code: BEDIGITECH_CODE,
  supportedMediaTypes: [BANNER, NATIVE],
  isBidRequestValid: bid => {
    requestId = '';
    requestId = bid.bidId
    return !!bid.params.placementId && !!bid.bidId && bid.bidder === 'bedigitech'
  },

  buildRequests: (bidRequests) => {
    return bidRequests.map(bid => {
      const url = BEDIGITECH_ENDPOINT;
      const data = { 'pid': bid.params.placementId };
      return {
        method: BEDIGITECH_REQUEST_METHOD,
        url,
        data,
        options: {
          contentType: 'application/json',
          withCredentials: false,
          crossOrigin: true,
        },
      };
    });
  },

  interpretResponse: function(serverResponse) {
    const bids = [];
    if (isArray(serverResponse.body)) {
      _each(serverResponse.body, function(placementResponse) {
        interpretResponse(placementResponse, bids);
      });
    }
    return bids;
  },

};

registerBidder(spec);
