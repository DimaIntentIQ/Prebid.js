import { ortbConverter } from '../libraries/ortbConverter/converter.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { isArray, isInteger, triggerPixel } from '../src/utils.js';

const BIDDER_CODE = 'adbro';
const GVLID = 1316;
const ENDPOINT_URL = 'https://prebid.adbro.me/pbjs';

const converter = ortbConverter({
  context: {
    netRevenue: true,
    ttl: 300,
    mediaType: BANNER,
    currency: 'USD',
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);

    imp.displaymanager ||= 'Prebid.js';
    imp.displaymanagerver ||= '$prebid.version$';
    imp.tagid ||= imp.ext?.gpid || bidRequest.adUnitCode;

    return imp;
  },
  request(buildRequest, imps, bidderRequest, context) {
    const request = buildRequest(imps, bidderRequest, context);

    request.device.js = 1;

    return request;
  },
});

export const spec = {
  code: BIDDER_CODE,
  gvlid: GVLID,
  supportedMediaTypes: [BANNER],

  isBidRequestValid(bid) {
    const { params, mediaTypes } = bid;
    let placementId = params?.placementId;
    let bannerSizes = mediaTypes?.[BANNER]?.sizes ?? null;

    if (placementId) placementId = Number(placementId);

    return Boolean(
      placementId && isInteger(placementId) &&
      bannerSizes && isArray(bannerSizes) && bannerSizes.length > 0
    );
  },

  buildRequests(bidRequests, bidderRequest) {
    const placements = {};
    const result = [];
    bidRequests.forEach(bidRequest => {
      const { placementId } = bidRequest.params;
      placements[placementId] ||= [];
      placements[placementId].push(bidRequest);
    });
    Object.keys(placements).forEach(function(id) {
      const data = converter.toORTB({
        bidRequests: placements[id],
        bidderRequest: bidderRequest,
      });
      result.push({
        method: 'POST',
        url: ENDPOINT_URL + '?placementId=' + id,
        options: {
          endpointCompression: true,
        },
        data
      });
    });
    return result;
  },

  interpretResponse(response, request) {
    response.body = {
      bids: request.bidderRequest.bids.map((b, i) => {
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

    if (!response.hasOwnProperty('body') || !response.body.hasOwnProperty('seatbid')) {
      return [];
    }
    const result = converter.fromORTB({
      request: request.data,
      response: response.body,
    }).bids;
    return result;
  },

  onBidBillable(bid) {
    if (bid.burl) triggerPixel(bid.burl);
  },
};

registerBidder(spec);
