// jshint esversion: 6, es3: false, node: true
/* eslint dot-notation:0, quote-props:0 */
import {assert, expect} from 'chai';
import {spec} from 'modules/adxcgBidAdapter.js';
import {config} from 'src/config.js';

import {addFPDToBidderRequest} from '../../helpers/fpd.js';

const utils = require('src/utils');

describe('Adxcg adapter', function () {
  let bids = [];

  describe('getUserSyncs', function () {
    const usersyncUrl = 'https://usersync-url.com';
    beforeEach(() => {
      config.setConfig(
        {
          adxcg: {
            usersyncUrl: usersyncUrl,
          }
        }
      )
    })
    after(() => {
      config.resetConfig()
    })

    it('should return user sync if pixel enabled with adxcg config', function () {
      const ret = spec.getUserSyncs({ pixelEnabled: true })
      expect(ret).to.deep.equal([{ type: 'image', url: usersyncUrl }])
    })

    it('should not return user sync if pixel disabled', function () {
      const ret = spec.getUserSyncs({ pixelEnabled: false })
      expect(ret).to.be.an('array').that.is.empty
    })

    it('should not return user sync if url is not set', function () {
      config.resetConfig()
      const ret = spec.getUserSyncs({ pixelEnabled: true })
      expect(ret).to.be.an('array').that.is.empty
    })

    it('should pass GDPR consent', function () {
      expect(spec.getUserSyncs({ pixelEnabled: true }, {}, { gdprApplies: true, consentString: 'foo' }, undefined)).to.deep.equal([{
        type: 'image', url: `${usersyncUrl}?gdpr=1&gdpr_consent=foo`
      }]);
      expect(spec.getUserSyncs({ pixelEnabled: true }, {}, { gdprApplies: false, consentString: 'foo' }, undefined)).to.deep.equal([{
        type: 'image', url: `${usersyncUrl}?gdpr=0&gdpr_consent=foo`
      }]);
      expect(spec.getUserSyncs({ pixelEnabled: true }, {}, { gdprApplies: true, consentString: undefined }, undefined)).to.deep.equal([{
        type: 'image', url: `${usersyncUrl}?gdpr=1&gdpr_consent=`
      }]);
    });

    it('should pass US consent', function () {
      expect(spec.getUserSyncs({ pixelEnabled: true }, {}, undefined, '1NYN')).to.deep.equal([{
        type: 'image', url: `${usersyncUrl}?us_privacy=1NYN`
      }]);
    });

    it('should pass GDPR and US consent', function () {
      expect(spec.getUserSyncs({ pixelEnabled: true }, {}, { gdprApplies: true, consentString: 'foo' }, '1NYN')).to.deep.equal([{
        type: 'image', url: `${usersyncUrl}?gdpr=1&gdpr_consent=foo&us_privacy=1NYN`
      }]);
    });
  });

  describe('onBidWon', function () {
    beforeEach(function () {
      sinon.stub(utils, 'triggerPixel');
    });
    afterEach(function () {
      utils.triggerPixel.restore();
    });

    it('Should trigger pixel if bid nurl', function () {
      const bid = {
        nurl: 'http://example.com/win/${AUCTION_PRICE}',
        cpm: 2.1,
        originalCpm: 1.1,
      }
      spec.onBidWon(bid);
      expect(utils.triggerPixel.callCount).to.equal(1)
    })
  })

  it('should return just to have at least 1 karma test ok', function () {
    assert(true);
  });
});

