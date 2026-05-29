import { registerBidder } from '../src/adapters/bidderFactory.js';

const BIDDER_CODE = 'addefend';
const GVLID = 539;

export const spec = {
  code: BIDDER_CODE,
  gvlid: GVLID,
  hostname: 'https://addefend-platform.com',

  getHostname() {
    return this.hostname;
  },
  isBidRequestValid: function(bid) {
    return (bid.sizes !== undefined && bid.bidId !== undefined && bid.params !== undefined &&
              (bid.params.pageId !== undefined && (typeof bid.params.pageId === 'string')) &&
              (bid.params.placementId !== undefined && (typeof bid.params.placementId === 'string')));
  },
  buildRequests: function(validBidRequests, bidderRequest) {
    const bid = {
      v: 'v' + '$prebid.version$',
      auctionId: false,
      pageId: false,
      gdpr_applies: bidderRequest.gdprConsent && bidderRequest.gdprConsent.gdprApplies ? bidderRequest.gdprConsent.gdprApplies : 'true',
      gdpr_consent: bidderRequest.gdprConsent && bidderRequest.gdprConsent.consentString ? bidderRequest.gdprConsent.consentString : '',
      // TODO: is 'page' the correct item here?
      referer: bidderRequest.refererInfo.page,
      bids: [],
    };

    for (var i = 0; i < validBidRequests.length; i++) {
      const vb = validBidRequests[i];
      const o = vb.params;
      // TODO: fix auctionId/transactionId leak: https://github.com/prebid/Prebid.js/issues/9781
      bid.auctionId = vb.auctionId;
      o.bidId = vb.bidId;
      o.transactionId = vb.transactionId;
      o.sizes = [];
      if (o.trafficTypes) {
        bid.trafficTypes = o.trafficTypes;
      }
      delete o.trafficTypes;

      bid.pageId = o.pageId;
      delete o.pageId;

      if (vb.sizes && Array.isArray(vb.sizes)) {
        for (var j = 0; j < vb.sizes.length; j++) {
          const s = vb.sizes[j];
          if (Array.isArray(s) && s.length === 2) {
            o.sizes.push(s[0] + 'x' + s[1]);
          }
        }
      }
      bid.bids.push(o);
    }
    return [{
      method: 'POST',
      url: this.getHostname() + '/bid',
      options: { withCredentials: true },
      data: bid
    }];
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

    const requiredKeys = ['requestId', 'cpm', 'width', 'height', 'ad', 'ttl', 'creativeId', 'netRevenue', 'currency', 'advertiserDomains'];
    const validBidResponses = [];
    serverResponse = serverResponse.body;
    if (serverResponse && (serverResponse.length > 0)) {
      serverResponse.forEach((bid) => {
        const bidResponse = {};
        for (const requiredKey of requiredKeys) {
          if (!bid.hasOwnProperty(requiredKey)) {
            return [];
          }
          bidResponse[requiredKey] = bid[requiredKey];
        }
        validBidResponses.push(bidResponse);
      });
    }
    return validBidResponses;
  }
}

registerBidder(spec);
