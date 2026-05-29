import {
  logWarn,
  logInfo,
  isArray,
  deepAccess,
  timestamp,
  triggerPixel,
} from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { getStorageManager } from '../src/storageManager.js';
import { ajax } from '../src/ajax.js';
import {
  generateBidsParams,
  generateGeneralParams,
} from '../libraries/riseUtils/index.js';

const SUPPORTED_AD_TYPES = [BANNER, VIDEO];
const BIDDER_CODE = 'publir';
const ADAPTER_VERSION = '1.0.0';
const TTL = 360;
const CURRENCY = 'USD';
const BASE_URL = 'https://prebid.publir.com/publirPrebidEndPoint';
const DEFAULT_IMPS_ENDPOINT = 'https://prebidimpst.publir.com/publirPrebidImpressionTracker';

export const storage = getStorageManager({ bidderCode: BIDDER_CODE });
export const spec = {
  code: BIDDER_CODE,
  version: ADAPTER_VERSION,
  aliases: ['plr'],
  supportedMediaTypes: SUPPORTED_AD_TYPES,
  isBidRequestValid: function (bidRequest) {
    if (!bidRequest.params.pubId) {
      logWarn('pubId is a mandatory param for Publir adapter');
      return false;
    }
    return true;
  },
  buildRequests: function (validBidRequests, bidderRequest) {
    const combinedRequestsObject = {};

    const generalObject = validBidRequests[0];
    combinedRequestsObject.params = generateGeneralParams(generalObject, bidderRequest, ADAPTER_VERSION);
    combinedRequestsObject.bids = generateBidsParams(validBidRequests, bidderRequest);
    combinedRequestsObject.bids.timestamp = timestamp();

    const options = {
      withCredentials: false
    };

    return {
      method: 'POST',
      url: BASE_URL,
      data: combinedRequestsObject,
      options
    };
  },
  interpretResponse: function ({ body }) {
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
  getUserSyncs: function (syncOptions, serverResponses) {
    const syncs = [];
    for (const response of serverResponses) {
      if (response.body && response.body.params) {
        if (syncOptions.iframeEnabled && deepAccess(response, 'body.params.userSyncURL')) {
          syncs.push({
            type: 'iframe',
            url: deepAccess(response, 'body.params.userSyncURL')
          });
        }
        if (syncOptions.pixelEnabled && isArray(deepAccess(response, 'body.params.userSyncPixels'))) {
          const pixels = response.body.params.userSyncPixels.map(pixel => {
            return {
              type: 'image',
              url: pixel
            };
          });
          syncs.push(...pixels);
        }
      }
    }
    return syncs;
  },
  onBidWon: function (bid) {
    if (bid == null) {
      return;
    }
    logInfo('onBidWon:', bid);
    ajax(DEFAULT_IMPS_ENDPOINT, null, JSON.stringify(bid), { method: 'POST', mode: 'no-cors', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
    if (bid.hasOwnProperty('nurl') && bid.nurl.length > 0) {
      triggerPixel(bid.nurl);
    }
  },
};

registerBidder(spec);
