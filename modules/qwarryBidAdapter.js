import { registerBidder } from '../src/adapters/bidderFactory.js';
import { deepClone } from '../src/utils.js';
import { ajax } from '../src/ajax.js';
import { VIDEO } from '../src/mediaTypes.js';

const BIDDER_CODE = 'qwarry';
export const ENDPOINT = 'https://bidder.qwarry.co/bid/adtag?prebid=true'

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: ['banner', 'video'],

  isBidRequestValid: function (bid) {
    return !!(bid.params && bid.params.zoneToken);
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    const bids = [];
    validBidRequests.forEach(bidRequest => {
      bids.push({
        bidId: bidRequest.bidId,
        zoneToken: bidRequest.params.zoneToken,
        pos: bidRequest.params.pos,
        sizes: prepareSizes(bidRequest.sizes)
      })
    })

    const payload = {
      requestId: bidderRequest.bidderRequestId,
      bids,
      referer: bidderRequest.refererInfo.page,
      schain: validBidRequests[0]?.ortb2?.source?.ext?.schain
    }

    if (bidderRequest && bidderRequest.gdprConsent) {
      payload.gdprConsent = {
        consentRequired: (typeof bidderRequest.gdprConsent.gdprApplies === 'boolean') ? bidderRequest.gdprConsent.gdprApplies : false,
        consentString: bidderRequest.gdprConsent.consentString
      }
    }

    const options = {
      contentType: 'application/json',
      customHeaders: {
        'Rtb-Direct': true
      }
    }

    return {
      method: 'POST',
      url: ENDPOINT,
      data: payload,
      options
    };
  },

  interpretResponse: function (serverResponse, request) {
    serverResponse.body = {
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

    const serverBody = serverResponse.body;
    if (!serverBody || typeof serverBody !== 'object') {
      return [];
    }

    const { prebidResponse } = serverBody;
    if (!prebidResponse || typeof prebidResponse !== 'object') {
      return [];
    }

    const bids = [];
    prebidResponse.forEach(bidResponse => {
      const bid = deepClone(bidResponse);
      bid.cpm = parseFloat(bidResponse.cpm);

      // banner or video
      if (VIDEO === bid.format) {
        bid.vastXml = bid.ad;
      }

      bid.meta = {};
      bid.meta.advertiserDomains = bid.adomain || [];

      bids.push(bid);
    })

    return bids;
  },

  onBidWon: function (bid) {
    if (bid.winUrl) {
      const cpm = bid.cpm;
      const winUrl = bid.winUrl.replace(/\$\{AUCTION_PRICE\}/, cpm);
      ajax(winUrl, null);
      return true;
    }
    return false;
  }
}

function prepareSizes(sizes) {
  return sizes && sizes.map(size => ({ width: size[0], height: size[1] }));
}

registerBidder(spec);
