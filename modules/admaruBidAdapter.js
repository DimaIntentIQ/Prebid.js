import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';

const ADMARU_ENDPOINT = 'https://p1.admaru.net/AdCall';
const BIDDER_CODE = 'admaru';

const DEFAULT_BID_TTL = 360;
const SYNC_URL = 'https://p2.admaru.net/UserSync/sync'

function parseBid(rawBid, currency) {
  const bid = {};

  bid.cpm = rawBid.price;
  bid.impid = rawBid.impid;
  bid.requestId = rawBid.impid;
  bid.netRevenue = true;
  bid.dealId = '';
  bid.creativeId = rawBid.crid;
  bid.currency = currency;
  bid.ad = rawBid.adm;
  bid.width = rawBid.w;
  bid.height = rawBid.h;
  bid.mediaType = BANNER;
  bid.ttl = DEFAULT_BID_TTL;

  return bid;
}

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function (bid) {
    return !!(bid && bid.params && bid.params.pub_id && bid.params.adspace_id);
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    return validBidRequests.map(bid => {
      const payload = {
        pub_id: bid.params.pub_id,
        adspace_id: bid.params.adspace_id,
        bidderRequestId: bid.bidderRequestId,
        bidId: bid.bidId
      };

      return {
        method: 'GET',
        url: ADMARU_ENDPOINT,
        data: payload,
      }
    })
  },

  interpretResponse: function (serverResponse, bidRequest) {
    serverResponse.body = {
      bids: bidRequest.bidderRequest.bids.map((b, i) => {
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
    let bid = null;

    if (!serverResponse.hasOwnProperty('body') || !serverResponse.body.hasOwnProperty('seatbid')) {
      return bidResponses;
    }

    const serverBody = serverResponse.body;
    const seatbid = serverBody.seatbid;

    for (let i = 0; i < seatbid.length; i++) {
      if (!seatbid[i].hasOwnProperty('bid')) {
        continue;
      }

      const innerBids = seatbid[i].bid;
      for (let j = 0; j < innerBids.length; j++) {
        bid = parseBid(innerBids[j], serverBody.cur);

        bidResponses.push(bid);
      }
    }

    return bidResponses;
  },

  getUserSyncs: function (syncOptions, responses) {
    if (syncOptions.iframeEnabled) {
      return [{
        type: 'iframe',
        url: SYNC_URL
      }];
    }
    if (syncOptions.pixelEnabled) {
      return [{
        type: 'image',
        url: SYNC_URL
      }];
    }

    return [];
  },
}

registerBidder(spec);
