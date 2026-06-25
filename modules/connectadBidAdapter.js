import { mockCpm } from '../src/mockCpm.js';
import { deepAccess, deepSetValue, mergeDeep, logWarn, generateUUID } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js'
import { config } from '../src/config.js';
import { tryAppendQueryString } from '../libraries/urlUtils/urlUtils.js';
import { getDNT } from '../libraries/dnt/index.js';

const BIDDER_CODE = 'connectad';
const BIDDER_CODE_ALIAS = 'connectadrealtime';
const ENDPOINT_URL = 'https://i.connectad.io/api/v2';
const SUPPORTED_MEDIA_TYPES = [BANNER];

export const spec = {
  code: BIDDER_CODE,
  gvlid: 138,
  aliases: [BIDDER_CODE_ALIAS],
  supportedMediaTypes: SUPPORTED_MEDIA_TYPES,

  isBidRequestValid: function(bid) {
    return !!(bid.params.networkId && bid.params.siteId);
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    const ret = {
      method: 'POST',
      url: '',
      data: '',
      bidRequest: []
    };

    if (validBidRequests.length < 1) {
      return ret;
    }

    const sellerDefinedAudience = deepAccess(bidderRequest, 'ortb2.user.data', config.getAnyConfig('ortb2.user.data'));
    const sellerDefinedContext = deepAccess(bidderRequest, 'ortb2.site.content.data', config.getAnyConfig('ortb2.site.content.data'));

    const data = Object.assign({
      placements: [],
      time: Date.now(),
      url: bidderRequest.refererInfo?.page,
      referrer: bidderRequest.refererInfo?.ref,
      screensize: getScreenSize(),
      dnt: getDNT() ? 1 : 0,
      language: navigator.language,
      ua: navigator.userAgent,
      pversion: '$prebid.version$',
      cur: 'USD',
      user: {},
      regs: {},
      source: {},
      site: {},
      sda: sellerDefinedAudience,
      sdc: sellerDefinedContext,
    });

    const ortb2Params = bidderRequest?.ortb2 || {};
    ['site', 'user', 'device', 'bcat', 'badv', 'regs'].forEach(entry => {
      const ortb2Param = ortb2Params[entry];
      if (ortb2Param) {
        mergeDeep(data, { [entry]: ortb2Param });
      }
    });

    // coppa compliance
    if (config.getConfig('coppa') === true) {
      deepSetValue(data, 'regs.coppa', 1);
    }

    // adding schain object
    const schain = validBidRequests[0]?.ortb2?.source?.ext?.schain;
    if (schain) {
      deepSetValue(data, 'source.ext.schain', schain);
    }

    // Attaching GDPR Consent Params
    if (bidderRequest.gdprConsent) {
      let gdprApplies;
      if (typeof bidderRequest.gdprConsent.gdprApplies === 'boolean') {
        gdprApplies = bidderRequest.gdprConsent.gdprApplies ? 1 : 0;
      }
      deepSetValue(data, 'user.ext.gdpr', gdprApplies);
      deepSetValue(data, 'user.ext.consent', bidderRequest.gdprConsent.consentString);
    }

    // CCPA
    if (bidderRequest.uspConsent) {
      deepSetValue(data, 'user.ext.us_privacy', bidderRequest.uspConsent);
    }

    // GPP Support
    if (bidderRequest?.gppConsent?.gppString) {
      deepSetValue(data, 'regs.gpp', bidderRequest.gppConsent.gppString);
      deepSetValue(data, 'regs.gpp_sid', bidderRequest.gppConsent.applicableSections);
    } else if (bidderRequest?.ortb2?.regs?.gpp) {
      deepSetValue(data, 'regs.gpp', bidderRequest.ortb2.regs.gpp);
      deepSetValue(data, 'regs.gpp_sid', bidderRequest.ortb2.regs.gpp_sid);
    }

    // DSA Support
    if (bidderRequest?.ortb2?.regs?.ext?.dsa) {
      deepSetValue(data, 'regs.ext.dsa', bidderRequest.ortb2.regs.ext.dsa);
    }

    // EIDS Support
    if (validBidRequests[0].userIdAsEids) {
      deepSetValue(data, 'user.ext.eids', validBidRequests[0].userIdAsEids);
    }

    const tid = deepAccess(bidderRequest, 'ortb2.source.tid')
    if (tid) {
      deepSetValue(data, 'source.tid', tid)
    }
    data.tmax = bidderRequest.timeout;

    validBidRequests.forEach(bid => {
      const placement = Object.assign({
        id: generateUUID(),
        divName: bid.bidId,
        tagId: bid.adUnitCode,
        pisze: bid.mediaTypes.banner.sizes[0] || bid.sizes[0],
        sizes: bid.mediaTypes.banner.sizes,
        bidfloor: getBidFloor(bid),
        siteId: bid.params.siteId,
        networkId: bid.params.networkId,
        tid: bid.ortb2Imp?.ext?.tid
      });

      const gpid = deepAccess(bid, 'ortb2Imp.ext.gpid');
      if (gpid) {
        placement.gpid = gpid;
      }

      if (placement.networkId && placement.siteId) {
        data.placements.push(placement);
      }
    });

    ret.data = JSON.stringify(data);
    ret.bidRequest = validBidRequests;
    ret.url = ENDPOINT_URL;

    return ret;
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

  getUserSyncs: (syncOptions, responses, gdprConsent, uspConsent, gppConsent) => {
    const pixelType = syncOptions.iframeEnabled ? 'iframe' : 'image';
    let syncEndpoint;

    if (pixelType === 'iframe') {
      syncEndpoint = 'https://sync.connectad.io/iFrameSyncer?';
    } else {
      syncEndpoint = 'https://sync.connectad.io/ImageSyncer?';
    }

    if (gdprConsent) {
      syncEndpoint = tryAppendQueryString(syncEndpoint, 'gdpr', (gdprConsent.gdprApplies ? 1 : 0));
    }

    if (gdprConsent && typeof gdprConsent.consentString === 'string') {
      syncEndpoint = tryAppendQueryString(syncEndpoint, 'gdpr_consent', gdprConsent.consentString);
    }

    if (uspConsent) {
      syncEndpoint = tryAppendQueryString(syncEndpoint, 'us_privacy', uspConsent);
    }

    if (gppConsent?.gppString && gppConsent?.applicableSections?.length) {
      syncEndpoint = tryAppendQueryString(syncEndpoint, 'gpp', gppConsent.gppString);
      syncEndpoint = tryAppendQueryString(syncEndpoint, 'gpp_sid', gppConsent?.applicableSections?.join(','));
    }

    if (config.getConfig('coppa') === true) {
      syncEndpoint = tryAppendQueryString(syncEndpoint, 'coppa', 1);
    }

    if (syncOptions.iframeEnabled || syncOptions.pixelEnabled) {
      return [{
        type: pixelType,
        url: syncEndpoint
      }];
    } else {
      logWarn('Bidder ConnectAd: No User-Matching allowed');
    }
  }
};

function getBidFloor(bidRequest) {
  let floorInfo = {};

  if (typeof bidRequest.getFloor === 'function') {
    floorInfo = bidRequest.getFloor({
      currency: 'USD',
      mediaType: 'banner',
      size: '*'
    });
  }

  const floor = floorInfo?.floor || bidRequest.params.bidfloor || bidRequest.params.floorprice || 0;

  return floor;
}

function retrieveAd(decision) {
  return decision.contents && decision.contents[0] && decision.contents[0].body;
}

function getScreenSize() {
  return [window.screen.width, window.screen.height].join('x');
}

registerBidder(spec);
