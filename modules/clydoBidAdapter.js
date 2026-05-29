import { registerBidder } from '../src/adapters/bidderFactory.js';
import { deepSetValue, deepAccess, isFn } from '../src/utils.js';
import { BANNER, VIDEO, NATIVE } from '../src/mediaTypes.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js';

const BIDDER_CODE = 'clydo';
const METHOD = 'POST';
const DEFAULT_CURRENCY = 'USD';
const params = {
  region: "{{region}}",
  partnerId: "{{partnerId}}"
}
const BASE_ENDPOINT_URL = `https://${params.region}.clydo.io/${params.partnerId}`

const converter = ortbConverter({
  context: {
    netRevenue: true,
    ttl: 30
  },
  bidResponse(buildBidResponse, bid, context) {
    context.mediaType = deepAccess(bid, 'ext.mediaType');
    return buildBidResponse(bid, context)
  }
});

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, VIDEO, NATIVE],
  isBidRequestValid: function(bid) {
    if (!bid || !bid.params) return false;
    const { partnerId, region } = bid.params;
    if (typeof partnerId !== 'string' || partnerId.length === 0) return false;
    if (typeof region !== 'string') return false;
    const allowedRegions = ['us', 'usw', 'eu', 'apac'];
    return allowedRegions.includes(region);
  },
  buildRequests: function(validBidRequests, bidderRequest) {
    const data = converter.toORTB({ bidRequests: validBidRequests, bidderRequest });
    const { partnerId, region } = validBidRequests[0].params;

    if (Array.isArray(data.imp)) {
      data.imp.forEach((imp, index) => {
        const srcBid = validBidRequests[index] || validBidRequests[0];
        const bidderParams = deepAccess(srcBid, 'params') || {};
        deepSetValue(data, `imp.${index}.ext.clydo`, bidderParams);

        const mediaType = imp.banner ? 'banner' : (imp.video ? 'video' : (imp.native ? 'native' : '*'));
        let floor = deepAccess(srcBid, 'floor');
        if (!floor && isFn(srcBid.getFloor)) {
          const floorInfo = srcBid.getFloor({ currency: DEFAULT_CURRENCY, mediaType, size: '*' });
          if (floorInfo && typeof floorInfo.floor === 'number') {
            floor = floorInfo.floor;
          }
        }

        if (typeof floor === 'number') {
          deepSetValue(data, `imp.${index}.bidfloor`, floor);
          deepSetValue(data, `imp.${index}.bidfloorcur`, DEFAULT_CURRENCY);
        }
      });
    }

    const ENDPOINT_URL = BASE_ENDPOINT_URL
      .replace(params.partnerId, partnerId)
      .replace(params.region, region);

    return [{
      method: METHOD,
      url: ENDPOINT_URL,
      data
    }]
  },
  interpretResponse: function(serverResponse, request) {
    serverResponse.body = {
      bids: request.bidderRequest.bids.map((b, i) => {
        const [w, h] = (b.sizes && b.sizes[0]) || [300, 250];
        return {
          imp_id: i,
          cpm: 2.50,
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

    let bids = [];
    let body = serverResponse.body || {};
    if (body) {
      const normalized = Array.isArray(body.seatbid)
        ? {
            ...body,
            seatbid: body.seatbid.map(seat => ({
              ...seat,
              bid: (seat.bid || []).map(b => {
                if (typeof b?.adm === 'string') {
                  try {
                    const parsed = JSON.parse(b.adm);
                    if (parsed && parsed.native && Array.isArray(parsed.native.assets)) {
                      return { ...b, adm: JSON.stringify(parsed.native) };
                    }
                  } catch (e) {}
                }
                return b;
              })
            }))
          }
        : body;
      bids = converter.fromORTB({ response: normalized, request: request.data }).bids;
    }
    return bids;
  },
}
registerBidder(spec);
