// jshint esversion: 6, es3: false, node: true
'use strict';

import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { deepAccess, logInfo } from '../src/utils.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js';

const BIDDER_CODE = 'scattered';
export const converter = ortbConverter({
  context: {
    mediaType: BANNER,
    ttl: 360,
    netRevenue: true
  }
})

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],

  // 1.
  isBidRequestValid: function (bid) {
    const bidderDomain = deepAccess(bid, 'params.bidderDomain')
    if (bidderDomain === undefined || bidderDomain === '') {
      return false
    }

    const sizes = deepAccess(bid, 'mediaTypes.banner.sizes')
    if (sizes === undefined || sizes.length < 1) {
      return false
    }

    return true
  },

  // 2.
  buildRequests: function (bidRequests, bidderRequest) {
    return {
      method: 'POST',
      url: 'https://' + getKeyOnAny(bidRequests, 'params.bidderDomain'),
      data: converter.toORTB({ bidderRequest, bidRequests }),
      options: {
        contentType: 'application/json'
      },
    };
  },

  // 3.
  interpretResponse: function (response, request) {
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

    if (!response.body) return;
    return converter.fromORTB({ response: response.body, request: request.data }).bids;
  },

  // 4
  onBidWon: function (bid) {
    logInfo('onBidWon', bid)
  }
}

function getKeyOnAny(collection, key) {
  for (let i = 0; i < collection.length; i++) {
    const result = deepAccess(collection[i], key);
    if (result) {
      return result;
    }
  }
}

registerBidder(spec);
