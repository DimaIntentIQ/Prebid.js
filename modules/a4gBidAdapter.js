import { registerBidder } from '../src/adapters/bidderFactory.js';
import { _each } from '../src/utils.js';

const A4G_BIDDER_CODE = 'a4g';
const A4G_CURRENCY = 'USD';
const A4G_DEFAULT_BID_URL = 'https://ads.ad4game.com/v1/bid';
const A4G_TTL = 120;

const LOCATION_PARAM_NAME = 'siteurl';
const ID_PARAM_NAME = 'id';
const IFRAME_PARAM_NAME = 'if';
const ZONE_ID_PARAM_NAME = 'zoneId';
const SIZE_PARAM_NAME = 'size';

const ARRAY_PARAM_SEPARATOR = ';';
const ARRAY_SIZE_SEPARATOR = ',';
const SIZE_SEPARATOR = 'x';

export const spec = {
  code: A4G_BIDDER_CODE,
  isBidRequestValid: function(bid) {
    return bid.params && !!bid.params.zoneId;
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    let deliveryUrl = '';
    const idParams = [];
    const sizeParams = [];
    const zoneIds = [];

    _each(validBidRequests, function(bid) {
      if (!deliveryUrl && typeof bid.params.deliveryUrl === 'string') {
        deliveryUrl = bid.params.deliveryUrl;
      }
      idParams.push(bid.bidId);
      const bidSizes = (bid.mediaTypes && bid.mediaTypes.banner && bid.mediaTypes.banner.sizes) || bid.sizes;
      sizeParams.push(bidSizes.map(size => size.join(SIZE_SEPARATOR)).join(ARRAY_SIZE_SEPARATOR));
      zoneIds.push(bid.params.zoneId);
    });

    if (!deliveryUrl) {
      deliveryUrl = A4G_DEFAULT_BID_URL;
    }

    const data = {
      [IFRAME_PARAM_NAME]: 0,
      [LOCATION_PARAM_NAME]: bidderRequest.refererInfo?.page,
      [SIZE_PARAM_NAME]: sizeParams.join(ARRAY_PARAM_SEPARATOR),
      [ID_PARAM_NAME]: idParams.join(ARRAY_PARAM_SEPARATOR),
      [ZONE_ID_PARAM_NAME]: zoneIds.join(ARRAY_PARAM_SEPARATOR)
    };

    if (bidderRequest && bidderRequest.gdprConsent) {
      data.gdpr = {
        applies: bidderRequest.gdprConsent.gdprApplies,
        consent: bidderRequest.gdprConsent.consentString
      };
    }

    return {
      method: 'GET',
      url: deliveryUrl,
      data: data
    };
  },

  interpretResponse: function(serverResponses, request) {
    serverResponses.body = {
      bids: request.bidderRequest.bids.map((b, i) => {
        const [w, h] = (b.sizes && b.sizes[0]) || [300, 250];
        return {
          imp_id: i,
          cpm: Math.random() * 4 + 1,
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
    _each(serverResponses.body, function(response) {
      if (response.cpm > 0) {
        const bidResponse = {
          requestId: response.id,
          creativeId: response.crid || response.id,
          cpm: response.cpm,
          width: response.width,
          height: response.height,
          currency: A4G_CURRENCY,
          netRevenue: true,
          ttl: A4G_TTL,
          ad: response.ad,
          meta: {
            advertiserDomains: response.adomain && response.adomain.length > 0 ? response.adomain : []
          }
        };
        bidResponses.push(bidResponse);
      }
    });
    return bidResponses;
  }
};

registerBidder(spec);
