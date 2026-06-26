import { mockCpm } from '../src/mockCpm.js';
import {
  generateUUID,
  _each,
  getWinDimensions,
} from '../src/utils.js';
import { config } from '../src/config.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { convertOrtbRequestToProprietaryNative } from '../src/native.js';
import { getStorageManager } from '../src/storageManager.js';
import { ajax } from '../src/ajax.js';
import { BANNER, VIDEO, NATIVE } from '../src/mediaTypes.js';
import { getDNT } from '../libraries/dnt/index.js';
const ENDPOINT_URL = 'https://prebid.cht.hinet.net/api/v1';
const BIDDER_CODE = 'chtnw';
const COOKIE_NAME = '__htid';
const storage = getStorageManager({ bidderCode: BIDDER_CODE });

const { getConfig } = config;

function _isMobile() {
  return (/(ios|ipod|ipad|iphone|android)/i).test(navigator.userAgent);
}

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, VIDEO, NATIVE],
  isBidRequestValid: function(bid = {}) {
    return !!(bid && bid.params);
  },
  buildRequests: function(validBidRequests = [], bidderRequest = {}) {
    validBidRequests = convertOrtbRequestToProprietaryNative(validBidRequests);
    const chtnwId = storage.getCookie(COOKIE_NAME) ?? generateUUID();
    if (storage.cookiesAreEnabled()) {
      storage.setCookie(COOKIE_NAME, chtnwId);
    }
    const device = getConfig('device') || {};
    const { innerWidth, innerHeight } = getWinDimensions();
    device.w = device.w || innerWidth;
    device.h = device.h || innerHeight;
    device.ua = device.ua || navigator.userAgent;
    device.dnt = getDNT() ? 1 : 0;
    device.language = (navigator && navigator.language) ? navigator.language.split('-')[0] : '';
    const bidParams = [];
    _each(validBidRequests, function(bid) {
      bidParams.push({
        bidId: bid.bidId,
        placement: bid.params.placementId,
        sizes: bid.sizes,
        adSlot: bid.adUnitCode
      });
    });
    return {
      method: 'POST',
      url: ENDPOINT_URL + '/request/prebid.json',
      data: {
        bids: bidParams,
        uuid: chtnwId,
        device: device,
        version: {
          prebid: '$prebid.version$',
          adapter: '1.0.0',
        },
        site: {
          numIframes: bidderRequest.refererInfo?.numIframes || 0,
          isAmp: bidderRequest.refererInfo?.isAmp || false,
          pageUrl: bidderRequest.refererInfo?.page || '',
          ref: bidderRequest.refererInfo?.ref || '',
        },
      },
      bids: validBidRequests
    };
  },
  interpretResponse: function(serverResponse, bidRequest) {
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
  },
  getUserSyncs: function(syncOptions, serverResponses, gdprConsent, uspConsent) {
    const syncs = [];
    if (syncOptions.pixelEnabled) {
      const chtnwId = generateUUID()
      const uuid = chtnwId
      const type = (_isMobile()) ? 'dot' : 'pixel';
      syncs.push({
        type: 'image',
        url: `https://t.ssp.hinet.net/${type}?bd=${uuid}&t=chtnw`
      })
    }
    return syncs
  },
  onTimeout: function(timeoutData) {
    if (timeoutData === null) {
      return;
    }
    ajax(ENDPOINT_URL + '/trace/timeout/bid', null, JSON.stringify(timeoutData), {
      method: 'POST',
      withCredentials: false
    });
  },
  onBidWon: function(bid) {
    if (bid.nurl) {
      ajax(bid.nurl, null);
    }
  },
  onSetTargeting: function(bid) {
  },
}
registerBidder(spec);
