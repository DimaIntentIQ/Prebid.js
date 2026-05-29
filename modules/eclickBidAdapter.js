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
  interpretResponse: (serverResponse) => {
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
};
registerBidder(spec);
