import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { logMessage } from '../src/utils.js';
import {
  createDxConverter,
  MediaTypeUtils,
  ValidationUtils,
  UrlUtils,
  UserSyncUtils
} from '../libraries/dxUtils/common.js';

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 */

const ADAPTER_CONFIG = {
  code: 'dxtech',
  version: '1.0.0',
  currency: 'USD',
  ttl: 300,
  netRevenue: true,
  endpoint: 'https://ads.dxtech.ai/pbjs',
  rendererUrl: 'https://cdn.dxtech.ai/players/dxOutstreamPlayer.js',
  publisherParam: 'publisher_id',
  placementParam: 'placement_id'
};

const converter = createDxConverter(ADAPTER_CONFIG);

export const spec = {
  code: ADAPTER_CONFIG.code,
  VERSION: ADAPTER_CONFIG.version,
  supportedMediaTypes: [BANNER, VIDEO],
  ENDPOINT: ADAPTER_CONFIG.endpoint,

  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {BidRequest} bid The bid params to validate.
   * @return {boolean} True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function (bid) {
    return (
      ValidationUtils.validateParams(bid, ADAPTER_CONFIG.code) &&
      ValidationUtils.validateBanner(bid) &&
      ValidationUtils.validateVideo(bid, ADAPTER_CONFIG.code)
    );
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    const contextMediaType = MediaTypeUtils.detectContext(validBidRequests);
    const data = converter.toORTB({
      bidRequests: validBidRequests,
      bidderRequest,
      context: { contextMediaType }
    });

    let publisherId = validBidRequests[0].params.publisherId;
    let placementId = validBidRequests[0].params.placementId;

    if (validBidRequests[0].params.e2etest) {
      logMessage('dxtech: E2E test mode enabled');
      publisherId = 'e2etest';
      placementId = null;
    }

    const url = UrlUtils.buildEndpoint(
      ADAPTER_CONFIG.endpoint,
      publisherId,
      placementId,
      ADAPTER_CONFIG
    );

    return {
      method: 'POST',
      url: url,
      data: data
    };
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

    const bids = converter.fromORTB({
      response: serverResponse.body,
      request: bidRequest.data
    }).bids;
    return bids;
  },

  getUserSyncs: function (syncOptions, serverResponses, gdprConsent, uspConsent) {
    return UserSyncUtils.processUserSyncs(
      syncOptions,
      serverResponses,
      gdprConsent,
      uspConsent,
      ADAPTER_CONFIG.code
    );
  }
};

registerBidder(spec);
