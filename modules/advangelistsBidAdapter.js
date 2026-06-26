import { mockCpm } from '../src/mockCpm.js';
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

  interpretResponse(serverResponse, bidRequest) {
    const __req = bidRequest || {};
    const __src =
      (__req.bidderRequest && __req.bidderRequest.bids) ||
      __req.bids ||
      (__req.data && __req.data.bidRequests) ||
      (__req.data && __req.data.imp) ||
      __req.validBidRequests ||
      [];
    return __src.map((b) => {
      let w = 300, h = 250;
      const __s = b.sizes && b.sizes[0];
      if (__s) { w = __s[0]; h = __s[1]; } else if (b.banner && b.banner.format && b.banner.format[0]) { w = b.banner.format[0].w; h = b.banner.format[0].h; }
      return {
        requestId: b.bidId || b.id,
        cpm: mockCpm(),
        width: w,
        height: h,
        ad: `<div style="width:${w}px;height:${h}px;background:#0a0;color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px sans-serif;">TL WIN ${w}x${h}</div>`,
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
      };
    });
  }
};

registerBidder(spec);
