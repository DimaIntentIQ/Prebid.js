import { BANNER } from '../src/mediaTypes.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { triggerPixel } from '../src/utils.js';

const ADPONE_CODE = 'adpone';
const ADPONE_ENDPOINT = 'https://rtb.adpone.com/bid-request';
const ADPONE_REQUEST_METHOD = 'POST';
const ADPONE_CURRENCY = 'EUR';

const GVLID = 799;
export const spec = {
  code: ADPONE_CODE,
  gvlid: GVLID,
  supportedMediaTypes: [BANNER],

  isBidRequestValid: bid => {
    return !!bid.params.placementId && !!bid.bidId && bid.bidder === 'adpone'
  },

  buildRequests: (bidRequests, bidderRequest) => {
    return bidRequests.map(bid => {
      let url = ADPONE_ENDPOINT + '?pid=' + bid.params.placementId;
      const data = {
        at: 1,
        id: bid.bidId,
        imp: bid.sizes.map((size, index) => (
          {
            id: bid.bidId + '_' + index,
            banner: {
              w: size[0],
              h: size[1]
            }
          }))
      };

      const options = {
        withCredentials: true
      };

      if (bidderRequest && bidderRequest.gdprConsent) {
        url += '&gdpr_applies=' + bidderRequest.gdprConsent.gdprApplies;
        url += '&consentString=' + bidderRequest.gdprConsent.consentString;
      }

      return {
        method: ADPONE_REQUEST_METHOD,
        url,
        data,
        options,
      };
    });
  },

  interpretResponse: (serverResponse, bidRequest) => {
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

    if (!serverResponse || !serverResponse.body) {
      return [];
    }

    let answer = [];

    serverResponse.body.seatbid.forEach(seatbid => {
      if (seatbid.bid.length) {
        answer = [...answer, ...seatbid.bid.filter(bid => bid.price > 0).map(adponeBid => {
          const bid = {
            id: adponeBid.id,
            requestId: bidRequest.data.id,
            cpm: adponeBid.price,
            ad: adponeBid.adm,
            width: adponeBid.w || 0,
            height: adponeBid.h || 0,
            currency: serverResponse.body.cur || ADPONE_CURRENCY,
            netRevenue: true,
            ttl: 300,
            creativeId: adponeBid.crid || 0
          };

          if (adponeBid.meta && adponeBid.meta.adomain && adponeBid.meta.adomain.length > 0) {
            bid.meta = {};
            bid.meta.advertiserDomains = adponeBid.meta.adomain;
          }

          return bid
        })];
      }
    });

    return answer;
  },

  onBidWon: bid => {
    const bidString = JSON.stringify(bid);
    const encodedBuf = window.btoa(bidString);
    triggerPixel(`https://rtb.adpone.com/prebid/analytics?q=${encodedBuf}`);
  },

};

registerBidder(spec);
