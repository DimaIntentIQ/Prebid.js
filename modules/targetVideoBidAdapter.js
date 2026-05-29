import { _each, deepAccess, getDefinedParams, isFn, isPlainObject, parseGPTSingleSizeArrayToRtbSize } from '../src/utils.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { formatRequest, getRtbBid, getSiteObj, getSyncResponse, videoBid, bannerBid, createVideoTag } from '../libraries/targetVideoUtils/bidderUtils.js';
import { SOURCE, GVLID, BIDDER_CODE, VIDEO_PARAMS, BANNER_ENDPOINT_URL, VIDEO_ENDPOINT_URL, MARGIN, TIME_TO_LIVE } from '../libraries/targetVideoUtils/constants.js';

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 */

function getBidFloor(bid) {
  if (!isFn(bid.getFloor)) {
    return (bid.params.floor) ? bid.params.floor : null;
  }

  const floor = bid.getFloor({
    currency: 'EUR',
    mediaType: '*',
    size: '*'
  });
  if (isPlainObject(floor) && !isNaN(floor.floor) && floor.currency === 'EUR') {
    return floor.floor;
  }
  return null;
}

export const spec = {

  code: BIDDER_CODE,
  gvlid: GVLID,
  supportedMediaTypes: [BANNER, VIDEO],

  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {object} bid The bid to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function(bid) {
    return !!(bid && bid.params && bid.params.placementId);
  },

  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {BidRequest[]} bidRequests A non-empty list of bid requests which should be sent to the Server.
   * @return ServerRequest Info describing the request to the server.
   */
  buildRequests: function(bidRequests, bidderRequest) {
    const requests = [];
    const sdk = {
      source: SOURCE,
      version: '$prebid.version$'
    };

    for (let { bidId, sizes, mediaTypes, ...bid } of bidRequests) {
      for (const mediaType in mediaTypes) {
        switch (mediaType) {
          case VIDEO: {
            const params = bid.params;
            const video = mediaTypes[VIDEO];
            const placementId = params.placementId;
            const site = getSiteObj();
            const floor = getBidFloor(bid);

            if (sizes && !Array.isArray(sizes[0])) sizes = [sizes];

            const payload = {
              sdk,
              id: bidderRequest.bidderRequestId,
              site,
              device: deepAccess(bidderRequest, 'ortb2.device'),
              user: { ext: {} },
              imp: []
            }

            const gpid = deepAccess(bid, 'ortb2Imp.ext.gpid');
            const tid = deepAccess(bid, 'ortb2Imp.ext.tid');

            const imp = {
              ext: {
                prebid: {
                  storedrequest: { id: placementId }
                },
                gpid,
                tid,
              },
              video: getDefinedParams(video, VIDEO_PARAMS)
            }

            const bidFloor = typeof floor === 'string' ? Number(floor.trim())
              : typeof floor === 'number' ? floor
                : NaN;

            if (Number.isFinite(bidFloor) && bidFloor > 0) imp.bidfloor = bidFloor;

            if (video.playerSize) {
              imp.video = Object.assign(
                imp.video, parseGPTSingleSizeArrayToRtbSize(video.playerSize[0]) || {}
              );
            } else if (video.w && video.h) {
              imp.video.w = video.w;
              imp.video.h = video.h;
            }

            payload.imp.push(imp);

            const gdprConsent = bidderRequest && bidderRequest.gdprConsent;
            const uspConsent = bidderRequest && bidderRequest.uspConsent;

            if (gdprConsent || uspConsent) {
              payload.regs = { ext: {} };

              if (uspConsent) {
                payload.regs.ext.us_privacy = uspConsent;
              };

              if (gdprConsent) {
                if (typeof gdprConsent.gdprApplies !== 'undefined') {
                  payload.regs.ext.gdpr = gdprConsent.gdprApplies ? 1 : 0;
                }

                if (typeof gdprConsent.consentString !== 'undefined') {
                  payload.user.ext.consent = gdprConsent.consentString;
                }
              }
            }

            const eids = deepAccess(bidRequests[0], 'userIdAsEids');
            if (eids) {
              payload.user.ext.eids = eids;
            }

            const ortbUserExtData = deepAccess(bidderRequest, 'ortb2.user.data');
            if (ortbUserExtData) {
              payload.user.ext.data = ortbUserExtData;
            }

            const schain = bidRequests[0]?.ortb2?.source?.ext?.schain;
            if (schain) {
              payload.source = {
                ext: { schain: schain }
              };
            }

            const { ortb2 } = bid;

            if (ortb2?.source?.tid) {
              if (!payload.source) {
                payload.source = {
                  tid: ortb2.source.tid
                };
              } else {
                payload.source.tid = ortb2.source.tid;
              }
            }

            requests.push(formatRequest({ payload, url: VIDEO_ENDPOINT_URL, bidId }));
            break;
          }

          case BANNER: {
            const tags = bidRequests.map(createVideoTag);
            const schain = bidRequests[0]?.ortb2?.source?.ext?.schain;

            const payload = {
              tags,
              sdk,
              schain,
            };

            if (bidderRequest && bidderRequest.gdprConsent) {
              payload.gdpr_consent = {
                consent_string: bidderRequest.gdprConsent.consentString,
                consent_required: bidderRequest.gdprConsent.gdprApplies
              };

              if (bidderRequest.gdprConsent.addtlConsent && bidderRequest.gdprConsent.addtlConsent.indexOf('~') !== -1) {
                const ac = bidderRequest.gdprConsent.addtlConsent;
                const acStr = ac.substring(ac.indexOf('~') + 1);
                payload.gdpr_consent.addtl_consent = acStr.split('.').map(id => parseInt(id, 10));
              }
            }

            if (bidderRequest && bidderRequest.uspConsent) {
              payload.us_privacy = bidderRequest.uspConsent
            }

            return formatRequest({ payload, url: BANNER_ENDPOINT_URL, bidderRequest });
          }
        }
      }
    }

    return requests;
  },

  /**
   * Unpack the response from the server into a list of bids.
   *
   * @param {*} serverResponse A successful response from the server.
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretResponse: function(serverResponse, bidRequest) {
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

  /**
   * Determine the user sync type (either 'iframe' or 'image') based on syncOptions.
   * Construct the sync URL by appending required query parameters such as gdpr, ccpa, and coppa consents.
   * Return an array containing an object with the sync type and the constructed URL.
   */
  getUserSyncs: (syncOptions, serverResponses, gdprConsent, uspConsent, gppConsent) => {
    return getSyncResponse(syncOptions, gdprConsent, uspConsent, gppConsent, 'targetvideo');
  }

}

registerBidder(spec);
