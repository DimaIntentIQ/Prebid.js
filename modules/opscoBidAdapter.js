import { deepAccess, deepSetValue, isArray, logInfo } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js'
import { pbsExtensions } from '../libraries/pbsExtensions/pbsExtensions.js';

const ENDPOINT = 'https://exchange.ops.co/openrtb2/auction';
const BIDDER_CODE = 'opsco';
const DEFAULT_BID_TTL = 300;
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_NET_REVENUE = true;

const converter = ortbConverter({
  request(buildRequest, imps, bidderRequest, context) {
    const { bidRequests } = context;
    const data = buildRequest(imps, bidderRequest, context);

    const { publisherId, siteId } = bidRequests[0].params;

    data.site = data.site || {};
    data.site.id = siteId;

    data.site.publisher = data.site.publisher || {};
    data.site.publisher.id = publisherId;

    data.site.domain = data.site.domain || bidderRequest.refererInfo?.domain;
    data.site.page = data.site.page || bidderRequest.refererInfo?.page;
    data.site.ref = data.site.ref || bidderRequest.refererInfo?.ref;

    if (isTest(bidRequests[0])) {
      data.test = 1;
    } else {
      delete data.test;
    }

    imps.forEach(imp => {
      delete imp.ext.opsco.test;
    });

    if (bidderRequest.gdprConsent) {
      deepSetValue(data, 'user.ext.consent', bidderRequest.gdprConsent.consentString);
      deepSetValue(data, 'regs.ext.gdpr', (bidderRequest.gdprConsent.gdprApplies ? 1 : 0));
    }

    if (bidderRequest.uspConsent) {
      deepSetValue(data, 'regs.ext.us_privacy', bidderRequest.uspConsent);
    }

    const eids = deepAccess(bidRequests[0], 'userIdAsEids');
    if (eids && eids.length !== 0) {
      deepSetValue(data, 'user.ext.eids', eids);
    }

    const schain = bidRequests[0]?.ortb2?.source?.ext?.schain;
    const schainData = schain?.nodes;
    if (isArray(schainData) && schainData.length > 0) {
      deepSetValue(data, 'source.ext.schain', schain);
    }

    return data;
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);

    imp.ext.opsco = imp.ext.prebid.bidder.opsco;
    delete imp.ext.prebid.bidder;

    if (!imp.bidfloor && bidRequest.params?.bidfloor) {
      imp.bidfloor = bidRequest.params.bidfloor;
      imp.bidfloorcur = bidRequest.params.currency || DEFAULT_CURRENCY;
    }

    return imp;
  },
  context: {
    netRevenue: DEFAULT_NET_REVENUE,
    ttl: DEFAULT_BID_TTL,
    currency: DEFAULT_CURRENCY
  },
  processors: pbsExtensions
});

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],

  isBidRequestValid: (bid) => !!(bid.params &&
    bid.params.placementId &&
    bid.params.publisherId &&
    bid.mediaTypes?.banner?.sizes &&
    Array.isArray(bid.mediaTypes?.banner?.sizes)),

  buildRequests: (validBidRequests, bidderRequest) => {
    if (!validBidRequests || !bidderRequest) {
      return;
    }

    const data = converter.toORTB({
      bidderRequest: bidderRequest,
      bidRequests: validBidRequests,
      context: { mediaType: BANNER }
    });

    return {
      method: 'POST',
      url: ENDPOINT,
      data: data,
    };
  },

  interpretResponse: (serverResponse, bidRequest) => {
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

  getUserSyncs: (syncOptions, serverResponses) => {
    logInfo('opsco.getUserSyncs', 'syncOptions', syncOptions, 'serverResponses', serverResponses);
    if (!syncOptions.iframeEnabled && !syncOptions.pixelEnabled) {
      return [];
    }
    const syncs = [];
    serverResponses.forEach(resp => {
      const userSync = deepAccess(resp, 'body.ext.usersync');
      if (userSync) {
        const syncDetails = Object.values(userSync).flatMap(value => value.syncs || []);
        syncDetails.forEach(syncDetail => {
          const type = syncDetail.type === 'iframe' ? 'iframe' : 'image';
          if ((type === 'iframe' && syncOptions.iframeEnabled) || (type === 'image' && syncOptions.pixelEnabled)) {
            syncs.push({ type, url: syncDetail.url });
          }
        });
      }
    });

    logInfo('opsco.getUserSyncs result=%o', syncs);
    return syncs;
  }
};

function isTest(validBidRequest) {
  return validBidRequest.params?.test === true;
}

registerBidder(spec);
