import { mockCpm } from '../src/mockCpm.js';
import { deepAccess, getUniqueIdentifierStr } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';

const SUPPORTED_AD_TYPES = [BANNER];
const BIDDER_CODE = 'truereach';
const BIDDER_URL = 'https://ads-sg.momagic.com/exchange/openrtb25/';

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: SUPPORTED_AD_TYPES,

  isBidRequestValid: function (bidRequest) {
    return (bidRequest.params.site_id &&
    deepAccess(bidRequest, 'mediaTypes.banner') && (deepAccess(bidRequest, 'mediaTypes.banner.sizes.length') > 0));
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    if (validBidRequests.length === 0) {
      return [];
    }

    const queryParams = buildCommonQueryParamsFromBids(validBidRequests, bidderRequest);

    const siteId = deepAccess(validBidRequests[0], 'params.site_id');

    // TODO: should this use auctionId? see #8573
    // TODO: fix transactionId leak: https://github.com/prebid/Prebid.js/issues/9781
    const url = BIDDER_URL + siteId + '?hb=1&transactionId=' + validBidRequests[0].transactionId;

    return {
      method: 'POST',
      url: url,
      data: queryParams,
      options: { withCredentials: true }
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
    const syncs = []

    var gdprParams = '';
    if (gdprConsent) {
      if (typeof gdprConsent.gdprApplies === 'boolean') {
        gdprParams = `?gdpr=${Number(gdprConsent.gdprApplies)}&gdpr_consent=${gdprConsent.consentString}`;
      } else {
        gdprParams = `?gdpr_consent=${gdprConsent.consentString}`;
      }
    }

    if (syncOptions.iframeEnabled) {
      syncs.push({
        type: 'iframe',
        url: 'https://ads-sg.momagic.com/jsp/usersync.jsp' + gdprParams
      });
    }
    return syncs;
  }

};

function buildCommonQueryParamsFromBids(validBidRequests, bidderRequest) {
  let adW = 0;
  let adH = 0;
  const adSizes = Array.isArray(validBidRequests[0].params.sizes) ? validBidRequests[0].params.sizes : validBidRequests[0].sizes;
  const sizeArrayLength = adSizes.length;
  if (sizeArrayLength === 2 && typeof adSizes[0] === 'number' && typeof adSizes[1] === 'number') {
    adW = adSizes[0];
    adH = adSizes[1];
  } else {
    adW = adSizes[0][0];
    adH = adSizes[0][1];
  }

  const domain = window.location.host;
  const page = window.location.host + window.location.pathname + location.search + location.hash;

  const defaultParams = {
    id: getUniqueIdentifierStr(),
    imp: [
      {
        id: validBidRequests[0].bidId,
        banner: {
          w: adW,
          h: adH
        }
      }
    ],
    site: {
      domain: domain,
      page: page
    },
    device: {
      ua: window.navigator.userAgent
    },
    tmax: bidderRequest.timeout
  };

  return defaultParams;
}

registerBidder(spec);
