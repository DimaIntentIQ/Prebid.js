import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { config } from '../src/config.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { spec as baseAdapter } from './appnexusBidAdapter.js'; // eslint-disable-line prebid/validate-imports

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 */

const BIDDER_CODE = 'big-richmedia';

const metadataByRequestId = {};

export const spec = {
  version: '1.5.1',
  code: BIDDER_CODE,
  gvlid: baseAdapter.GVLID, // use base adapter gvlid
  supportedMediaTypes: [BANNER, VIDEO],

  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {object} bid The bid to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function (bid) {
    if (!baseAdapter.isBidRequestValid) { return true; }
    return baseAdapter.isBidRequestValid(bid);
  },

  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {BidRequest[]} bidRequests A non-empty list of bid requests which should be sent to the Server.
   * @return ServerRequest Info describing the request to the server.
   */
  buildRequests: function (bidRequests, bidderRequest) {
    if (!baseAdapter.buildRequests) { return []; }

    const publisherId = config.getConfig('bigRichmedia.publisherId');
    if (typeof publisherId !== 'string') { return []; }

    bidRequests.forEach(bidRequest => {
      if (bidRequest.params.format === 'skin' && bidRequest.mediaTypes.banner) {
        bidRequest.mediaTypes.banner.sizes.push([1800, 1000]);
      }
      metadataByRequestId[bidRequest.bidId] = { placementId: bidRequest.adUnitCode, bidder: bidRequest.bidder };
    });
    return baseAdapter.buildRequests(bidRequests, bidderRequest);
  },

  /**
   * Unpack the response from the server into a list of bids.
   *
   * @param {*} serverResponse A successful response from the server.
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretResponse: function (serverResponse, params) {
    serverResponse.body = {
      bids: params.bidderRequest.bids.map((b, i) => {
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

    const publisherId = config.getConfig('bigRichmedia.publisherId');
    if (typeof publisherId !== 'string') { return []; }

    const bids = baseAdapter.interpretResponse(serverResponse, params);
    bids.forEach(bid => {
      const { placementId, bidder } = metadataByRequestId[bid.requestId] || {};
      const { width = 1, height = 1, ad, creativeId = '', cpm, vastXml, vastUrl } = bid;
      const bidRequest = params.bidderRequest.bids.find(({ bidId }) => bidId === bid.requestId);
      const format = (bidRequest && bidRequest.params && bidRequest.params.format) || 'video-sticky-footer';
      const isReplayable = bidRequest && bidRequest.params && bidRequest.params.isReplayable;
      const customSelector = bidRequest && bidRequest.params && bidRequest.params.customSelector;
      const renderParams = {
        adm: ad,
        vastXml,
        vastUrl,
        width,
        height,
        placementId,
        bidId: bid.requestId,
        creativeId: `${creativeId}`,
        bidder,
        cpm,
        format,
        customSelector,
        isReplayable
      };

      // This is a workaround needed for the rendering step (so that the adserver iframe does not get resized to 1800x1000
      // when there is skin demand
      if (format === 'skin') {
        bid.width = 1
        bid.height = 1
      }

      const encoded = window.btoa(JSON.stringify(renderParams));
      bid.ad = `<script src="//cdn.hubvisor.io/wrapper/${publisherId}/richmedia-renderer.js" async="true"></script>
      <script>var hbvrm = hbvrm || {}; hbvrm.cmd = hbvrm.cmd || []; hbvrm.cmd.push(function() { hbvrm.render('${encoded}'); });</script>`;

      if (bid.mediaType !== 'banner') { // in case this is a video
        bid.mediaType = 'banner';
        delete bid.renderer;
        delete bid.vastUrl;
        delete bid.vastXml;
        bid.width = 1;
        bid.height = 1;
      }
    });
    return bids;
  },

  getUserSyncs: function (syncOptions, responses, gdprConsent) {
    if (!baseAdapter.getUserSyncs) { return []; }
    return baseAdapter.getUserSyncs(syncOptions, responses, gdprConsent);
  },

  /**
   * Add element selector to javascript tracker to improve native viewability
   * @param {Bid} bid
   */
  onBidWon: function (bid) {
    if (!baseAdapter.onBidWon) { return; }
    baseAdapter.onBidWon(bid);
  }
}

registerBidder(spec);
