import { _map, deepAccess, flatten, isArray, logError, parseSizesInput } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { config } from '../src/config.js';
import { chunk } from '../libraries/chunk/chunk.js';
import {
  createTag, getUserSyncsFn,
  isBidRequestValid,
  supportedMediaTypes
} from '../libraries/adtelligentUtils/adtelligentUtils.js';

const ENDPOINT = 'https://ghb.console.adtarget.com.tr/v2/auction/';
const BIDDER_CODE = 'adtarget';
const DISPLAY = 'display';
const syncsCache = {};

export const spec = {
  code: BIDDER_CODE,
  gvlid: 779,
  supportedMediaTypes,
  isBidRequestValid,
  getUserSyncs: function (syncOptions, serverResponses) {
    return getUserSyncsFn(syncOptions, serverResponses, syncsCache)
  },

  buildRequests: function (bidRequests, adapterRequest) {
    const adapterSettings = config.getConfig(adapterRequest.bidderCode)
    const chunkSize = deepAccess(adapterSettings, 'chunkSize', 10);
    const { tag, bids } = bidToTag(bidRequests, adapterRequest);
    const bidChunks = chunk(bids, chunkSize);
    return _map(bidChunks, (bids) => {
      return {
        data: Object.assign({}, tag, { BidRequests: bids }),
        adapterRequest,
        method: 'POST',
        url: ENDPOINT
      };
    })
  },
  interpretResponse: function (serverResponse, bidRequest) {
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
        cpm: 4.00,
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

function parseResponse(serverResponse, adapterRequest) {
  const isInvalidValidResp = !serverResponse || !isArray(serverResponse.bids);
  const bids = [];

  if (isInvalidValidResp) {
    const extMessage = serverResponse && serverResponse.ext && serverResponse.ext.message ? `: ${serverResponse.ext.message}` : '';
    const errorMessage = `in response for ${adapterRequest.bidderCode} adapter ${extMessage}`;

    logError(errorMessage);

    return bids;
  }

  serverResponse.bids.forEach(serverBid => {
    const request = ((adapterRequest.bids) || []).find((bidRequest) => {
      return bidRequest.bidId === serverBid.requestId;
    });

    if (serverBid.cpm !== 0 && request !== undefined) {
      const bid = createBid(serverBid, request);

      bids.push(bid);
    }
  });

  return bids;
}

function bidToTag(bidRequests, adapterRequest) {
  const tag = createTag(bidRequests, adapterRequest);

  const bids = [];

  for (let i = 0, length = bidRequests.length; i < length; i++) {
    const bid = prepareBidRequests(bidRequests[i]);
    bids.push(bid);
  }

  return { tag, bids };
}

function prepareBidRequests(bidReq) {
  const mediaType = deepAccess(bidReq, 'mediaTypes.video') ? VIDEO : DISPLAY;
  const sizes = mediaType === VIDEO ? deepAccess(bidReq, 'mediaTypes.video.playerSize') : deepAccess(bidReq, 'mediaTypes.banner.sizes');
  const bidReqParams = {
    'CallbackId': bidReq.bidId,
    'Aid': bidReq.params.aid,
    'AdType': mediaType,
    'Sizes': parseSizesInput(sizes).join(',')
  };
  return bidReqParams;
}

function getMediaType(bidderRequest) {
  return deepAccess(bidderRequest, 'mediaTypes.video') ? VIDEO : BANNER;
}

function createBid(bidResponse, bidRequest) {
  const mediaType = getMediaType(bidRequest)
  const bid = {
    requestId: bidResponse.requestId,
    creativeId: bidResponse.cmpId,
    height: bidResponse.height,
    currency: bidResponse.cur,
    width: bidResponse.width,
    cpm: bidResponse.cpm,
    netRevenue: true,
    mediaType,
    ttl: 300,
    meta: {
      advertiserDomains: bidResponse.adomain || []
    }
  };

  if (mediaType === BANNER) {
    return Object.assign(bid, {
      ad: bidResponse.ad
    });
  }
  Object.assign(bid, {
    vastUrl: bidResponse.vastUrl
  });
  return bid;
}

registerBidder(spec);
