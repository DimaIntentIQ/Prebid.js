import { registerBidder } from '../src/adapters/bidderFactory.js'

import { BANNER, VIDEO } from '../src/mediaTypes.js'

const ENDPOINT = '//prebid.vlyby.com/';
const BIDDER_CODE = 'vlyby';
const GVLID = 1009;

export const spec = {
  code: BIDDER_CODE,
  gvlid: GVLID,
  supportedMediaTypes: [VIDEO, BANNER],

  isBidRequestValid: function (bid) {
    if (bid && bid.params && bid.params.publisherId) {
      return true
    }
    return false
  },

  buildRequests: function (validBidRequests, bidderRequest = {}) {
    const gdprConsent = bidderRequest.gdprConsent || {};
    return {
      method: 'POST',
      url: `${ENDPOINT}`,
      data: {
        request: {
          // TODO: fix auctionId leak: https://github.com/prebid/Prebid.js/issues/9781
          auctionId: bidderRequest.auctionId
        },
        gdprConsent: {
          consentString: gdprConsent.consentString,
          gdprApplies: gdprConsent.gdprApplies
        },
        bidRequests: validBidRequests.map(({ params, sizes, bidId, adUnitCode }) => ({
          bidId,
          adUnitCode,
          params,
          sizes
        }))
      },
      options: {
        withCredentials: false,
        contentType: 'application/json'
      },
      validBidRequests: validBidRequests,
    }
  },
  interpretResponse: function(serverResponse, bidRequest) {
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
    if (serverResponse.body) {
      const vHB = serverResponse.body.bids;
      try {
        const bidResponse = {
          requestId: vHB.bid,
          cpm: vHB.cpm,
          width: vHB.size.width,
          height: vHB.size.height,
          creativeId: vHB.creative.id,
          currency: 'EUR',
          netRevenue: true,
          ttl: 360,
          ad: vHB.creative.ad,
          meta: {
            adomain: vHB.adomain && Array.isArray(vHB.adomain) ? vHB.adomain : []
          }
        };
        bidResponses.push(bidResponse);
      } catch (e) { }
    }
    return bidResponses;
  }
};
registerBidder(spec);
