import { mockCpm } from '../src/mockCpm.js';
// jshint esversion: 6, es3: false, node: true
'use strict';

import { registerBidder } from '../src/adapters/bidderFactory.js';
import { NATIVE, BANNER, VIDEO } from '../src/mediaTypes.js';
import {
  mergeDeep,
  _map,
  deepAccess,
  parseSizesInput,
  deepSetValue,
  formatQS,
  setOnAny,
  getWinDimensions
} from '../src/utils.js';
import { config } from '../src/config.js';
import { Renderer } from '../src/Renderer.js';
import { convertOrtbRequestToProprietaryNative } from '../src/native.js';
import { getCurrencyFromBidderRequest } from '../libraries/ortb2Utils/currency.js';
import { getUserSyncParams } from '../libraries/userSyncUtils/userSyncUtils.js';

const { getConfig } = config;

const BIDDER_CODE = 'dianomi';
const GVLID = 885;
const BIDDER_ALIAS = [{ code: 'dia', gvlid: GVLID }];
const NATIVE_ASSET_IDS = {
  0: 'title',
  2: 'icon',
  3: 'image',
  5: 'sponsoredBy',
  4: 'body',
  1: 'cta',
};
const NATIVE_PARAMS = {
  title: {
    id: 0,
    name: 'title',
  },
  icon: {
    id: 2,
    type: 1,
    name: 'img',
  },
  image: {
    id: 3,
    type: 3,
    name: 'img',
  },
  sponsoredBy: {
    id: 5,
    name: 'data',
    type: 1,
  },
  body: {
    id: 4,
    name: 'data',
    type: 2,
  },
  cta: {
    id: 1,
    type: 12,
    name: 'data',
  },
};
let endpoint = 'www-prebid.dianomi.com';

const OUTSTREAM_RENDERER_URL = (hostname) => `https://${hostname}/prebid/outstream/renderer.js`;

