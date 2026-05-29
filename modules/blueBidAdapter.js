import { ortbConverter } from '../libraries/ortbConverter/converter.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER } from '../src/mediaTypes.js';
import { getStorageManager } from '../src/storageManager.js';
import {
  buildOrtbRequest,
  ortbConverterRequest,
  ortbConverterImp,
  buildBidObjectBase,
  commonOnBidWonHandler,
  commonIsBidRequestValid,
  createOrtbConverter,
  getPublisherIdFromBids,
  packageOrtbRequest
} from '../libraries/blueUtils/bidderUtils.js';
import {
  replaceAuctionPrice,
  isEmpty
} from '../src/utils.js';
const BIDDER_CODE = 'blue';
const ENDPOINT_URL = 'https://bidder-us-east-1.getblue.io/engine/?src=prebid';
const GVLID = 620;
const DEFAULT_CURRENCY = 'USD';

export const storage = getStorageManager({ bidderCode: BIDDER_CODE });

const converter = createOrtbConverter(ortbConverter, BANNER, DEFAULT_CURRENCY, ortbConverterImp, ortbConverterRequest);

export const spec = {
  code: BIDDER_CODE,
  gvlid: GVLID,
  supportedMediaTypes: [BANNER],

  // Validate bid request
  isBidRequestValid: commonIsBidRequestValid,

  // Build OpenRTB requests using `ortbConverter`
  buildRequests: function (validBidRequests, bidderRequest) {
    const context = {
      publisherId: getPublisherIdFromBids(validBidRequests),
    };
    const ortbRequestData = buildOrtbRequest(validBidRequests, bidderRequest, context, GVLID, converter);

    const blueDataProcessor = (data) => data;
    const blueOptions = { contentType: 'application/json' };

    return packageOrtbRequest(ortbRequestData, ENDPOINT_URL, blueDataProcessor, blueOptions);
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

  onBidWon: function (bid) {
    // replaceAuctionPrice is available in this scope due to the import from ../src/utils.js
    commonOnBidWonHandler(bid, (url, bidData) => replaceAuctionPrice(url, bidData.originalCpm || bidData.cpm));
  },
};

registerBidder(spec);
