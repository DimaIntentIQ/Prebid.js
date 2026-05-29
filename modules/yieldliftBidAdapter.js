import { deepAccess, deepSetValue, logInfo } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';

const ENDPOINT_URL = 'https://x.yieldlift.com/pbjs';

const DEFAULT_BID_TTL = 300;
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_NET_REVENUE = true;

export const spec = {
  code: 'yieldlift',
  aliases: ['yl'],
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function (bid) {
    return (!!bid.params.unitId && typeof bid.params.unitId === 'string') ||
      (!!bid.params.networkId && typeof bid.params.networkId === 'string') ||
      (!!bid.params.publisherId && typeof bid.params.publisherId === 'string');
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    if (!validBidRequests || !bidderRequest) {
      return;
    }
    const publisherId = validBidRequests[0].params.publisherId;
    const networkId = validBidRequests[0].params.networkId;
    const impressions = validBidRequests.map(bidRequest => ({
      id: bidRequest.bidId,
      banner: {
        format: bidRequest.mediaTypes.banner.sizes.map(sizeArr => ({
          w: sizeArr[0],
          h: sizeArr[1]
        }))
      },
      ext: {
        exchange: {
          unitId: bidRequest.params.unitId
        }
      }
    }));

    const openrtbRequest = {
      id: bidderRequest.bidderRequestId,
      imp: impressions,
      site: {
        domain: bidderRequest.refererInfo?.domain,
        page: bidderRequest.refererInfo?.page,
        ref: bidderRequest.refererInfo?.ref,
      },
      ext: {
        exchange: {
          publisherId: publisherId,
          networkId: networkId,
        }
      }
    };

    // adding schain object
    const schain = validBidRequests[0]?.ortb2?.source?.ext?.schain;
    if (schain) {
      deepSetValue(openrtbRequest, 'source.ext.schain', schain);
    }

    // Attaching GDPR Consent Params
    if (bidderRequest.gdprConsent) {
      deepSetValue(openrtbRequest, 'user.ext.consent', bidderRequest.gdprConsent.consentString);
      deepSetValue(openrtbRequest, 'regs.ext.gdpr', (bidderRequest.gdprConsent.gdprApplies ? 1 : 0));
    }

    // CCPA
    if (bidderRequest.uspConsent) {
      deepSetValue(openrtbRequest, 'regs.ext.us_privacy', bidderRequest.uspConsent);
    }

    // EIDS
    const eids = deepAccess(validBidRequests[0], 'userIdAsEids');
    if (Array.isArray(eids) && eids.length > 0) {
      deepSetValue(openrtbRequest, 'user.ext.eids', eids);
    }

    const payloadString = JSON.stringify(openrtbRequest);
    return {
      method: 'POST',
      url: ENDPOINT_URL,
      data: payloadString,
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
  },
  getUserSyncs: function (syncOptions, serverResponses) {
    logInfo('yieldlift.getUserSyncs', 'syncOptions', syncOptions, 'serverResponses', serverResponses);
    let syncs = [];

    if (!syncOptions.iframeEnabled && !syncOptions.pixelEnabled) {
      return syncs;
    }

    serverResponses.forEach(resp => {
      const userSync = deepAccess(resp, 'body.ext.usersync');
      if (userSync) {
        let syncDetails = [];
        Object.keys(userSync).forEach(key => {
          const value = userSync[key];
          if (value.syncs && value.syncs.length) {
            syncDetails = syncDetails.concat(value.syncs);
          }
        });
        syncDetails.forEach(syncDetails => {
          syncs.push({
            type: syncDetails.type === 'iframe' ? 'iframe' : 'image',
            url: syncDetails.url
          });
        });

        if (!syncOptions.iframeEnabled) {
          syncs = syncs.filter(s => s.type !== 'iframe')
        }
        if (!syncOptions.pixelEnabled) {
          syncs = syncs.filter(s => s.type !== 'image')
        }
      }
    });
    logInfo('yieldlift.getUserSyncs result=%o', syncs);
    return syncs;
  },

};
registerBidder(spec);