export const spec = {
  code: BIDDER_CODE,
  aliases: BIDDER_ALIAS,
  gvlid: GVLID,
  supportedMediaTypes: [NATIVE, BANNER, VIDEO],
  isBidRequestValid: (bid) => {
    const params = bid.params || {};
    const { smartadId } = params;
    return !!smartadId;
  },
  buildRequests: (validBidRequests, bidderRequest) => {
    // convert Native ORTB definition to old-style prebid native definition
    validBidRequests = convertOrtbRequestToProprietaryNative(validBidRequests);
    let app, site;

    const commonFpd = bidderRequest.ortb2 || {};
    const { user } = commonFpd;

    if (typeof getConfig('app') === 'object') {
      app = getConfig('app') || {};
      if (commonFpd.app) {
        mergeDeep(app, commonFpd.app);
      }
    } else {
      site = getConfig('site') || {};
      if (commonFpd.site) {
        mergeDeep(site, commonFpd.site);
      }

      if (!site.page) {
        site.page = bidderRequest.refererInfo.page;
      }
    }

    const device = getConfig('device') || {};
    const { innerWidth, innerHeight } = getWinDimensions();
    device.w = device.w || innerWidth;
    device.h = device.h || innerHeight;
    device.ua = device.ua || navigator.userAgent;

    const paramsEndpoint = setOnAny(validBidRequests, 'params.endpoint');

    if (paramsEndpoint) {
      endpoint = paramsEndpoint;
    }

    const pt =
      setOnAny(validBidRequests, 'params.pt') ||
      setOnAny(validBidRequests, 'params.priceType') ||
      'net';
    const tid = bidderRequest.ortb2?.source?.tid;
    const currency = getCurrencyFromBidderRequest(bidderRequest);
    const cur = currency && [currency];
    const eids = setOnAny(validBidRequests, 'userIdAsEids');
    const schain = setOnAny(validBidRequests, 'ortb2.source.ext.schain');

    const imp = validBidRequests.map((bid, id) => {
      bid.netRevenue = pt;

      const floorInfo = bid.getFloor
        ? bid.getFloor({
          currency: currency || 'USD',
        })
        : {};
      const bidfloor = floorInfo?.floor;
      const bidfloorcur = floorInfo?.currency;
      const { smartadId } = bid.params;

      const imp = {
        id: id + 1,
        tagid: smartadId,
        bidfloor,
        bidfloorcur,
        ext: {
          bidder: {
            smartadId: smartadId,
          },
        },
      };

      const assets = _map(bid.nativeParams, (bidParams, key) => {
        const props = NATIVE_PARAMS[key];
        const asset = {
          required: bidParams.required & 1,
        };
        if (props) {
          asset.id = props.id;
          let wmin, hmin, w, h;
          let aRatios = bidParams.aspect_ratios;

          if (aRatios && aRatios[0]) {
            aRatios = aRatios[0];
            wmin = aRatios.min_width || 0;
            hmin = ((aRatios.ratio_height * wmin) / aRatios.ratio_width) | 0;
          }

          if (bidParams.sizes) {
            const sizes = flatten(bidParams.sizes);
            w = sizes[0];
            h = sizes[1];
          }

          asset[props.name] = {
            len: bidParams.len,
            type: props.type,
            wmin,
            hmin,
            w,
            h,
          };

          return asset;
        }
      }).filter(Boolean);

      if (assets.length) {
        imp.native = {
          assets,
        };
      }

      const bannerParams = deepAccess(bid, 'mediaTypes.banner');

      if (bannerParams && bannerParams.sizes) {
        const sizes = parseSizesInput(bannerParams.sizes);
        const format = sizes.map((size) => {
          const [width, height] = size.split('x');
          const w = parseInt(width, 10);
          const h = parseInt(height, 10);
          return { w, h };
        });

        imp.banner = {
          format,
        };
      }

      const videoParams = deepAccess(bid, 'mediaTypes.video');
      if (videoParams) {
        imp.video = videoParams;
      }

      return imp;
    });

    const request = {
      id: bidderRequest.auctionId,
      site,
      app,
      user,
      device,
      source: { tid, fd: 1 },
      ext: { pt },
      cur,
      imp,
    };

    if (deepAccess(bidderRequest, 'gdprConsent.gdprApplies') !== undefined) {
      deepSetValue(request, 'user.ext.consent', bidderRequest.gdprConsent.consentString);
      deepSetValue(request, 'regs.ext.gdpr', bidderRequest.gdprConsent.gdprApplies & 1);
    }

    if (bidderRequest.uspConsent) {
      deepSetValue(request, 'regs.ext.us_privacy', bidderRequest.uspConsent);
    }

    if (eids) {
      deepSetValue(request, 'user.ext.eids', eids);
    }

    if (schain) {
      deepSetValue(request, 'source.ext.schain', schain);
    }

    return {
      method: 'POST',
      url: 'https://' + endpoint + '/cgi-bin/smartads_prebid.pl',
      data: JSON.stringify(request),
      bids: validBidRequests,
    };
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
  },
  getUserSyncs: (syncOptions, responses, gdprConsent, uspConsent) => {
    const params = getUserSyncParams(gdprConsent, uspConsent);

    if (syncOptions.iframeEnabled) {
      // data is only assigned if params are available to pass to syncEndpoint
      return {
        type: 'iframe',
        url: `https://${endpoint}/prebid/usersync/index.html?${formatQS(params)}`,
      };
    } else if (syncOptions.pixelEnabled) {
      return {
        type: 'image',
        url: `https://${endpoint.includes('dev') ? 'dev-' : ''}data.dianomi.com/frontend/usync?${formatQS(params)}`,
      };
    }
  },
};

registerBidder(spec);

function parseNative(bid) {
  const { assets, link, imptrackers, jstracker } = bid.native;
  const result = {
    clickUrl: link.url,
    clickTrackers: link.clicktrackers || undefined,
    impressionTrackers: imptrackers || undefined,
    javascriptTrackers: jstracker ? [jstracker] : undefined,
  };
  assets.forEach((asset) => {
    const kind = NATIVE_ASSET_IDS[asset.id];
    const content = kind && asset[NATIVE_PARAMS[kind].name];
    if (content) {
      result[kind] = content.text ||
        content.value || {
        url: content.url,
        width: content.w,
        height: content.h,
      };
    }
  });

  return result;
}

function flatten(arr) {
  return [].concat(...arr);
}

function renderer(bid) {
  bid.renderer.push(() => {
    window.Dianomi.renderOutstream(bid);
  });
}
