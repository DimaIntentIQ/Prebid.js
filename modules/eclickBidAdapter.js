import { mockCpm } from '../src/mockCpm.js';
import { NATIVE } from '../src/mediaTypes.js';
import { convertOrtbRequestToProprietaryNative } from '../src/native.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { getDevice } from '../libraries/fpdUtils/deviceInfo.js';

// **** ECLICK ADAPTER ****
export const BIDDER_CODE = 'eclick';
const DEFAULT_CURRENCY = ['USD'];
const DEFAULT_TTL = 1000;
export const ENDPOINT = 'https://g.eclick.vn/rtb_hb_request?fosp_uid=';
export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [NATIVE],
  isBidRequestValid: (bid) => {
    return !!bid && !!bid.params && !!bid.bidder && !!bid.params.zid;
  },
  buildRequests: (validBidRequests = [], bidderRequest) => {
    validBidRequests = convertOrtbRequestToProprietaryNative(validBidRequests);

    const ortb2ConfigFPD = bidderRequest.ortb2.site.ext?.data || {};
    const ortb2Device = bidderRequest.ortb2.device;
    const ortb2Site = bidderRequest.ortb2.site;

    const isMobile = getDevice();
    const imp = [];
    const fENDPOINT = ENDPOINT + (ortb2ConfigFPD.fosp_uid || '');
    const request = {
      deviceWidth: ortb2Device.w,
      deviceHeight: ortb2Device.h,
      ua: ortb2Device.ua,
      language: ortb2Device.language,
      device: isMobile ? 'mobile' : 'desktop',
      host: ortb2Site.domain,
      page: ortb2Site.page,
      imp,
      myvne_id: ortb2ConfigFPD.myvne_id || '',
      orig_aid: ortb2ConfigFPD.orig_aid,
      fosp_aid: ortb2ConfigFPD.fosp_aid,
      fosp_uid: ortb2ConfigFPD.fosp_uid,
      id: ortb2ConfigFPD.id,
    };

    validBidRequests.forEach((bid) => {
      imp.push({
        requestId: bid.bidId,
        adUnitCode: bid.adUnitCode,
        zid: bid.params.zid,
      });
    });

    return {
      method: 'POST',
      url: fENDPOINT,
      data: request,
    };
  },
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
};
registerBidder(spec);
