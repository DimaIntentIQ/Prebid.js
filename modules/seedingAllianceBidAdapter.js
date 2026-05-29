// jshint esversion: 6, es3: false, node: true
'use strict';

import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, NATIVE } from '../src/mediaTypes.js';
import { generateUUID, deepSetValue, isEmpty, replaceAuctionPrice } from '../src/utils.js';
import { config } from '../src/config.js';
import { getStorageManager } from '../src/storageManager.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js';

const GVL_ID = 371;
const BIDDER_CODE = 'seedingAlliance';
const DEFAULT_CUR = 'EUR';
const ENDPOINT_URL = 'https://b.nativendo.de/cds/rtb/bid?format=openrtb2.5&ssp=pb';
const NATIVENDO_KEY = 'nativendo_id';

export const storage = getStorageManager({ bidderCode: BIDDER_CODE });

const converter = ortbConverter({
  context: {
    ttl: 360,
    netRevenue: true
  },
  request(buildRequest, imps, bidderRequest, context) {
    const request = buildRequest(imps, bidderRequest, context);
    // set basic page, this might be updated later by adunit param
    deepSetValue(request, 'site.page', bidderRequest.refererInfo.page);
    deepSetValue(request, 'regs.ext.pb_ver', '$prebid.version$');
    deepSetValue(request, 'cur', [config.getConfig('currency.adServerCurrency') || DEFAULT_CUR]);

    // As this is client side, we get needed info from headers
    delete request.device;

    return request;
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    // add tagid from params
    imp.tagid = bidRequest.params.adUnitId;

    return imp;
  }
});

export const spec = {
  code: BIDDER_CODE,
  gvlid: GVL_ID,
  supportedMediaTypes: [NATIVE, BANNER],

  isBidRequestValid: function (bid) {
    return !!bid.params.adUnitId;
  },

  buildRequests: (validBidRequests = [], bidderRequest) => {
    const oRtbRequest = converter.toORTB({ bidRequests: validBidRequests, bidderRequest });
    const eids = getEids(validBidRequests[0]);

    // check for url in params and set in site object
    validBidRequests.forEach(bidRequest => {
      if (bidRequest.params.url) {
        deepSetValue(oRtbRequest, 'site.page', bidRequest.params.url);
      }
    });

    if (bidderRequest.gdprConsent) {
      oRtbRequest.user = {};

      deepSetValue(oRtbRequest, 'user.ext.consent', bidderRequest.gdprConsent.consentString);
      deepSetValue(oRtbRequest, 'regs.ext.gdpr', (typeof bidderRequest.gdprConsent.gdprApplies === 'boolean' && bidderRequest.gdprConsent.gdprApplies) ? 1 : 0);
      deepSetValue(oRtbRequest, 'user.ext.eids', eids);
    }

    const endpoint = config.getConfig('seedingAlliance.endpoint') || ENDPOINT_URL;

    return {
      method: 'POST',
      url: endpoint,
      data: JSON.stringify(oRtbRequest),
      bidRequests: validBidRequests
    };
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

const getNativendoID = () => {
  let nativendoID = storage.localStorageIsEnabled() &&
      storage.getDataFromLocalStorage(NATIVENDO_KEY);

  if (!nativendoID) {
    if (storage.localStorageIsEnabled()) {
      nativendoID = generateUUID();
      storage.setDataInLocalStorage(NATIVENDO_KEY, nativendoID);
    }
  }

  return nativendoID;
}

const getEids = (bidRequest) => {
  const eids = [];
  const nativendoID = getNativendoID();

  if (nativendoID) {
    const nativendoUserEid = {
      source: 'nativendo.de',
      uids: [
        {
          id: nativendoID,
          atype: 1
        }
      ]
    };

    eids.push(nativendoUserEid);
  }

  if (bidRequest.userIdAsEids) {
    eids.push(bidRequest.userIdAsEids);
  }

  return eids;
}

function flatten(arr) {
  return [].concat(...arr);
}

function parseNative(bid, nativeParams) {
  let native;
  if (typeof bid.adm === 'string') {
    try {
      native = JSON.parse(bid.adm).native;
    } catch (e) {
      return;
    }
  } else {
    native = bid.adm.native;
  }

  if (native.link.url) {
    native.link.url = native.link.url.replace(/\$\{AUCTION_PRICE\}/g, bid.price);
  }

  if (native.link.clicktrackers) {
    native.link.clicktrackers.forEach(function (clicktracker, index) {
      native.link.clicktrackers[index] = clicktracker.replace(/\$\{AUCTION_PRICE\}/g, bid.price);
    });
  }

  if (native.imptrackers) {
    native.imptrackers.forEach(function (imptracker, index) {
      native.imptrackers[index] = imptracker.replace(/\$\{AUCTION_PRICE\}/g, bid.price);
    });
  }

  if (native.eventtrackers) {
    native.eventtrackers.forEach(function(eventtracker, index) {
      native.eventtrackers[index].url = eventtracker.url.replace(/\$\{AUCTION_PRICE\}/g, bid.price);
    })
  }

  return {
    ortb: native,
    clickUrl: native.link.url,
    clickTrackers: native.link.clicktrackers || [],
    impressionTrackers: native.imptrackers || []
  };
}

registerBidder(spec);
