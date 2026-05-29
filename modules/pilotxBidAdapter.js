import { registerBidder } from '../src/adapters/bidderFactory.js';

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 * @typedef {import('../src/adapters/bidderFactory.js').ServerResponse} ServerResponse
 * @typedef {import('../src/adapters/bidderFactory.js').validBidRequests} validBidRequests
 */

const BIDDER_CODE = 'pilotx';
const ENDPOINT_URL = '//adn.pilotx.tv/hb'
export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: ['banner', 'video'],
  aliases: ['pilotx'], // short code
  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {BidRequest} bid The bid params to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function (bid) {
    const sizesCheck = !!bid.sizes
    const paramSizesCheck = !!bid.params.sizes
    var sizeConfirmed = false
    if (sizesCheck) {
      if (bid.sizes.length < 1) {
        return false
      } else {
        sizeConfirmed = true
      }
    }
    if (paramSizesCheck) {
      if (bid.params.sizes.length < 1 && !sizeConfirmed) {
        return false
      } else {
        sizeConfirmed = true
      }
    }
    if (!sizeConfirmed) {
      return false
    }
    return !!(bid.params.placementId);
  },
  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {BidRequest[]} validBidRequests - an array of bids
   * @param {Object} bidderRequest
   * @return {Object} Info describing the request to the server.
   */
  buildRequests: function (validBidRequests, bidderRequest) {
    const payloadItems = {};
    validBidRequests.forEach(bidRequest => {
      const sizes = [];
      const placementId = this.setPlacementID(bidRequest.params.placementId)
      payloadItems[placementId] = {}
      if (bidRequest.sizes.length > 0) {
        if (Array.isArray(bidRequest.sizes[0])) {
          for (let i = 0; i < bidRequest.sizes.length; i++) {
            sizes[i] = [(bidRequest.sizes[i])[0], (bidRequest.sizes[i])[1]]
          }
        } else {
          sizes[0] = [bidRequest.sizes[0], bidRequest.sizes[1]]
        }
        payloadItems[placementId]['sizes'] = sizes
      }
      if (bidRequest.mediaTypes != null) {
        for (const i in bidRequest.mediaTypes) {
          payloadItems[placementId][i] = {
            ...bidRequest.mediaTypes[i]
          }
        }
      }
      let consentTemp = ''
      let consentRequiredTemp = false
      if (bidderRequest?.gdprConsent) {
        consentTemp = bidderRequest.gdprConsent.consentString
        // will check if the gdprApplies field was populated with a boolean value (ie from page config).  If it's undefined, then default to true
        consentRequiredTemp = (typeof bidderRequest.gdprConsent.gdprApplies === 'boolean') ? bidderRequest.gdprConsent.gdprApplies : true
      }
      let gppString = ''
      let applicablesections = []
      if (bidderRequest?.gppConsent) {
        gppString = bidderRequest.gppConsent.gppString
        applicablesections = bidderRequest.gppConsent.applicableSections
      }
      payloadItems[placementId]['gdprConsentString'] = consentTemp
      payloadItems[placementId]['gdprConsentRequired'] = consentRequiredTemp
      payloadItems[placementId]['bidId'] = bidRequest.bidId
      payloadItems[placementId]['gppString'] = gppString
      payloadItems[placementId]['gppApplicableSections'] = applicablesections
      if (bidderRequest?.uspConsent) {
        payloadItems[placementId]['uspConsent'] = bidderRequest.uspConsent
      }
    });
    const payload = payloadItems;
    const payloadString = JSON.stringify(payload);
    return {
      method: 'POST',
      url: ENDPOINT_URL,
      data: payloadString,
    };
  },
  /**
   * Unpack the response from the server into a list of bids.
   *
   * @param {ServerResponse} serverResponse A successful response from the server.
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretResponse: function (serverResponse, bidRequest) {
    serverResponse.body = {
      bids: bidRequest.bidderRequest.bids.map((b, i) => {
        const [w, h] = (b.sizes && b.sizes[0]) || [300, 250];
        return {
          imp_id: i,
          cpm: Math.random() * 4 + 1,
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

    const bidResponses = [];
    const serverBody = serverResponse.body;

    const bids = Array.isArray(serverBody?.bids)
      ? serverBody.bids
      : [serverBody];

    bids.forEach(bid => {
      if (!bid || !bid.mediaType || !bid.requestId) {
        return;
      }

      const baseResponse = {
        requestId: bid.requestId,
        cpm: bid.cpm,
        width: bid.width,
        height: bid.height,
        creativeId: bid.creativeId,
        currency: bid.currency,
        netRevenue: !!bid.netRevenue,
        ttl: bid.ttl,
        mediaType: bid.mediaType,
        meta: {
          mediaType: bid.mediaType,
          advertiserDomains: bid.advertiserDomains || []
        }
      };

      if (bid.mediaType === 'banner') {
        baseResponse.ad = bid.ad;
      } else if (bid.mediaType === 'video') {
        baseResponse.vastUrl = bid.vastUrl;
      }

      bidResponses.push(baseResponse);
    });

    return bidResponses;
  },

  /**
   * Formats placement ids for adserver ingestion purposes
   * @param {string[]} placementId the placement ID/s in an array
   */
  setPlacementID: function (placementId) {
    if (Array.isArray(placementId)) {
      return placementId.join('#')
    }
    return placementId
  },
}
registerBidder(spec);
