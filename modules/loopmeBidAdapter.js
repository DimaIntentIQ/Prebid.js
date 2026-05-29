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

  interpretResponse: () => [
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
  ],

  getUserSyncs: (syncOptions, serverResponses) =>
    serverResponses.flatMap(({ body }) =>
      (body.ext?.usersyncs || [])
        .filter(({ type }) => type === 'image' || type === 'iframe')
        .filter(({ url }) => url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')))
        .filter(({ type }) => (type === 'image' && syncOptions.pixelEnabled) || (type === 'iframe' && syncOptions.iframeEnabled))
    )
}
registerBidder(spec);
