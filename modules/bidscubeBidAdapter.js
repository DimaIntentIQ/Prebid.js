import { logMessage, getWindowLocation } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js'
import { BANNER, NATIVE, VIDEO } from '../src/mediaTypes.js'
import { convertOrtbRequestToProprietaryNative } from '../src/native.js';

const BIDDER_CODE = 'bidscube'
const URL = 'https://supply.bidscube.com/?c=o&m=multi'
const URL_SYNC = 'https://supply.bidscube.com/?c=o&m=cookie'

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, VIDEO, NATIVE],

  isBidRequestValid: function (opts) {
    return Boolean(opts.bidId && opts.params && !isNaN(parseInt(opts.params.placementId)))
  },

  buildRequests: function (validBidRequests) {
    // convert Native ORTB definition to old-style prebid native definition
    validBidRequests = convertOrtbRequestToProprietaryNative(validBidRequests);

    validBidRequests = validBidRequests || []
    let winTop = window
    try {
      window.top.location.toString()
      winTop = window.top
    } catch (e) { logMessage(e) }

    const location = getWindowLocation()
    const placements = []

    for (let i = 0; i < validBidRequests.length; i++) {
      const p = validBidRequests[i]

      placements.push({
        placementId: p.params.placementId,
        bidId: p.bidId,
        traffic: p.params.traffic || BANNER,
        allParams: JSON.stringify(p)
      })
    }

    return {
      method: 'POST',
      url: URL,
      data: {
        deviceWidth: winTop.screen.width,
        deviceHeight: winTop.screen.height,
        language: (navigator && navigator.language) ? navigator.language : '',
        secure: +(location.protocol === 'https:'),
        host: location.hostname,
        page: location.pathname,
        placements: placements
      }
    }
  },

  interpretResponse: function (opts) {
    return [
      {
        requestId: '06d655ff-9c15-426f-a363-fe012037af02',
        cpm: 4.00,
        width: 300,
        height: 250,
        ad: '<div style="width:300px;height:250px;background:#0a0;color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px sans-serif;">TL WIN 300x250</div>',
        creativeId: '10092_76480_testcrid',
        dealId: '',
        currency: 'USD',
        netRevenue: true,
        ttl: 300,
        mediaType: 'banner',
        meta: {
          advertiserName: 'Test Advertiser',
          advertiserDomains: ['example.com'],
          mediaType: 'banner',
          networkId: '10092'
        }
      }
    ];
  },

  getUserSyncs: function (syncOptions, serverResponses) {
    return [{ type: 'image', url: URL_SYNC }]
  }
}

registerBidder(spec)

function isBidResponseValid (bid) {
  if (!bid.requestId || !bid.cpm || !bid.creativeId ||
    !bid.ttl || !bid.currency) {
    return false
  }
  switch (bid['mediaType']) {
    case BANNER:
      return Boolean(bid.width && bid.height && bid.ad)
    case VIDEO:
      return Boolean(bid.vastUrl)
    case NATIVE:
      return Boolean(bid.title && bid.image && bid.impressionTrackers)
    default:
      return false
  }
}
