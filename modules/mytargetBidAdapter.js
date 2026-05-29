import { _map } from '../src/utils.js';
import { config } from '../src/config.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';

const BIDDER_CODE = 'mytarget';
const BIDDER_URL = '//ad.mail.ru/hbid_prebid/';
const DEFAULT_CURRENCY = 'RUB';
const DEFAULT_TTL = 180;

function buildPlacement(bidRequest) {
  const { bidId, params } = bidRequest;
  const { placementId, position, response, bidfloor } = params;
  const placement = {
    placementId,
    id: bidId,
    position: position || 0,
    response: response || 0
  };

  if (typeof bidfloor !== 'undefined') {
    placement.bidfloor = bidfloor;
  }

  return placement;
}

function getSiteName(referrer) {
  let sitename = config.getConfig('mytarget.sitename');

  if (!sitename) {
    const parsed = document.createElement('a');
    parsed.href = decodeURIComponent(referrer);
    sitename = parsed.hostname;
  }

  return sitename;
}

function generateRandomId() {
  return Math.random().toString(16).substring(2);
}

export const spec = {
  code: BIDDER_CODE,

  isBidRequestValid: function(bid) {
    return !!bid.params.placementId;
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    let referrer = '';

    if (bidderRequest && bidderRequest.refererInfo) {
      referrer = bidderRequest.refererInfo.page;
    }

    const payload = {
      places: _map(validBidRequests, buildPlacement),
      site: {
        sitename: getSiteName(referrer),
        page: referrer
      },
      settings: {
        currency: DEFAULT_CURRENCY,
        windowSize: {
          width: window.screen.width,
          height: window.screen.height
        }
      }
    };

    return {
      method: 'POST',
      url: BIDDER_URL,
      data: payload,
    };
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

    const { body } = serverResponse;

    if (body.bids) {
      return _map(body.bids, (bid) => {
        const bidResponse = {
          requestId: bid.id,
          cpm: bid.price,
          width: bid.size.width,
          height: bid.size.height,
          ttl: bid.ttl || DEFAULT_TTL,
          currency: bid.currency || DEFAULT_CURRENCY,
          creativeId: bid.creativeId || generateRandomId(),
          netRevenue: true,
          meta: {
            advertiserDomains: bid.adomain && bid.adomain.length > 0 ? bid.adomain : [],
          }
        }

        if (bid.adm) {
          bidResponse.ad = bid.adm;
        } else {
          bidResponse.adUrl = bid.displayUrl;
        }

        return bidResponse;
      });
    }

    return [];
  }
}

registerBidder(spec);
