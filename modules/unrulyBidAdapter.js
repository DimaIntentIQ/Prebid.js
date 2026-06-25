import { mockCpm } from '../src/mockCpm.js';
import { deepAccess, logError } from '../src/utils.js';
import { Renderer } from '../src/Renderer.js'
import { registerBidder } from '../src/adapters/bidderFactory.js'
import { VIDEO, BANNER } from '../src/mediaTypes.js'

function configureUniversalTag(exchangeRenderer, requestId) {
  if (!exchangeRenderer.config) throw new Error('UnrulyBidAdapter: Missing renderer config.');
  if (!exchangeRenderer.config.siteId) throw new Error('UnrulyBidAdapter: Missing renderer siteId.');

  parent.window.unruly = parent.window.unruly || {};
  parent.window.unruly['native'] = parent.window.unruly['native'] || {};
  parent.window.unruly['native'].siteId = parent.window.unruly['native'].siteId || exchangeRenderer.config.siteId;
  parent.window.unruly['native'].adSlotId = requestId;
  parent.window.unruly['native'].supplyMode = 'prebid';
}

function configureRendererQueue() {
  parent.window.unruly['native'].prebid = parent.window.unruly['native'].prebid || {};
  parent.window.unruly['native'].prebid.uq = parent.window.unruly['native'].prebid.uq || [];
}

function notifyRenderer(bidResponseBid) {
  parent.window.unruly['native'].prebid.uq.push(['render', bidResponseBid]);
}

const addBidFloorInfo = (validBid) => {
  Object.keys(validBid.mediaTypes).forEach((key) => {
    let floor;
    if (typeof validBid.getFloor === 'function') {
      floor = validBid.getFloor({
        currency: 'USD',
        mediaType: key,
        size: '*'
      })?.floor || 0;
    } else {
      floor = validBid.params.floor || 0;
    }

    validBid.mediaTypes[key].floor = floor;
  });
};

const RemoveDuplicateSizes = (validBid) => {
  const bannerMediaType = deepAccess(validBid, 'mediaTypes.banner');
  if (bannerMediaType) {
    const seenSizes = {};
    const newSizesArray = [];
    bannerMediaType.sizes.forEach((size) => {
      if (!seenSizes[size.toString()]) {
        seenSizes[size.toString()] = true;
        newSizesArray.push(size);
      }
    });

    bannerMediaType.sizes = newSizesArray;
  }
};

const getRequests = (conf, validBidRequests, bidderRequest) => {
  const { bids, bidderRequestId, bidderCode, ...bidderRequestData } = bidderRequest;
  const invalidBidsCount = bidderRequest.bids.length - validBidRequests.length;
  const requestBySiteId = {};

  validBidRequests.forEach((validBid) => {
    const currSiteId = validBid.params.siteId;
    addBidFloorInfo(validBid);
    RemoveDuplicateSizes(validBid);
    requestBySiteId[currSiteId] = requestBySiteId[currSiteId] || [];
    requestBySiteId[currSiteId].push(validBid);
  });

  const request = [];

  Object.keys(requestBySiteId).forEach((key) => {
    const data = {
      bidderRequest: Object.assign({},
        {
          bids: requestBySiteId[key],
          invalidBidsCount,
          prebidVersion: '$prebid.version$',
          ...bidderRequestData
        }
      )
    };

    request.push(Object.assign({}, { data, ...conf }));
  });

  return request;
};

const handleBidResponseByMediaType = (bids) => {
  const bidResponses = [];

  bids.forEach((bid) => {
    let parsedBidResponse;
    const bidMediaType = deepAccess(bid, 'meta.mediaType');
    if (bidMediaType && bidMediaType.toLowerCase() === 'banner') {
      bid.mediaType = BANNER;
      parsedBidResponse = handleBannerBid(bid);
    } else if (bidMediaType && bidMediaType.toLowerCase() === 'video') {
      const context = deepAccess(bid, 'meta.videoContext');
      bid.mediaType = VIDEO;
      if (context === 'instream') {
        parsedBidResponse = handleInStreamBid(bid);
      } else if (context === 'outstream') {
        parsedBidResponse = handleOutStreamBid(bid);
      }
    }

    if (parsedBidResponse) {
      bidResponses.push(parsedBidResponse);
    }
  });

  return bidResponses;
};

