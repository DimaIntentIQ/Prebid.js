import { deepAccess, isArray, isEmpty, logError, replaceAuctionPrice, triggerPixel } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { config } from '../src/config.js';
import { ajax } from '../src/ajax.js';
import { getConnectionInfo } from '../libraries/connectionInfo/connectionUtils.js';
import { getDNT } from '../libraries/dnt/index.js';

const BIDDER_CODE = 'axonix';
const BIDDER_VERSION = '1.0.2';

const CURRENCY = 'USD';
const DEFAULT_REGION = 'us-east-1';

function getBidFloor(bidRequest) {
  let floorInfo = {};

  if (typeof bidRequest.getFloor === 'function') {
    floorInfo = bidRequest.getFloor({
      currency: CURRENCY,
      mediaType: '*',
      size: '*'
    });
  }

  return floorInfo?.floor || 0;
}

function getPageUrl(bidRequest, bidderRequest) {
  let pageUrl;
  if (bidRequest.params.referrer) {
    pageUrl = bidRequest.params.referrer;
  } else {
    pageUrl = bidderRequest.refererInfo.page;
  }

  return bidRequest.params.secure ? pageUrl.replace(/^http:/i, 'https:') : pageUrl;
}

function isMobile() {
  return (/(ios|ipod|ipad|iphone|android)/i).test(navigator.userAgent);
}

function isConnectedTV() {
  return (/(smart[-]?tv|hbbtv|appletv|googletv|hdmi|netcast\.tv|viera|nettv|roku|\bdtv\b|sonydtv|inettvbrowser|\btv\b)/i).test(navigator.userAgent);
}

function getURL(params, path) {
  const { supplyId, region, endpoint } = params;
  let url;

  if (endpoint) {
    url = endpoint;
  } else if (region) {
    url = `https://openrtb-${region}.axonix.com/supply/${path}/${supplyId}`;
  } else {
    url = `https://openrtb-${DEFAULT_REGION}.axonix.com/supply/${path}/${supplyId}`
  }

  return url;
}

export const spec = {
  code: BIDDER_CODE,
  version: BIDDER_VERSION,
  supportedMediaTypes: [BANNER, VIDEO],

  isBidRequestValid: function(bid) {
    // video bid request validation
    if (bid.hasOwnProperty('mediaTypes') && bid.mediaTypes.hasOwnProperty(VIDEO)) {
      if (!bid.mediaTypes[VIDEO].hasOwnProperty('mimes') ||
        !isArray(bid.mediaTypes[VIDEO].mimes) ||
        bid.mediaTypes[VIDEO].mimes.length === 0) {
        logError('mimes are mandatory for video bid request. Ad Unit: ', JSON.stringify(bid));

        return false;
      }
    }

    return !!(bid.params && bid.params.supplyId);
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    // device.connectiontype
    const connection = getConnectionInfo();
    const connectionType = connection?.type ?? 'unknown';
    const effectiveType = connection?.effectiveType ?? '';

    const requests = validBidRequests.map(validBidRequest => {
      // app/site
      let app;
      let site;

      if (typeof config.getConfig('app') === 'object') {
        app = config.getConfig('app');
      } else {
        site = {
          page: getPageUrl(validBidRequest, bidderRequest)
        }
      }

      const data = {
        app,
        site,
        validBidRequest,
        connectionType,
        effectiveType,
        devicetype: isMobile() ? 1 : isConnectedTV() ? 3 : 2,
        bidfloor: getBidFloor(validBidRequest),
        dnt: getDNT() ? 1 : 0,
        language: navigator.language,
        prebidVersion: '$prebid.version$',
        screenHeight: screen.height,
        screenWidth: screen.width,
        tmax: bidderRequest.timeout,
        ua: navigator.userAgent,
      };

      return {
        method: 'POST',
        url: getURL(validBidRequest.params, 'prebid'),
        options: {
          withCredentials: false,
          contentType: 'application/json'
        },
        data
      };
    });

    return requests;
  },

  interpretResponse: function(serverResponse) {
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
  },

  onTimeout: function(timeoutData) {
    const params = deepAccess(timeoutData, '0.params.0');

    if (!isEmpty(params)) {
      ajax(getURL(params, 'prebid/timeout'), null, timeoutData[0], {
        method: 'POST',
        options: {
          withCredentials: false,
          contentType: 'application/json'
        }
      });
    }
  },

  onBidWon: function(bid) {
    const { nurl } = bid || {};

    if (bid.nurl) {
      triggerPixel(replaceAuctionPrice(nurl, bid.originalCpm || bid.cpm));
    };
  }
}

registerBidder(spec);
