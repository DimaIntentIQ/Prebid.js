import { registerBidder } from '../src/adapters/bidderFactory.js';
import * as utils from '../src/utils.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { ajax } from '../src/ajax.js';
import { Renderer } from '../src/Renderer.js';

const SUPPORTED_AD_TYPES = [BANNER, VIDEO];
const BIDDER_CODE = 'djax';
const DOMAIN = 'https://revphpe.djaxbidder.com/header_bidding_vast/';
const RENDERER_URL = 'https://acdn.adnxs.com/video/outstream/ANOutstreamVideo.js';

function outstreamRender(bidAd) {
  bidAd.renderer.push(() => {
    window.ANOutstreamVideo.renderAd({
      sizes: [bidAd.width, bidAd.height],
      width: bidAd.width,
      height: bidAd.height,
      targetId: bidAd.adUnitCode,
      adResponse: bidAd.adResponse,
      rendererOptions: {
        showVolume: false,
        allowFullscreen: false
      }
    });
  });
}

function createRenderer(bidAd, rendererParams, adUnitCode) {
  const renderer = Renderer.install({
    id: rendererParams.id,
    url: rendererParams.url,
    loaded: false,
    config: { 'player_height': bidAd.height, 'player_width': bidAd.width },
    adUnitCode
  });
  try {
    renderer.setRender(outstreamRender);
  } catch (err) {
    utils.logWarn('Prebid Error calling setRender on renderer', err);
  }
  return renderer;
}

function sendResponseToServer(data) {
  ajax(DOMAIN + 'www/admin/plugins/Prebid/tracking/track.php', null, JSON.stringify(data), {
    withCredentials: false,
    method: 'POST',
    crossOrigin: true
  });
}

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: SUPPORTED_AD_TYPES,

  isBidRequestValid: function(bid) {
    return (typeof bid.params !== 'undefined' && parseInt(utils.getValue(bid.params, 'publisherId')) > 0);
  },

  buildRequests: function(validBidRequests) {
    return {
      method: 'POST',
      url: DOMAIN + 'www/admin/plugins/Prebid/getAd.php',
      options: {
        withCredentials: false,
        crossOrigin: true
      },
      data: validBidRequests,
    };
  },

  interpretResponse: function(serverResponse, request) {
    serverResponse.body = {
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

    const response = serverResponse.body;
    const bidResponses = [];
    var bidRequestResponses = [];

    utils._each(response, function(bidAd) {
      bidAd.adResponse = {
        content: bidAd.vastXml,
        height: bidAd.height,
        width: bidAd.width
      };

      bidAd.renderer = bidAd.context === 'outstream' ? createRenderer(bidAd, {
        id: bidAd.adUnitCode,
        url: RENDERER_URL
      }, bidAd.adUnitCode) : undefined;
      bidResponses.push(bidAd);
    });

    bidRequestResponses.push({
      function: 'saveResponses',
      request: request,
      response: bidResponses
    });
    sendResponseToServer(bidRequestResponses);
    return bidResponses;
  },

  onBidWon: function(bid) {
    const wonBids = [];
    wonBids.push(bid);
    wonBids[0].function = 'onBidWon';
    sendResponseToServer(wonBids);
  },

  onTimeout: function(details) {
    details.unshift({ 'function': 'onTimeout' });
    sendResponseToServer(details);
  }
};

registerBidder(spec);
