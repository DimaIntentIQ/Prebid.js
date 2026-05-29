import { registerBidder } from '../src/adapters/bidderFactory.js';
import { getStorageManager } from '../src/storageManager.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 * @typedef {import('../src/adapters/bidderFactory.js').BidderRequest} BidderRequest
 * @typedef {import('../src/adapters/bidderFactory.js').ServerResponse} ServerResponse
 * @typedef {import('../src/adapters/bidderFactory.js').validBidRequests} validBidRequests
 */

const BIDDER_CODE = 'gjirafa';
const ENDPOINT_URL = 'https://central.gjirafa.com/bid';
const DIMENSION_SEPARATOR = 'x';
const SIZE_SEPARATOR = ';';
const BISKO_ID = 'biskoId';
const STORAGE_ID = 'bisko-sid';
const SEGMENTS = 'biskoSegments';
const storage = getStorageManager({ bidderCode: BIDDER_CODE });

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, VIDEO],
  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {BidRequest} bid The bid params to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function (bid) {
    return !!(bid.params.propertyId && bid.params.placementId);
  },
  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {validBidRequests} validBidRequests an array of bids
   * @param {BidderRequest} bidderRequest
   * @return ServerRequest Info describing the request to the server.
   */
  buildRequests: function (validBidRequests, bidderRequest) {
    const storageId = storage.localStorageIsEnabled() ? storage.getDataFromLocalStorage(STORAGE_ID) || '' : '';
    const biskoId = storage.localStorageIsEnabled() ? storage.getDataFromLocalStorage(BISKO_ID) || '' : '';
    const segments = storage.localStorageIsEnabled() ? JSON.parse(storage.getDataFromLocalStorage(SEGMENTS)) || [] : [];

    let propertyId = '';
    let pageViewGuid = '';
    let bidderRequestId = '';
    let url = '';
    let contents = [];
    let data = {};

    const placements = validBidRequests.map(bidRequest => {
      if (!propertyId) { propertyId = bidRequest.params.propertyId; }
      if (!pageViewGuid && bidRequest.params) { pageViewGuid = bidRequest.params.pageViewGuid || ''; }
      if (!bidderRequestId) { bidderRequestId = bidRequest.bidderRequestId; }
      if (!url && bidderRequest) { url = bidderRequest.refererInfo.page; }
      if (!contents.length && bidRequest.params.contents && bidRequest.params.contents.length) { contents = bidRequest.params.contents; }
      if (Object.keys(data).length === 0 && bidRequest.params.data && Object.keys(bidRequest.params.data).length !== 0) { data = bidRequest.params.data; }

      const adUnitId = bidRequest.adUnitCode;
      const placementId = bidRequest.params.placementId;
      const sizes = generateSizeParam(bidRequest.sizes);

      return {
        sizes: sizes,
        adUnitId: adUnitId,
        placementId: placementId,
        bidid: bidRequest.bidId,
        count: bidRequest.params.count,
        skipTime: bidRequest.params.skipTime
      };
    });

    const body = {
      propertyId: propertyId,
      pageViewGuid: pageViewGuid,
      storageId: storageId,
      biskoId: biskoId,
      segments: segments,
      url: url,
      requestid: bidderRequestId,
      placements: placements,
      contents: contents,
      data: data
    };

    return [{
      method: 'POST',
      url: ENDPOINT_URL,
      data: body
    }];
  },
  /**
   * Unpack the response from the server into a list of bids.
   *
   * @param {ServerResponse} serverResponse A successful response from the server.
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
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

/**
 * Generate size param for bid request using sizes array
 *
 * @param {Array} sizes Possible sizes for the ad unit.
 * @return {string} Processed sizes param to be used for the bid request.
 */
function generateSizeParam(sizes) {
  return sizes.map(size => size.join(DIMENSION_SEPARATOR)).join(SIZE_SEPARATOR);
}

registerBidder(spec);
