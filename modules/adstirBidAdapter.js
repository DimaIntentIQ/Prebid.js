import * as utils from '../src/utils.js';
import { config } from '../src/config.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';

const BIDDER_CODE = 'adstir';
const ENDPOINT = 'https://ad.ad-stir.com/prebid'

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],

  isBidRequestValid: function (bid) {
    return !!(utils.isStr(bid.params.appId) && !utils.isEmptyStr(bid.params.appId) && utils.isInteger(bid.params.adSpaceNo));
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    const sua = utils.deepAccess(validBidRequests[0], 'ortb2.device.sua', null);

    const requests = validBidRequests.map((r) => {
      return {
        method: 'POST',
        url: ENDPOINT,
        data: JSON.stringify({
          appId: r.params.appId,
          adSpaceNo: r.params.adSpaceNo,
          auctionId: r.auctionId,
          transactionId: r.transactionId,
          bidId: r.bidId,
          mediaTypes: r.mediaTypes,
          sizes: r.sizes,
          ref: {
            page: bidderRequest.refererInfo.page,
            tloc: bidderRequest.refererInfo.topmostLocation,
            referrer: bidderRequest.refererInfo.ref,
            topurl: config.getConfig('pageUrl') ? false : bidderRequest.refererInfo.reachedTop,
          },
          sua,
          user: utils.deepAccess(r, 'ortb2.user', null),
          gdpr: utils.deepAccess(bidderRequest, 'gdprConsent.gdprApplies', false),
          usp: (bidderRequest.uspConsent || '1---') !== '1---',
          eids: utils.deepAccess(r, 'userIdAsEids', []),
          schain: serializeSchain(utils.deepAccess(r, 'ortb2.source.ext.schain', null)),
          pbVersion: '$prebid.version$',
        }),
      }
    });

    return requests;
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

    const seatbid = serverResponse.body.seatbid;
    if (!utils.isArray(seatbid)) {
      return [];
    }
    const bids = [];
    seatbid.forEach((b) => {
      const bid = b.bid || null;
      if (!bid) {
        return;
      }
      bids.push(bid);
    });
    return bids;
  },
}

function serializeSchain(schain) {
  if (!schain) {
    return null;
  }

  let serializedSchain = `${schain.ver},${schain.complete}`;

  schain.nodes.forEach(node => {
    serializedSchain += `!${encodeURIComponentForRFC3986(node.asi || '')},`;
    serializedSchain += `${encodeURIComponentForRFC3986(node.sid || '')},`;
    serializedSchain += `${encodeURIComponentForRFC3986(node.hp || '')},`;
    serializedSchain += `${encodeURIComponentForRFC3986(node.rid || '')},`;
    serializedSchain += `${encodeURIComponentForRFC3986(node.name || '')},`;
    serializedSchain += `${encodeURIComponentForRFC3986(node.domain || '')}`;
  });

  return serializedSchain;
}

function encodeURIComponentForRFC3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16)}`);
}

registerBidder(spec);
