import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { getStorageManager } from '../src/storageManager.js';
import { ajax } from '../src/ajax.js';
import { config } from '../src/config.js';
import { getWinDimensions } from '../src/utils.js';

const BIDDER_CODE = 'lasso';
const ENDPOINT_URL = 'https://trc.lhmos.com/prebid';
const GET_IUD_URL = 'https://secure.adnxs.com/getuid?';
const COOKIE_NAME = 'aim-xr';
const storage = getStorageManager({ bidderCode: BIDDER_CODE });

export const spec = {
  code: BIDDER_CODE,
  isBidRequestValid: function(bid) {
    return !!(bid.params && bid.params.adUnitId);
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    if (validBidRequests.length === 0) {
      return [];
    }

    let aimXR = '';
    if (storage.cookiesAreEnabled) {
      aimXR = storage.getCookie(COOKIE_NAME, undefined);
    }

    return validBidRequests.map(bidRequest => {
      let sizes = []
      if (bidRequest.mediaTypes && bidRequest.mediaTypes[BANNER] && bidRequest.mediaTypes[BANNER].sizes) {
        sizes = bidRequest.mediaTypes[BANNER].sizes;
      }

      const { params } = bidRequest;

      let npi = params.npi || '';
      let dgid = params.dgid || '';
      let aimOnly = params.aimOnly || '';
      let test = false;
      let testDk = '';

      if (params.testNPI) {
        npi = params.testNPI;
        test = true;
      }

      if (params.testDGID) {
        dgid = params.testDGID;
        test = true;
      }

      if (params.testDk) {
        testDk = params.testDk;
        test = true;
      }

      const payload = {
        auctionStart: bidderRequest.auctionStart,
        url: encodeURIComponent(window.location.href),
        bidderRequestId: bidRequest.bidderRequestId,
        adUnitCode: bidRequest.adUnitCode,
        auctionId: bidRequest.auctionId,
        bidId: bidRequest.bidId,
        transactionId: bidRequest.ortb2Imp?.ext?.tid,
        device: encodeURIComponent(JSON.stringify(getDeviceData())),
        sizes,
        aimXR,
        uid: '$UID',
        npi,
        dgid,
        npi_hash: params.npiHash || '',
        params: JSON.stringify(bidRequest.params),
        crumbs: JSON.stringify(bidRequest.crumbs),
        prebidVersion: '$prebid.version$',
        version: 4,
        coppa: config.getConfig('coppa') === true ? 1 : 0,
        ccpa: bidderRequest.uspConsent || undefined,
        test,
        testDk,
        aimOnly
      }

      if (
        bidderRequest &&
        bidderRequest.gppConsent &&
        bidderRequest.gppConsent.gppString
      ) {
        payload.gpp = bidderRequest.gppConsent.gppString;
        payload.gppSid = bidderRequest.gppConsent.applicableSections;
      }

      return {
        method: 'GET',
        url: getBidRequestUrl(aimXR, bidRequest.params),
        data: payload,
        options: {
          withCredentials: true
        },
      };
    });
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
    if (timeoutData === null) {
      return;
    }
    ajax(ENDPOINT_URL + '/timeout', null, JSON.stringify(timeoutData), {
      method: 'POST',
      withCredentials: false
    });
  },

  onBidWon: function(bid) {
    ajax(ENDPOINT_URL + '/won', null, JSON.stringify(bid), {
      method: 'POST',
      withCredentials: false
    });
  },

  supportedMediaTypes: [BANNER]
}

function getBidRequestUrl(aimXR, params) {
  const { npi, dgid, npiHash, testNPI, testDGID, aimOnly, testDk, dtc } = params;
  let path = '/request';
  if (dtc) {
    path = '/dtc-request';
  }
  if (aimXR || npi || dgid || npiHash || testNPI || testDGID || aimOnly || testDk) {
    return ENDPOINT_URL + path;
  }
  return GET_IUD_URL + ENDPOINT_URL + path;
}

function getDeviceData() {
  const win = window.top;
  const winDimensions = getWinDimensions();
  return {
    ua: navigator.userAgent,
    width: winDimensions.innerWidth || winDimensions.document.documentElement.clientWidth || win.document.body.clientWidth,
    height: winDimensions.innerHeight || winDimensions.document.documentElement.clientHeight || win.document.body.clientHeight,
    browserLanguage: navigator.language,
  }
}

registerBidder(spec);
