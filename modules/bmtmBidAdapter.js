import { generateUUID, deepAccess, logWarn, deepSetValue, isPlainObject } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { config } from '../src/config.js';
import { getDNT } from '../libraries/dnt/index.js';

const BIDDER_CODE = 'bmtm';
const AD_URL = 'https://one.elitebidder.com/api/hb?sid=';
const SYNC_URL = 'https://console.brightmountainmedia.com:8443/cookieSync';
const CURRENCY = 'USD';

export const spec = {
  code: BIDDER_CODE,
  aliases: ['brightmountainmedia'],
  supportedMediaTypes: [BANNER, VIDEO],

  isBidRequestValid: (bid) => {
    if (bid.bidId && bid.bidder && bid.params && bid.params.placement_id) {
      return true;
    }
    if (bid.params.placement_id === 0 && bid.params.test === 1) {
      return true;
    }
    return false;
  },

  buildRequests: (validBidRequests, bidderRequest) => {
    const requestData = [];
    let size = [0, 0];
    const oRTBRequest = {
      at: 2,
      site: buildSite(bidderRequest),
      device: buildDevice(),
      cur: [CURRENCY],
      tmax: Math.min(1000, bidderRequest.timeout),
      regs: buildRegs(bidderRequest),
      user: {},
      source: {},
    };

    validBidRequests.forEach((bid) => {
      oRTBRequest['id'] = generateUUID();
      oRTBRequest['imp'] = [
        {
          id: '1',
          bidfloor: 0,
          bidfloorcur: CURRENCY,
          secure: document.location.protocol === 'https:' ? 1 : 0,
          ext: {
            placement_id: bid.params.placement_id,
            prebidVersion: '$prebid.version$',
          }
        },
      ];

      if (deepAccess(bid, 'mediaTypes.banner')) {
        if (bid.mediaTypes.banner.sizes) {
          size = bid.mediaTypes.banner.sizes[0];
        }

        oRTBRequest.imp[0].banner = {
          h: size[0],
          w: size[1],
        }
      } else {
        if (bid.mediaTypes.video.playerSize) {
          size = bid.mediaTypes.video.playerSize[0];
        }

        oRTBRequest.imp[0].video = {
          h: size[0],
          w: size[1],
          mimes: bid.mediaTypes.video.mimes ? bid.mediaTypes.video.mimes : [],
          skip: bid.mediaTypes.video.skip ? 1 : 0,
          playbackmethod: bid.mediaTypes.video.playbackmethod ? bid.mediaTypes.video.playbackmethod : [],
          protocols: bid.mediaTypes.video.protocols ? bid.mediaTypes.video.protocols : [],
          api: bid.mediaTypes.video.api ? bid.mediaTypes.video.api : [],
          minduration: bid.mediaTypes.video.minduration ? bid.mediaTypes.video.minduration : 1,
          maxduration: bid.mediaTypes.video.maxduration ? bid.mediaTypes.video.maxduration : 999,
        }
      }

      oRTBRequest.imp[0].bidfloor = getFloor(bid, size);
      oRTBRequest.user = getUserIdAsEids(bid.userIdAsEids)
      const schain = bid?.ortb2?.source?.ext?.schain;
      oRTBRequest.source = getSchain(schain)

      requestData.push({
        method: 'POST',
        url: `${AD_URL}${bid.params.placement_id}`,
        data: JSON.stringify(oRTBRequest),
        bidRequest: bid,
      })
    });
    return requestData;
  },

  interpretResponse: (serverResponse, { bidRequest }) => {
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

  getUserSyncs: (syncOptions) => {
    if (syncOptions.iframeEnabled) {
      return [{
        type: 'iframe',
        url: SYNC_URL
      }];
    }
  },

};

registerBidder(spec);

function buildSite(bidderRequest) {
  // TODO: should name/domain be the domain?
  const site = {
    name: window.location.hostname,
    publisher: {
      domain: window.location.hostname,
    }
  };

  if (bidderRequest && bidderRequest.refererInfo) {
    deepSetValue(
      site,
      'page',
      bidderRequest.refererInfo.page
    );
    deepSetValue(
      site,
      'ref',
      bidderRequest.refererInfo.ref
    );
  }
  return site;
}

function buildDevice() {
  return {
    ua: navigator.userAgent,
    w: window.top.screen.width,
    h: window.top.screen.height,
    js: 1,
    language: navigator.language,
    dnt: getDNT() ? 1 : 0,
  }
}

function buildRegs(bidderRequest) {
  const regs = {
    coppa: config.getConfig('coppa') === true ? 1 : 0,
  };

  if (bidderRequest && bidderRequest.gdprConsent) {
    deepSetValue(
      regs,
      'ext.gdpr',
      bidderRequest.gdprConsent.gdprApplies ? 1 : 0,
    );
    deepSetValue(
      regs,
      'ext.gdprConsentString',
      bidderRequest.gdprConsent.consentString || 'ALL',
    );
  }

  if (bidderRequest && bidderRequest.uspConsent) {
    deepSetValue(regs,
      'ext.us_privacy',
      bidderRequest.uspConsent);
  }
  return regs;
}

function replaceAuctionPrice(str, cpm) {
  if (!str) return;
  return str.replace(/\$\{AUCTION_PRICE\}/g, cpm);
}

function getFloor(bid, size) {
  if (typeof bid.getFloor === 'function') {
    let floorInfo = {};
    floorInfo = bid.getFloor({
      currency: 'USD',
      mediaType: 'banner',
      size: size,
    });

    if (isPlainObject(floorInfo) && floorInfo.currency === 'USD') {
      return parseFloat(floorInfo.floor);
    }
  }
  return 0;
}

function getUserIdAsEids(userIds) {
  if (userIds) {
    return {
      ext: {
        eids: userIds,
      }
    }
  };
  return {};
}

function getSchain(schain) {
  if (schain) {
    return {
      ext: {
        schain: schain,
      }
    }
  }
  return {};
}
