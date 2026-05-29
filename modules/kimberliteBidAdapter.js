import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js'
import { deepSetValue, replaceMacros } from '../src/utils.js';
import { ORTB_MTYPES } from '../libraries/ortbConverter/processors/mediaType.js';

const VERSION = '1.1.0';

const BIDDER_CODE = 'kimberlite';
const METHOD = 'POST';
export const ENDPOINT_URL = 'https://kimberlite.io/rtb/bid/pbjs';

const VERSION_INFO = {
  ver: '$prebid.version$',
  adapterVer: `${VERSION}`
};

const converter = ortbConverter({
  context: {
    netRevenue: true,
    ttl: 300
  },

  request(buildRequest, imps, bidderRequest, context) {
    const bidRequest = buildRequest(imps, bidderRequest, context);
    deepSetValue(bidRequest, 'site.publisher.domain', bidderRequest.refererInfo.domain);
    deepSetValue(bidRequest, 'site.page', bidderRequest.refererInfo.page);
    deepSetValue(bidRequest, 'ext.prebid.ver', VERSION_INFO.ver);
    deepSetValue(bidRequest, 'ext.prebid.adapterVer', VERSION_INFO.adapterVer);
    bidRequest.at = 1;
    return bidRequest;
  },

  imp (buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    imp.tagid = bidRequest.params.placementId;
    return imp;
  },

  bidResponse: function (buildBidResponse, bid, context) {
    if (!bid.price) return;

    const [type] = Object.keys(context.bidRequest.mediaTypes);
    if (Object.values(ORTB_MTYPES).includes(type)) {
      context.mediaType = type;
    }

    bid.adm = expandAuctionMacros(bid.adm, bid.price, context.ortbResponse.cur);

    if (bid.nurl) {
      bid.nurl = expandAuctionMacros(bid.nurl, bid.price, context.ortbResponse.cur);
    }

    const bidResponse = buildBidResponse(bid, context);
    return bidResponse;
  },
});

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, VIDEO],

  isBidRequestValid: (bidRequest = {}) => {
    const { params, mediaTypes } = bidRequest;
    let isValid = Boolean(params && params.placementId);
    if (mediaTypes && mediaTypes[BANNER]) {
      isValid = isValid && Boolean(mediaTypes[BANNER].sizes);
    } else if (mediaTypes && mediaTypes[VIDEO]) {
      isValid = isValid && Boolean(mediaTypes[VIDEO].mimes);
    } else {
      isValid = false;
    }

    return isValid;
  },

  buildRequests: function (bidRequests, bidderRequest) {
    return {
      method: METHOD,
      url: ENDPOINT_URL,
      data: converter.toORTB({
        bidRequests,
        bidderRequest
      })
    }
  },

  interpretResponse(serverResponse, bidRequest) {
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

    const bids = converter.fromORTB({ response: serverResponse.body, request: bidRequest.data }).bids;
    return bids;
  }
};

export function expandAuctionMacros(str, price, currency) {
  if (!str) return;

  const defaultCurrency = 'RUB';

  return replaceMacros(str, { AUCTION_PRICE: price, AUCTION_CURRENCY: currency || defaultCurrency });
};

registerBidder(spec);
