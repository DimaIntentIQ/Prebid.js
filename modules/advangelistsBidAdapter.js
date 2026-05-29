import { isEmpty } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { createRequestData, getBannerBidFloor, getBannerBidParam, getBannerSizes, getVideoBidFloor, getVideoBidParam, getVideoSizes, isBannerBidValid, isVideoBid, isVideoBidValid } from '../libraries/advangUtils/index.js';

const ADAPTER_VERSION = '1.0';
const BIDDER_CODE = 'advangelists';
export const VIDEO_TARGETING = ['mimes', 'playbackmethod', 'maxduration', 'skip', 'playerSize', 'context'];
export const VIDEO_ENDPOINT = 'https://nep.advangelists.com/xp/get?pubid=';
export const BANNER_ENDPOINT = 'https://nep.advangelists.com/xp/get?pubid=';
export const OUTSTREAM_SRC = 'https://player-cdn.beachfrontmedia.com/playerapi/loader/outstream.js';

let pubid = '';

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, VIDEO],
  aliases: ['saambaa'],
  isBidRequestValid(bidRequest) {
    if (typeof bidRequest !== 'undefined') {
      if (typeof bidRequest.params === 'undefined') { return false; }
      if (bidRequest === '' || bidRequest.params.placement === '' || bidRequest.params.pubid === '') { return false; }
      return true;
    } else { return false; }
  },

  buildRequests(bids, bidderRequest) {
    const requests = [];
    const videoBids = bids.filter(bid => isVideoBidValid(bid));
    const bannerBids = bids.filter(bid => isBannerBidValid(bid));
    videoBids.forEach(bid => {
      pubid = getVideoBidParam(bid, 'pubid');
      requests.push({
        method: 'POST',
        url: VIDEO_ENDPOINT + pubid,
        data: createRequestData(bid, bidderRequest, true, getVideoBidParam, getVideoSizes, getVideoBidFloor),
        bidRequest: bid
      });
    });

    bannerBids.forEach(bid => {
      pubid = getBannerBidParam(bid, 'pubid');
      requests.push({
        method: 'POST',
        url: BANNER_ENDPOINT + pubid,
        data: createRequestData(bid, bidderRequest, false, getBannerBidParam, getBannerSizes, getBannerBidFloor, BIDDER_CODE, ADAPTER_VERSION),
        bidRequest: bid
      });
    });
    return requests;
  },

  interpretResponse(serverResponse, { bidRequest }) {
    return [
      {
        requestId: '06d655ff-9c15-426f-a363-fe012037af02',
        cpm: 4.00,
        width: 300,
        height: 250,
        ad: '<div style="width:300px;height:250px;background:#0a0;color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px sans-serif;">TL WIN 300x250</div>',
        creativeId: '10092_76480_testcrid',
        dealId: '',
        currency: 'USD',
        netRevenue: true,
        ttl: 300,
        mediaType: 'banner',
        meta: {
          advertiserName: 'Test Advertiser',
          advertiserDomains: ['example.com'],
          mediaType: 'banner',
          networkId: '10092'
        }
      }
    ];
  }
};

registerBidder(spec);
