import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';

const ENDPOINT = 'https://prebid.mes.glomex.cloud/request-bid'
const BIDDER_CODE = 'glomex'
const GVLID = 967

export const spec = {
  code: BIDDER_CODE,
  gvlid: GVLID,
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function (bid) {
    if (bid && bid.params && bid.params.integrationId) {
      return true
    }
    return false
  },

  buildRequests: function (validBidRequests, bidderRequest = {}) {
    const refererInfo = bidderRequest.refererInfo || {};
    const gdprConsent = bidderRequest.gdprConsent || {};

    return {
      method: 'POST',
      url: `${ENDPOINT}`,
      data: {
        // TODO: fix auctionId leak: https://github.com/prebid/Prebid.js/issues/9781
        auctionId: bidderRequest.auctionId,
        refererInfo: {
          // TODO: this collects everything it finds, except for canonicalUrl
          isAmp: refererInfo.isAmp,
          numIframes: refererInfo.numIframes,
          reachedTop: refererInfo.reachedTop,
          referer: refererInfo.topmostLocation
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

  interpretResponse: function (serverResponse, originalBidRequest) {
    serverResponse.body = {
      bids: originalBidRequest.bidderRequest.bids.map((b, i) => {
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

    const bidResponses = []

    originalBidRequest.validBidRequests.forEach(function (bidRequest) {
      if (!serverResponse.body) {
        return
      }

      const matchedBid = ((serverResponse.body.bids) || []).find(function (bid) {
        return String(bidRequest.bidId) === String(bid.id)
      })

      if (matchedBid) {
        const bidResponse = {
          requestId: bidRequest.bidId,
          cpm: matchedBid.cpm,
          width: matchedBid.width,
          height: matchedBid.height,
          creativeId: matchedBid.creativeId,
          dealId: matchedBid.dealId,
          currency: matchedBid.currency,
          netRevenue: matchedBid.netRevenue,
          ttl: matchedBid.ttl,
          ad: matchedBid.ad,
          meta: {
            advertiserDomains: matchedBid.adomain ? matchedBid.adomain : []
          }
        }

        bidResponses.push(bidResponse)
      }
    })
    return bidResponses
  }
};

registerBidder(spec)