describe('adxcg v8 oRtbConverter Adapter Tests', function () {
  const slotConfigs = [{
    placementCode: '/DfpAccount1/slot1',
    mediaTypes: {
      banner: {
        sizes: [[728, 90], [160, 600]]
      }
    },
    bidId: 'bid12345',
    params: {
      adzoneid: '77'
    }
  }, {
    placementCode: '/DfpAccount2/slot2',
    mediaTypes: {
      banner: {
        sizes: [[728, 90]]
      }
    },
    bidId: 'bid23456',
    params: {
      adzoneid: '77'
    }
  }];
  const nativeOrtbRequest = {
    assets: [{
      id: 1,
      required: 1,
      img: {
        type: 3,
        w: 150,
        h: 50,
      }
    },
    {
      id: 2,
      required: 1,
      title: {
        len: 80
      }
    },
    {
      id: 3,
      required: 0,
      data: {
        type: 1
      }
    }]
  };
  const nativeSlotConfig = [{
    placementCode: '/DfpAccount1/slot3',
    bidId: 'bid12345',
    mediaTypes: {
      native: {
        ortb: nativeOrtbRequest
      }
    },
    nativeOrtbRequest,
    params: {

      adzoneid: '77'
    }
  }];
  const videoSlotConfig = [{
    placementCode: '/DfpAccount1/slotVideo',
    bidId: 'bid12345',
    mediaTypes: {
      video: {
        playerSize: [400, 300],
        w: 400,
        h: 300,
        minduration: 5,
        maxduration: 10,
        startdelay: 0,
        skip: 1,
        minbitrate: 200,
        protocols: [1, 2, 4]
      }
    },
    params: {
      adzoneid: '77'
    }
  }];
  const additionalParamsConfig = [{
    placementCode: '/DfpAccount1/slot1',
    mediaTypes: {
      banner: {
        sizes: [[1, 1]]
      }
    },
    bidId: 'bid12345',
    params: {
      adzoneid: '77',
      extra_key1: 'extra_val1',
      extra_key2: 12345,
      extra_key3: {
        key1: 'val1',
        key2: 23456,
      },
      extra_key4: [1, 2, 3]
    }
  }];

  const schainParamsSlotConfig = [{
    placementCode: '/DfpAccount1/slot1',
    mediaTypes: {
      banner: {
        sizes: [[1, 1]]
      }
    },
    bidId: 'bid12345',
    params: {
      adzoneid: '77',
      bcat: ['IAB-1', 'IAB-20'],
      battr: [1, 2, 3],
      bidfloor: 1.5,
      badv: ['cocacola.com', 'lays.com']
    },
    schain: {
      'ver': '1.0',
      'complete': 1,
      'nodes': [
        {
          'asi': 'exchange1.com',
          'sid': '1234',
          'hp': 1,
          'rid': 'bid-request-1',
          'name': 'publisher',
          'domain': 'publisher.com'
        }
      ]
    },
  }];

  let bidderRequest;

  beforeEach(() => {
    return addFPDToBidderRequest({
      refererInfo: {
        page: 'https://publisher.com/home',
        ref: 'https://referrer'
      }
    }).then(br => { bidderRequest = br });
  })

  it('Verify build request', function () {
    const request = spec.buildRequests(slotConfigs, bidderRequest);
    expect(request.url).to.equal('https://pbc.adxcg.net/rtb/ortb/pbc?adExchangeId=1');
    expect(request.method).to.equal('POST');
    const ortbRequest = request.data;
    // site object
    expect(ortbRequest.site).to.not.equal(null);
    expect(ortbRequest.site.publisher).to.not.equal(null);
    expect(ortbRequest.site.page).to.equal('https://publisher.com/home');
    expect(ortbRequest.imp).to.have.lengthOf(2);
    // device object
    expect(ortbRequest.device).to.not.equal(null);
    expect(ortbRequest.device.ua).to.equal(navigator.userAgent);
    // slot 1
    expect(ortbRequest.imp[0].banner).to.not.equal(null);
    expect(ortbRequest.imp[0].banner.format).to.deep.eq([{ 'w': 728, 'h': 90 }, { 'w': 160, 'h': 600 }]);
    // slot 2
    expect(ortbRequest.imp[1].banner).to.not.equal(null);
    expect(ortbRequest.imp[1].banner.format).to.deep.eq([{ 'w': 728, 'h': 90 }]);
  });

  it('Verify parse response', function () {
    const request = spec.buildRequests(slotConfigs, bidderRequest);
    const ortbRequest = request.data;
    const ortbResponse = {
      seatbid: [{
        bid: [{
          impid: ortbRequest.imp[0].id,
          price: 1.25,
          adm: 'This is an Ad',
          crid: 'Creative#123',
          mtype: 1,
          w: 300,
          h: 250,
          exp: 20,
          adomain: ['advertiser.com']
        }]
      }]
    };
    const bids = spec.interpretResponse({ body: ortbResponse }, request);
    expect(bids).to.have.lengthOf(1);
    // verify first bid
    const bid = bids[0];
    expect(bid.cpm).to.equal(1.25);
    expect(bid.ad).to.equal('This is an Ad');
    expect(bid.width).to.equal(300);
    expect(bid.height).to.equal(250);
    expect(bid.creative_id).to.equal('Creative#123');
    expect(bid.creativeId).to.equal('Creative#123');
    expect(bid.netRevenue).to.equal(true);
    expect(bid.currency).to.equal('EUR');
    expect(bid.ttl).to.equal(20);
    expect(bid.meta).to.not.be.null;
    expect(bid.meta.advertiserDomains).to.eql(['advertiser.com']);
  });

  it('Verify full passback', function () {
    const request = spec.buildRequests(slotConfigs, bidderRequest);
    const bids = spec.interpretResponse({ body: null }, request)
    expect(bids).to.have.lengthOf(0);
  });

  if (FEATURES.NATIVE) {
    it('Verify Native request', function () {
      const request = spec.buildRequests(nativeSlotConfig, bidderRequest);
      expect(request.url).to.equal('https://pbc.adxcg.net/rtb/ortb/pbc?adExchangeId=1');
      expect(request.method).to.equal('POST');
      const ortbRequest = request.data;
      // native impression
      expect(ortbRequest.imp[0].tagid).to.equal('77');
      expect(ortbRequest.imp[0].banner).to.be.undefined;
      const nativePart = ortbRequest.imp[0]['native'];
      expect(nativePart).to.not.equal(null);
      expect(nativePart.request).to.not.equal(null);
      // native request assets
      const nativeRequest = JSON.parse(ortbRequest.imp[0]['native'].request);
      expect(nativeRequest).to.not.equal(null);
      expect(nativeRequest.assets).to.have.lengthOf(3);
      // image asset
      expect(nativeRequest.assets[0].id).to.equal(1);
      expect(nativeRequest.assets[0].required).to.equal(1);
      expect(nativeRequest.assets[0].title).to.be.undefined;
      expect(nativeRequest.assets[0].img).to.not.equal(null);
      expect(nativeRequest.assets[0].img.w).to.equal(150);
      expect(nativeRequest.assets[0].img.h).to.equal(50);
      expect(nativeRequest.assets[0].img.type).to.equal(3);
      // title asset
      expect(nativeRequest.assets[1].id).to.equal(2);
      expect(nativeRequest.assets[1].required).to.equal(1);
      expect(nativeRequest.assets[1].title).to.not.equal(null);
      expect(nativeRequest.assets[1].title.len).to.equal(80);
      // data asset
      expect(nativeRequest.assets[2].id).to.equal(3);
      expect(nativeRequest.assets[2].required).to.equal(0);
      expect(nativeRequest.assets[2].title).to.be.undefined;
      expect(nativeRequest.assets[2].data).to.not.equal(null);
      expect(nativeRequest.assets[2].data.type).to.equal(1);
    });

    it('Verify Native response', function () {
      const request = spec.buildRequests(nativeSlotConfig, bidderRequest);
      expect(request.url).to.equal('https://pbc.adxcg.net/rtb/ortb/pbc?adExchangeId=1');
      expect(request.method).to.equal('POST');
      const ortbRequest = request.data;
      const nativeResponse = {
        assets: [
          { id: 1, img: { type: 3, url: 'https://images.cdn.brand.com/123' } },
          { id: 2, title: { text: 'Ad Title' } },
          { id: 3, data: { type: 1, value: 'Sponsored By: Brand' } }
        ],
        link: { url: 'https://brand.clickme.com/' },
        imptrackers: ['https://imp1.trackme.com/', 'https://imp1.contextweb.com/']

      };
      const ortbResponse = {
        seatbid: [{
          bid: [{
            impid: ortbRequest.imp[0].id,
            price: 1.25,
            adm: JSON.stringify(nativeResponse),
            mtype: 4
          }]
        }]
      };
      const bids = spec.interpretResponse({ body: ortbResponse }, request);
      // verify bid
      const bid = bids[0];
      expect(bid.cpm).to.equal(1.25);
      expect(bid.requestId).to.equal('bid12345');
      expect(bid.ad).to.be.undefined;
      expect(bid.mediaType).to.equal('native');
      expect(bid['native']).to.not.be.null;
      expect(bid['native'].ortb).to.not.be.null;
      const nativeBid = bid['native'].ortb;
      expect(nativeBid.assets).to.have.lengthOf(3);
      expect(nativeBid.assets[0].id).to.equal(1);
      expect(nativeBid.assets[0].img).to.not.be.null;
      expect(nativeBid.assets[0].img.type).to.equal(3);
      expect(nativeBid.assets[0].img.url).to.equal('https://images.cdn.brand.com/123');
      expect(nativeBid.assets[1].id).to.equal(2);
      expect(nativeBid.assets[1].title).to.not.be.null;
      expect(nativeBid.assets[1].title.text).to.equal('Ad Title');
      expect(nativeBid.assets[2].id).to.equal(3);
      expect(nativeBid.assets[2].data).to.not.be.null;
      expect(nativeBid.assets[2].data.type).to.equal(1);
      expect(nativeBid.assets[2].data.value).to.equal('Sponsored By: Brand');
      expect(nativeBid.link).to.not.be.null;
      expect(nativeBid.link.url).to.equal('https://brand.clickme.com/');
      expect(nativeBid.imptrackers).to.have.lengthOf(2);
      expect(nativeBid.imptrackers[0]).to.equal('https://imp1.trackme.com/');
      expect(nativeBid.imptrackers[1]).to.equal('https://imp1.contextweb.com/');
    });
  }

  it('Verifies bidder code', function () {
    expect(spec.code).to.equal('adxcg');
  });

  it('Verifies bidder aliases', function () {
    expect(spec.aliases).to.have.lengthOf(1);
    expect(spec.aliases[0]).to.equal('mediaopti');
  });

  it('Verifies supported media types', function () {
    expect(spec.supportedMediaTypes).to.have.lengthOf(3);
    expect(spec.supportedMediaTypes[0]).to.equal('banner');
    expect(spec.supportedMediaTypes[1]).to.equal('native');
    expect(spec.supportedMediaTypes[2]).to.equal('video');
  });

  if (FEATURES.VIDEO) {
    it('Verify Video request', function () {
      const request = spec.buildRequests(videoSlotConfig, bidderRequest);
      expect(request.url).to.equal('https://pbc.adxcg.net/rtb/ortb/pbc?adExchangeId=1');
      expect(request.method).to.equal('POST');
      const ortbRequest = request.data;
      expect(ortbRequest).to.not.equal(null);
      expect(ortbRequest.imp).to.have.lengthOf(1);
      expect(ortbRequest.imp[0].video).to.not.be.null;
      expect(ortbRequest.imp[0].native).to.be.undefined;
      expect(ortbRequest.imp[0].banner).to.be.undefined;
      expect(ortbRequest.imp[0].video.w).to.equal(400);
      expect(ortbRequest.imp[0].video.h).to.equal(300);
      expect(ortbRequest.imp[0].video.minduration).to.equal(5);
      expect(ortbRequest.imp[0].video.maxduration).to.equal(10);
      expect(ortbRequest.imp[0].video.startdelay).to.equal(0);
      expect(ortbRequest.imp[0].video.skip).to.equal(1);
      expect(ortbRequest.imp[0].video.minbitrate).to.equal(200);
      expect(ortbRequest.imp[0].video.protocols).to.eql([1, 2, 4]);
    });
  }

  it('Verify extra parameters', function () {
    let request = spec.buildRequests(additionalParamsConfig, bidderRequest);
    let ortbRequest = request.data;
    expect(ortbRequest).to.not.equal(null);
    expect(ortbRequest.imp).to.have.lengthOf(1);
    expect(ortbRequest.imp[0].ext).to.not.equal(null);
    expect(ortbRequest.imp[0].ext.prebid).to.not.equal(null);
    expect(ortbRequest.imp[0].ext.prebid).to.not.be.null;
    expect(ortbRequest.imp[0].ext.prebid.extra_key1).to.equal('extra_val1');
    expect(ortbRequest.imp[0].ext.prebid.extra_key2).to.equal(12345);
    expect(ortbRequest.imp[0].ext.prebid.extra_key3).to.not.be.null;
    expect(ortbRequest.imp[0].ext.prebid.extra_key3.key1).to.equal('val1');
    expect(ortbRequest.imp[0].ext.prebid.extra_key3.key2).to.equal(23456);
    expect(ortbRequest.imp[0].ext.prebid.extra_key4).to.eql([1, 2, 3]);
    expect(Object.keys(ortbRequest.imp[0].ext.prebid)).to.eql(['adzoneid', 'extra_key1', 'extra_key2', 'extra_key3', 'extra_key4']);
    // attempting with a configuration with no unknown params.
    request = spec.buildRequests(videoSlotConfig, bidderRequest);
    ortbRequest = request.data;
    expect(ortbRequest).to.not.equal(null);
    expect(ortbRequest.imp).to.have.lengthOf(1);
    // expect(ortbRequest.imp[0].ext).to.be.undefined;
  });

  it('Verify user level first party data', function () {
    const bidderRequest = {
      refererInfo: {
        page: 'https://publisher.com/home',
        ref: 'https://referrer'
      },
      gdprConsent: {
        gdprApplies: true,
        consentString: 'serialized_gdpr_data'
      },
      ortb2: {
        user: {
          yob: 1985,
          gender: 'm',
          ext: {
            data: {
              registered: true,
              interests: ['cars']
            }
          }
        }
      }
    };
    let request = spec.buildRequests(slotConfigs, bidderRequest);
    let ortbRequest = request.data;
    expect(ortbRequest).to.not.equal(null);
    expect(ortbRequest.user).to.not.equal(null);
  });

  it('Verify site level first party data', function () {
    const bidderRequest = {
      ortb2: {
        site: {
          content: {
            data: [{
              name: 'www.iris.com',
              ext: {
                segtax: 500,
                cids: ['iris_c73g5jq96mwso4d8']
              }
            }]
          },
          page: 'http://pub.com/news',
          ref: 'http://google.com',
          publisher: {
            domain: 'pub.com'
          }
        }
      }
    };
    let request = spec.buildRequests(slotConfigs, bidderRequest);
    let ortbRequest = request.data;
    expect(ortbRequest).to.not.equal(null);
    expect(ortbRequest.site).to.not.equal(null);
    expect(ortbRequest.site).to.deep.equal({
      content: {
        data: [{
          name: 'www.iris.com',
          ext: {
            segtax: 500,
            cids: ['iris_c73g5jq96mwso4d8']
          }
        }]
      },
      page: 'http://pub.com/news',
      ref: 'http://google.com',
      publisher: {
        domain: 'pub.com'
      }
    });
  });

  it('Verify impression/slot level first party data', function () {
    const bidderRequests = [{
      placementCode: '/DfpAccount1/slot1',
      mediaTypes: {
        banner: {
          sizes: [[1, 1]]
        }
      },
      bidId: 'bid12345',
      params: {
        adzoneid: '77',
        extra_key1: 'extra_val1',
        extra_key2: 12345
      },
      ortb2Imp: {
        ext: {
          data: {
            pbadslot: 'homepage-top-rect',
            adUnitSpecificAttribute: '123'
          }
        }
      }
    }];
    let request = spec.buildRequests(bidderRequests, bidderRequest);
    let ortbRequest = request.data;
    expect(ortbRequest).to.not.equal(null);
    expect(ortbRequest.imp).to.not.equal(null);
    expect(ortbRequest.imp).to.have.lengthOf(1);
    expect(ortbRequest.imp[0].ext).to.not.equal(null);
    expect(ortbRequest.imp[0].ext).to.deep.equal({
      prebid: {
        adzoneid: '77',
        extra_key1: 'extra_val1',
        extra_key2: 12345
      },
      data: {
        pbadslot: 'homepage-top-rect',
        adUnitSpecificAttribute: '123'
      }
    });
  });

  it('Verify bid request timeouts', function () {
    const mkRequest = (bidderRequest) => spec.buildRequests(slotConfigs, bidderRequest).data;
    // assert default is used when no bidderRequest.timeout value is available
    expect(mkRequest(bidderRequest).tmax).to.equal(500)

    // assert bidderRequest value is used when available
    expect(mkRequest(Object.assign({}, { timeout: 6000 }, bidderRequest)).tmax).to.equal(6000)
  });
});
