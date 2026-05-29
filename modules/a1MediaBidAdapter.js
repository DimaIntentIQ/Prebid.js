import { ortbConverter } from '../libraries/ortbConverter/converter.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO, NATIVE } from '../src/mediaTypes.js';
import { replaceAuctionPrice } from '../src/utils.js';

const BIDDER_CODE = 'a1media';
const END_POINT = 'https://d11.contentsfeed.com/dsp/breq/a1';
const DEFAULT_CURRENCY = 'JPY';

const converter = ortbConverter({
  context: {
    netRevenue: true,
    ttl: 30,
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    if (!imp.bidfloor) {
      imp.bidfloor = bidRequest.params.bidfloor || 0;
      imp.bidfloorcur = bidRequest.params.currency || DEFAULT_CURRENCY;
    }
    if (bidRequest.params.battr) {
      Object.keys(bidRequest.mediaTypes).forEach(mType => {
        imp[mType].battr = bidRequest.params.battr;
      })
    }
    return imp;
  },
  request(buildRequest, imps, bidderRequest, context) {
    const request = buildRequest(imps, bidderRequest, context);
    const bid = context.bidRequests[0];
    if (!request.cur) {
      request.cur = [bid.params.currency || DEFAULT_CURRENCY];
    }
    if (bid.params.bcat) {
      request.bcat = bid.params.bcat;
    }
    return request;
  },
  bidResponse(buildBidResponse, bid, context) {
    const { bidRequest } = context;

    let resMediaType;
    const reqMediaTypes = Object.keys(bidRequest.mediaTypes);
    if (reqMediaTypes.length === 1) {
      resMediaType = reqMediaTypes[0];
    } else {
      if (bid.adm.search(/^(<\?xml|<vast)/i) !== -1) {
        resMediaType = VIDEO;
      } else if (bid.adm[0] === '{') {
        resMediaType = NATIVE;
      } else {
        resMediaType = BANNER;
      }
    }

    context.mediaType = resMediaType;
    context.cpm = bid.price;

    const bidResponse = buildBidResponse(bid, context);
    return bidResponse;
  }
});

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, VIDEO, NATIVE],

  isBidRequestValid: function (bid) {
    return true;
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    const data = converter.toORTB({ validBidRequests, bidderRequest });
    return {
      method: 'POST',
      url: END_POINT,
      data: data,
      options: {
        withCredentials: false,
      }
    };
  },

  interpretResponse: function (serverResponse, bidRequest) {
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

    if (!serverResponse.body) return [];
    const parsedSeatbid = serverResponse.body.seatbid.map(seatbidItem => {
      const parsedBid = seatbidItem.bid.map((bidItem) => ({
        ...bidItem,
        adm: replaceAuctionPrice(bidItem.adm, bidItem.price),
        nurl: replaceAuctionPrice(bidItem.nurl, bidItem.price)
      }));
      return { ...seatbidItem, bid: parsedBid };
    });

    const responseBody = { ...serverResponse.body, seatbid: parsedSeatbid };
    const bids = converter.fromORTB({
      response: responseBody,
      request: bidRequest.data,
    }).bids;
    return bids;
  },

};
registerBidder(spec);
