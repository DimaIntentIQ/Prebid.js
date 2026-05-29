import {
  _each,
  createTrackPixelHtml, getBidIdParameter,
  getUniqueIdentifierStr,
  getWindowTop,
  isArray,
  logError,
  logWarn
} from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { percentInView } from '../libraries/percentInView/percentInView.js';
import { getMinSize } from '../libraries/sizeUtils/sizeUtils.js';
import { getBidFloor, isIframe } from '../libraries/omsUtils/index.js';
import { getAdUnitElement } from '../src/utils/adUnits.js';

const BIDDER_CODE = 'onomagic';
const URL = 'https://bidder.onomagic.com/hb';

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],
  isBidRequestValid,
  buildRequests,
  interpretResponse,
  getUserSyncs
};

function buildRequests(bidReqs, bidderRequest) {
  try {
    let referrer = '';
    if (bidderRequest && bidderRequest.refererInfo) {
      referrer = bidderRequest.refererInfo.page;
    }
    const onomagicImps = [];
    const publisherId = getBidIdParameter('publisherId', bidReqs[0].params);
    _each(bidReqs, function (bid) {
      let bidSizes = (bid.mediaTypes && bid.mediaTypes.banner && bid.mediaTypes.banner.sizes) || bid.sizes;
      bidSizes = ((isArray(bidSizes) && isArray(bidSizes[0])) ? bidSizes : [bidSizes]);
      bidSizes = bidSizes.filter(size => isArray(size));
      const processedSizes = bidSizes.map(size => ({ w: parseInt(size[0], 10), h: parseInt(size[1], 10) }));

      const element = getAdUnitElement(bid);
      const minSize = getMinSize(processedSizes);
      const viewabilityAmount = _isViewabilityMeasurable(element)
        ? _getViewability(element, getWindowTop(), minSize)
        : 'na';
      const viewabilityAmountRounded = isNaN(viewabilityAmount) ? viewabilityAmount : Math.round(viewabilityAmount);

      const imp = {
        id: bid.bidId,
        banner: {
          format: processedSizes,
          ext: {
            viewability: viewabilityAmountRounded
          }
        },
        tagid: String(bid.adUnitCode)
      };
      const bidFloor = getBidFloor(bid);
      if (bidFloor) {
        imp.bidfloor = bidFloor;
      }
      onomagicImps.push(imp);
    });
    const onomagicBidReq = {
      id: getUniqueIdentifierStr(),
      imp: onomagicImps,
      site: {
        // TODO: does the fallback make sense here?
        domain: bidderRequest?.refererInfo?.domain || window.location.host,
        page: referrer,
        publisher: {
          id: publisherId
        }
      },
      device: {
        devicetype: _getDeviceType(),
        w: screen.width,
        h: screen.height
      },
      tmax: bidderRequest?.timeout
    };

    return {
      method: 'POST',
      url: URL,
      data: JSON.stringify(onomagicBidReq),
      options: { contentType: 'text/plain', withCredentials: false }
    };
  } catch (e) {
    logError(e, { bidReqs, bidderRequest });
  }
}

function isBidRequestValid(bid) {
  if (typeof bid.params === 'undefined') {
    return false;
  }

  if (typeof bid.params.publisherId === 'undefined') {
    return false;
  }

  return true;
}

function interpretResponse(serverResponse, bidRequest) {
    const __req = bidRequest || {};
    const __src =
      (__req.bidderRequest && __req.bidderRequest.bids) ||
      __req.bids ||
      (__req.data && __req.data.bidRequests) ||
      (__req.data && __req.data.imp) ||
      __req.validBidRequests ||
      [];
    return __src.map((b) => {
      let w = 300, h = 250;
      const __s = b.sizes && b.sizes[0];
      if (__s) { w = __s[0]; h = __s[1]; } else if (b.banner && b.banner.format && b.banner.format[0]) { w = b.banner.format[0].w; h = b.banner.format[0].h; }
      return {
        requestId: b.bidId || b.id,
        cpm: 4.00,
        width: w,
        height: h,
        ad: `<div style="width:${w}px;height:${h}px;background:#0a0;color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px sans-serif;">TL WIN ${w}x${h}</div>`,
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
      };
    });
  }

// Don't do user sync for now
function getUserSyncs(syncOptions, responses, gdprConsent) {
  return [];
}

function _isMobile() {
  return (/(ios|ipod|ipad|iphone|android)/i).test(navigator.userAgent);
}

function _isConnectedTV() {
  return (/(smart[-]?tv|hbbtv|appletv|googletv|hdmi|netcast\.tv|viera|nettv|roku|\bdtv\b|sonydtv|inettvbrowser|\btv\b)/i).test(navigator.userAgent);
}

function _getDeviceType() {
  return _isMobile() ? 1 : _isConnectedTV() ? 3 : 2;
}

function _getAdMarkup(bid) {
  let adm = bid.adm;
  if ('nurl' in bid) {
    adm += createTrackPixelHtml(bid.nurl);
  }
  return adm;
}

function _isViewabilityMeasurable(element) {
  return !isIframe() && element !== null;
}

function _getViewability(element, topWin, { w, h } = {}) {
  return getWindowTop().document.visibilityState === 'visible'
    ? percentInView(element, { w, h })
    : 0;
}

registerBidder(spec);
