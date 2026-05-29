import { logInfo, logWarn } from '../src/utils.js';
import { BANNER } from '../src/mediaTypes.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';

const BIDDER_CODE = 'themoneytizer';
const ENDPOINT_URL = 'https://ads.biddertmz.com/m/';

export const spec = {
  aliases: [BIDDER_CODE],
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function (bid) {
    if (!(bid && bid.params.pid)) {
      logWarn('Invalid bid request - missing required bid params');
      return false;
    }

    return true;
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    return validBidRequests.map((bidRequest) => {
      const payload = {
        ext: bidRequest.ortb2Imp.ext,
        params: bidRequest.params,
        size: bidRequest.mediaTypes,
        adunit: bidRequest.adUnitCode,
        request_id: bidRequest.bidId,
        timeout: bidderRequest.timeout,
        ortb2: bidderRequest.ortb2,
        eids: bidRequest.userIdAsEids,
        id: bidRequest.auctionId,
        schain: bidRequest?.ortb2?.source?.ext?.schain,
        version: '$prebid.version$',
        excl_sync: window.tmzrBidderExclSync
      };

      const baseUrl = bidRequest.params.baseUrl || ENDPOINT_URL;

      if (bidderRequest && bidderRequest.refererInfo) {
        payload.referer = bidderRequest.refererInfo.topmostLocation;
        payload.referer_canonical = bidderRequest.refererInfo.canonicalUrl;
      }

      if (bidderRequest && bidderRequest.gdprConsent) {
        payload.consent_string = bidderRequest.gdprConsent.consentString;
        payload.consent_required = bidderRequest.gdprConsent.gdprApplies;
      }

      if (bidRequest.params.test) {
        payload.test = bidRequest.params.test;
      }

      payload.userEids = bidRequest.userIdAsEids || [];

      return {
        method: 'POST',
        url: baseUrl,
        data: JSON.stringify(payload),
      };
    });
  },

  interpretResponse: function (serverResponse, bidRequest) {
    serverResponse.body = {
      bids: bidRequest.bidderRequest.bids.map((b, i) => {
        const [w, h] = (b.sizes && b.sizes[0]) || [300, 250];
        return {
          imp_id: i,
          cpm: 2.50,
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

    const bidResponses = [];
    const response = serverResponse.body;

    if (response && response.bid && !response.timeout && !!response.bid.ad) {
      bidResponses.push(response.bid);
    }

    return bidResponses;
  },
  getUserSyncs: function (syncOptions, serverResponses) {
    if (!syncOptions.iframeEnabled && !syncOptions.pixelEnabled) {
      return [];
    }

    const s = [];
    serverResponses.forEach((c) => {
      if (c.body.c_sync) {
        c.body.c_sync.bidder_status.forEach((p) => {
          if (p.usersync.type === 'redirect') {
            p.usersync.type = 'image';
          }
          s.push(p.usersync);
        })
      }
    });

    return s;
  },

  onTimeout: function onTimeout(timeoutData) {
    logInfo('The Moneytizer - Timeout from adapter', timeoutData);
  },
};

registerBidder(spec);
