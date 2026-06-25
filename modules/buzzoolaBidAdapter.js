import { mockCpm } from '../src/mockCpm.js';
import { deepAccess, deepClone } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO, NATIVE } from '../src/mediaTypes.js';
import { Renderer } from '../src/Renderer.js';
import { OUTSTREAM } from '../src/video.js';
import { convertOrtbRequestToProprietaryNative } from '../src/native.js';

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 * @typedef {import('../src/adapters/bidderFactory.js').ServerResponse} ServerResponse
 */

const BIDDER_CODE = 'buzzoola';
const ENDPOINT = 'https://exchange.buzzoola.com/ssp/prebidjs';
const RENDERER_SRC = 'https://tube.buzzoola.com/new/build/buzzlibrary.js';

export const spec = {
  code: BIDDER_CODE,
  aliases: ['buzzoolaAdapter'],
  supportedMediaTypes: [BANNER, VIDEO, NATIVE],

  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {BidRequest} bid The bid params to validate.
   * @return {boolean} True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function (bid) {
    const types = bid.mediaTypes;
    return !!(bid && bid.mediaTypes && (types.banner || types.video || types.native) && bid.params && bid.params.placementId);
  },

  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {BidRequest[]} validBidRequests an array of bids
   * @param bidderRequest
   * @return ServerRequest Info describing the request to the server.
   */
  buildRequests: function (validBidRequests, bidderRequest) {
    // convert Native ORTB definition to old-style prebid native definition
    bidderRequest.bids = convertOrtbRequestToProprietaryNative(bidderRequest.bids);

    return {
      url: ENDPOINT,
      method: 'POST',
      data: bidderRequest,
    }
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
  }
};

/**
 * Initialize Buzzoola Outstream player
 *
 * @param bid
 */
function setOutstreamRenderer(bid) {
  const adData = JSON.parse(bid.ad);
  const unitSettings = deepAccess(adData, 'placement.unit_settings');
  const extendedSettings = {
    width: '' + bid.width,
    height: '' + bid.height,
    container_height: '' + bid.height
  };

  adData.placement = Object.assign({}, adData.placement);
  adData.placement.unit_settings = Object.assign({}, unitSettings, extendedSettings);

  bid.renderer.push(() => {
    window.Buzzoola.Core.install(document.querySelector(`#${bid.adUnitCode}`), {
      data: adData
    });
  });
}

registerBidder(spec);
