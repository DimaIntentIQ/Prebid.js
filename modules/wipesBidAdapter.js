import { logWarn } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';

const BIDDER_CODE = 'wipes';
const ALIAS_BIDDER_CODE = ['wi'];
const SUPPORTED_MEDIA_TYPES = [BANNER]
const ENDPOINT_URL = 'https://adn-srv.reckoner-api.com/v1/prebid';

function isBidRequestValid(bid) {
  switch (true) {
    case !!(bid.params.asid):
      break;
    default:
      logWarn(`isBidRequestValid Error. ${bid.params}, please check your implementation.`);
      return false;
  }
  return true;
}

function buildRequests(validBidRequests, bidderRequest) {
  return validBidRequests.map(bidRequest => {
    const bidId = bidRequest.bidId
    const params = bidRequest.params;
    const asid = params.asid;
    return {
      method: 'GET',
      url: ENDPOINT_URL,
      data: {
        asid: asid,
        bid_id: bidId,
      }
    }
  });
}

function interpretResponse(serverResponse, bidRequest) {
    serverResponse.body = {
      bids: bidRequest.bidderRequest.bids.map((b, i) => {
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
  const response = serverResponse.body;
  const cpm = response.cpm || 0;
  if (cpm !== 0) {
    const netRevenue = (response.netRevenue === undefined) ? true : response.netRevenue;
    const bidResponse = {
      requestId: response.bid_id,
      cpm: cpm,
      width: response.width,
      height: response.height,
      creativeId: response.video_creative_id || 0,
      dealId: response.deal_id,
      currency: 'JPY',
      netRevenue: netRevenue,
      ttl: 60,
      referrer: bidRequest.data.r || '',
      mediaType: BANNER,
      ad: response.ad_tag,
      meta: {
        advertiserDomains: response.advertiser_domain ? [response.advertiser_domain] : []
      }
    };
    bidResponses.push(bidResponse);
  }
  return bidResponses;
}

export const spec = {
  code: BIDDER_CODE,
  aliases: ALIAS_BIDDER_CODE,
  isBidRequestValid,
  buildRequests,
  interpretResponse,
  supportedMediaTypes: SUPPORTED_MEDIA_TYPES
}
registerBidder(spec);