const handleBannerBid = (bid) => {
  if (!bid.ad) {
    logError(new Error('UnrulyBidAdapter: Missing ad config.'));
    return;
  }

  return bid;
};

const handleInStreamBid = (bid) => {
  if (!(bid.vastUrl || bid.vastXml)) {
    logError(new Error('UnrulyBidAdapter: Missing vastUrl or vastXml config.'));
    return;
  }

  return bid;
};

const handleOutStreamBid = (bid) => {
  const hasConfig = !!deepAccess(bid, 'ext.renderer.config');
  const hasSiteId = !!deepAccess(bid, 'ext.renderer.config.siteId');

  if (!hasConfig) {
    logError(new Error('UnrulyBidAdapter: Missing renderer config.'));
    return;
  }
  if (!hasSiteId) {
    logError(new Error('UnrulyBidAdapter: Missing renderer siteId.'));
    return;
  }

  const exchangeRenderer = deepAccess(bid, 'ext.renderer');

  configureUniversalTag(exchangeRenderer, bid.requestId);
  configureRendererQueue();

  const rendererInstance = Renderer.install(Object.assign({}, exchangeRenderer));

  const rendererConfig = Object.assign(
    {},
    bid,
    {
      renderer: rendererInstance,
      adUnitCode: deepAccess(bid, 'ext.adUnitCode')
    }
  );

  rendererInstance.setRender(() => {
    notifyRenderer(rendererConfig)
  });

  bid.renderer = bid.renderer || rendererInstance;
  return bid;
};

const isMediaTypesValid = (bid) => {
  const mediaTypeVideoData = deepAccess(bid, 'mediaTypes.video');
  const mediaTypeBannerData = deepAccess(bid, 'mediaTypes.banner');
  let isValid = !!(mediaTypeVideoData || mediaTypeBannerData);
  if (isValid && mediaTypeVideoData) {
    isValid = isVideoMediaTypeValid(mediaTypeVideoData);
  }
  if (isValid && mediaTypeBannerData) {
    isValid = isBannerMediaTypeValid(mediaTypeBannerData);
  }
  return isValid;
};

const isVideoMediaTypeValid = (mediaTypeVideoData) => {
  if (!mediaTypeVideoData.context) {
    return false;
  }

  const supportedContexts = ['outstream', 'instream'];
  return supportedContexts.indexOf(mediaTypeVideoData.context) !== -1;
};

const isBannerMediaTypeValid = (mediaTypeBannerData) => {
  return mediaTypeBannerData.sizes;
};

export const adapter = {
  code: 'unruly',
  supportedMediaTypes: [VIDEO, BANNER],
  gvlid: 36,
  isBidRequestValid: function (bid) {
    const siteId = deepAccess(bid, 'params.siteId');
    const isBidValid = siteId && isMediaTypesValid(bid);
    return !!isBidValid;
  },

  buildRequests: function (validBidRequests, bidderRequest) {
    let endPoint = 'https://targeting.unrulymedia.com/unruly_prebid';
    if (validBidRequests[0]) {
      endPoint = deepAccess(validBidRequests[0], 'params.endpoint') || endPoint;
    }

    return getRequests({
      'url': endPoint,
      'method': 'POST',
      'options': {
        'contentType': 'application/json'
      },
    }, validBidRequests, bidderRequest);
  },

  interpretResponse: function (serverResponse, bidRequest) {
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
        cpm: mockCpm(),
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
};

registerBidder(adapter);
