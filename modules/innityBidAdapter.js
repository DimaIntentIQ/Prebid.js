import { parseSizesInput, timestamp } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';

const BIDDER_CODE = 'innity';
const ENDPOINT = 'https://as.innity.com/synd/';

export const spec = {
  code: BIDDER_CODE,
  isBidRequestValid: function(bid) {
    return !!(bid.params && bid.params.pub && bid.params.zone);
  },
  buildRequests: function(validBidRequests, bidderRequest) {
    return validBidRequests.map(bidRequest => {
      const parseSized = parseSizesInput(bidRequest.sizes);
      const arrSize = parseSized[0].split('x');
      return {
        method: 'GET',
        url: ENDPOINT,
        data: {
          cb: timestamp(),
          ver: 2,
          hb: 1,
          output: 'js',
          pub: bidRequest.params.pub,
          zone: bidRequest.params.zone,
          url: bidderRequest && bidderRequest.refererInfo ? encodeURIComponent(bidderRequest.refererInfo.page) : '',
          width: arrSize[0],
          height: arrSize[1],
          vpw: window.screen.width,
          vph: window.screen.height,
          callback: 'json',
          callback_uid: bidRequest.bidId,
          // TODO: fix auctionId leak: https://github.com/prebid/Prebid.js/issues/9781
          auction: bidRequest.auctionId,
        },
      };
    });
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

    const res = serverResponse.body;
    if (Object.keys(res).length === 0) {
      return [];
    }
    const bidResponse = {
      requestId: res.callback_uid,
      cpm: parseFloat(res.cpm) / 100,
      width: res.width,
      height: res.height,
      creativeId: res.creative_id,
      currency: 'USD',
      netRevenue: true,
      ttl: 60,
      ad: '<script src="https://cdn.innity.net/frame_util.js"></script>' + res.tag,
      meta: {
        advertiserDomains: res.adomain && res.adomain.length ? res.adomain : [],
        mediaType: res.mediaType,
      }
    };
    return [bidResponse];
  }
}
registerBidder(spec);
