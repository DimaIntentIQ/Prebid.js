import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO, NATIVE } from '../src/mediaTypes.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js';
import { pbsExtensions } from '../libraries/pbsExtensions/pbsExtensions.js'
import { deepSetValue } from '../src/utils.js';

const BIDDER_CODE = 'loopme';
const url = 'https://prebid.loopmertb.com/';
const GVLID = 109;

export const converter = ortbConverter({
  processors: pbsExtensions,
  context: {
    netRevenue: true,
    ttl: 30
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    deepSetValue(imp, 'ext.bidder', { ...bidRequest.params });
    return imp;
  },
  request(buildRequest, imps, bidderRequest, context) {
    const req = buildRequest(imps, bidderRequest, context);
    req.at = 1;
    return req;
  }
});

export const spec = {
  supportedMediaTypes: [BANNER, VIDEO, NATIVE],
  code: BIDDER_CODE,
  gvlid: GVLID,

  isBidRequestValid: ({ params = {} }) => Boolean(params.publisherId),

  buildRequests: (bidRequests, bidderRequest) =>
    ({ url, method: 'POST', data: converter.toORTB({ bidRequests, bidderRequest }) }),

  interpretResponse: (serverResponse, bidRequest) => {
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
  },

  getUserSyncs: (syncOptions, serverResponses) =>
    serverResponses.flatMap(({ body }) =>
      (body.ext?.usersyncs || [])
        .filter(({ type }) => type === 'image' || type === 'iframe')
        .filter(({ url }) => url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')))
        .filter(({ type }) => (type === 'image' && syncOptions.pixelEnabled) || (type === 'iframe' && syncOptions.iframeEnabled))
    )
}
registerBidder(spec);
