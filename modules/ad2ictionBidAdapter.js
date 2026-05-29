import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { getStorageManager } from '../src/storageManager.js';

export const BIDDER_CODE = 'ad2iction';
export const SUPPORTED_AD_TYPES = [BANNER];
export const API_ENDPOINT = 'https://ads.ad2iction.com/html/prebid/';
export const API_VERSION_NUMBER = 3;
export const COOKIE_NAME = 'ad2udid';

export const storage = getStorageManager({ bidderCode: BIDDER_CODE });

export const spec = {
  code: BIDDER_CODE,
  aliases: ['ad2'],
  supportedMediaTypes: SUPPORTED_AD_TYPES,
  isBidRequestValid: (bid) => {
    return !!bid.params.id && typeof bid.params.id === 'string';
  },
  buildRequests: (validBidRequests, bidderRequest) => {
    const ids = validBidRequests.map((bid) => {
      return { bannerId: bid.params.id, bidId: bid.bidId };
    });

    const options = {
      contentType: 'application/json',
      withCredentials: false,
    };

    const udid = storage.cookiesAreEnabled() && storage.getCookie(COOKIE_NAME);

    const data = {
      ids: JSON.stringify(ids),
      ortb2: bidderRequest.ortb2,
      refererInfo: bidderRequest.refererInfo,
      v: API_VERSION_NUMBER,
      udid: udid || '',
      _: Math.round(new Date().getTime()),
    };

    return {
      method: 'POST',
      url: API_ENDPOINT,
      data,
      options,
    };
  },
  interpretResponse: (serverResponse, bidRequest) => {
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

    if (!Array.isArray(serverResponse.body)) {
      return [];
    }

    const bidResponses = serverResponse.body;

    return bidResponses;
  },
};

registerBidder(spec);
