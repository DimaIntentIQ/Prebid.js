import { expect } from "chai";
import iiqAnalyticsAnalyticsAdapter, {
  REPORTER_ID,
  preparePayload,
} from "modules/intentIqAnalyticsAdapter.js";
import * as utils from "src/utils.js";
import { server } from "test/mocks/xhr.js";
import { EVENTS } from "src/constants.js";
import * as events from "src/events.js";
import { getGlobal } from "../../../src/prebidGlobal.js";
import sinon from "sinon";
import {
  PREBID,
  VERSION,
  WITHOUT_IIQ,
} from "../../../libraries/intentIqConstants/intentIqConstants.js";
import {
  getCurrentUrl,
  appendVrrefAndFui,
} from "../../../libraries/intentIqUtils/getRefferer.js";
import {
  gppDataHandler,
  uspDataHandler,
  gdprDataHandler,
} from "../../../src/consentHandler.js";

const partner = 10;
const identityName = `iiq_identity_${partner}`;
const defaultIdentityObject = {
  firstPartyData: {
    pcid: "f961ffb1-a0e1-4696-a9d2-a21d815bd344",
    pcidDate: 1762527405808,
    uspString: "undefined",
    gppString: "undefined",
    gdprString: "",
    date: Date.now(),
    sCal: Date.now() - 36000,
    isOptedOut: false,
    pid: "profile",
    dbsaved: "true"
  },
  partnerData: {
    abTestUuid: "abTestUuid",
    adserverDeviceType: 1,
    clientType: 2,
    cttl: 43200000,
    date: Date.now(),
    profile: "profile",
    wsrvcll: true,
  },
  clientHints: JSON.stringify({
    0: '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    1: "?0",
    2: '"macOS"',
    3: '"arm"',
    4: '"64"',
    6: '"15.6.1"',
    7: "?0",
    8: '"Chromium";v="142.0.7444.60", "Google Chrome";v="142.0.7444.60", "Not_A Brand";v="99.0.0.0"',
  }),
};
const version = VERSION;
const REPORT_ENDPOINT = "https://reports.intentiq.com/report";

const randomVal = () => Math.floor(Math.random() * 100000) + 1;

const getDefaultConfig = () => {
  return {
    partner,
  };
};

const getWonRequest = () => ({
  bidderCode: "pubmatic",
  width: 728,
  height: 90,
  adId: "23caeb34c55da51",
  requestId: "87615b45ca4973",
  transactionId: "5e69fd76-8c86-496a-85ce-41ae55787a50",
  auctionId: "0cbd3a43-ff45-47b8-b002-16d3946b23bf-" + randomVal(),
  mediaType: "banner",
  source: "client",
  cpm: 5,
  currency: "USD",
  ttl: 300,
  referrer: "",
  adapterCode: "pubmatic",
  originalCpm: 5,
  originalCurrency: "USD",
  responseTimestamp: 1669644710345,
  requestTimestamp: 1669644710109,
  bidder: "testbidder",
  timeToRespond: 236,
  pbLg: "5.00",
  pbMg: "5.00",
  pbHg: "5.00",
  pbAg: "5.00",
  pbDg: "5.00",
  pbCg: "",
  size: "728x90",
  status: "rendered",
});

const enableAnalyticWithSpecialOptions = (receivedOptions) => {
  iiqAnalyticsAnalyticsAdapter.disableAnalytics();
  iiqAnalyticsAnalyticsAdapter.enableAnalytics({
    provider: "iiqAnalytics",
    options: {
      ...getDefaultConfig(),
      ...receivedOptions
    },
  });
};

const reportWin = (data) => window[`intentIqAnalyticsAdapter_${partner}`].reportExternalWin(data);

describe("IntentIQ tests all", function () {
  let logErrorStub;
  let getWindowSelfStub;
  let getWindowTopStub;
  let getWindowLocationStub;

  beforeEach(function () {
    logErrorStub = sinon.stub(utils, "logError");
    sinon.stub(events, "getEvents").returns([]);

    iiqAnalyticsAnalyticsAdapter.enableAnalytics({
      provider: "iiqAnalytics",
      options: getDefaultConfig()
    });
    if (iiqAnalyticsAnalyticsAdapter.track.restore) {
      iiqAnalyticsAnalyticsAdapter.track.restore();
    }
    sinon.spy(iiqAnalyticsAnalyticsAdapter, "track");
    window[identityName] = utils.deepClone(defaultIdentityObject);
  });

  afterEach(function () {
    logErrorStub.restore();
    if (getWindowSelfStub) getWindowSelfStub.restore();
    if (getWindowTopStub) getWindowTopStub.restore();
    if (getWindowLocationStub) getWindowLocationStub.restore();
    events.getEvents.restore();
    iiqAnalyticsAnalyticsAdapter.disableAnalytics();
    if (iiqAnalyticsAnalyticsAdapter.track.restore) {
      iiqAnalyticsAnalyticsAdapter.track.restore();
    }
    localStorage.clear();
    server.reset();
    delete window[identityName];
  });

  it("should not send any request on BID_WON event (reporting is manual-only)", function () {
    events.emit(EVENTS.BID_WON, getWonRequest());
    expect(server.requests.length).to.equal(0);
  });

  it("should send GET request with payload in query string when reporting a win", function () {
    const wonRequest = getWonRequest();

    reportWin(wonRequest);

    const request = server.requests[0];

    expect(request.method).to.equal("GET");

    const url = new URL(request.url);
    const payloadEncoded = url.searchParams.get("payload");
    const decoded = JSON.parse(atob(JSON.parse(payloadEncoded)[0]));

    const expected = preparePayload(wonRequest);

    expect(decoded.partnerId).to.equal(expected.partnerId);
    expect(decoded.adType).to.equal(expected.adType);
    expect(decoded.prebidAuctionId).to.equal(expected.prebidAuctionId);
  });

  it("IIQ Analytical Adapter bid win report", function () {
    getWindowLocationStub = sinon
      .stub(utils, "getWindowLocation")
      .returns({ href: "http://localhost:9876" });
    const expectedVrref = getWindowLocationStub().href;
    reportWin(getWonRequest());

    expect(server.requests.length).to.be.above(0);
    const request = server.requests[0];
    const parsedUrl = new URL(request.url);
    const vrref = parsedUrl.searchParams.get("vrref");
    expect(request.url).to.contain(
      REPORT_ENDPOINT + "?pid=" + partner + "&mct=1"
    );
    expect(request.url).to.contain(`&jsver=${version}`);
    expect(`&vrref=${decodeURIComponent(vrref)}`).to.contain(
      `&vrref=${expectedVrref}`
    );
    expect(request.url).to.contain("&payload=");
    expect(request.url).to.contain(
      "iiqid=f961ffb1-a0e1-4696-a9d2-a21d815bd344"
    );
  });

  it("should include adType in payload when reporting a win", function () {
    getWindowLocationStub = sinon
      .stub(utils, "getWindowLocation")
      .returns({ href: "http://localhost:9876/" });
    const bidWonEvent = { ...getWonRequest(), mediaType: "video" };

    reportWin(bidWonEvent);

    const request = server.requests[0];
    const urlParams = new URL(request.url);
    const payloadEncoded = urlParams.searchParams.get("payload");
    const payloadDecoded = JSON.parse(atob(JSON.parse(payloadEncoded)[0]));

    expect(server.requests.length).to.be.above(0);
    expect(payloadDecoded).to.have.property("adType", bidWonEvent.mediaType);
  });

  it("should get pos from pbjs.adUnits when there is no pos on the win event", function () {
    const pbjs = getGlobal();
    const prevAdUnits = pbjs.adUnits;

    pbjs.adUnits = Array.isArray(pbjs.adUnits) ? pbjs.adUnits : [];
    pbjs.adUnits.push({ code: "myVideoAdUnit", mediaTypes: { video: { pos: 777 } } });

    reportWin({
      ...getWonRequest(),
      adUnitCode: "myVideoAdUnit",
      mediaType: "video"
    });

    const request = server.requests[0];
    const payloadEncoded = new URL(request.url).searchParams.get("payload");
    const payloadDecoded = JSON.parse(atob(JSON.parse(payloadEncoded)[0]));

    expect(payloadDecoded.pos).to.equal(777);

    pbjs.adUnits = prevAdUnits;
  });

  it("should get pos from reportExternalWin when present", function () {
    const winPos = 999;

    reportWin({
      adUnitCode: "myVideoAdUnit",
      bidderCode: "appnexus",
      cpm: 1.5,
      currency: "USD",
      mediaType: "video",
      size: "300x250",
      status: "rendered",
      auctionId: "auc123",
      pos: winPos
    });

    const request = server.requests[0];
    const payloadEncoded = new URL(request.url).searchParams.get("payload");
    const payloadDecoded = JSON.parse(atob(JSON.parse(payloadEncoded)[0]));

    expect(payloadDecoded.pos).to.equal(winPos);
  });

  it("should report a win with default group configuration", function () {
    const spdData = "server provided data";
    const expectedSpdEncoded = encodeURIComponent(spdData);
    window[identityName].partnerData.spd = spdData;
    const wonRequest = getWonRequest();

    reportWin(wonRequest);

    expect(server.requests.length).to.be.above(0);
    const request = server.requests[0];
    const dataToSend = preparePayload(wonRequest);
    const base64String = btoa(JSON.stringify(dataToSend));
    const payload = encodeURIComponent(JSON.stringify([base64String]));
    const expectedUrl = appendVrrefAndFui(
      REPORT_ENDPOINT +
      `?pid=${partner}&mct=1&iiqid=${defaultIdentityObject.firstPartyData.pcid}&agid=${REPORTER_ID}&jsver=${version}&source=pbjs&uh=${encodeURIComponent(window[identityName].clientHints)}&gdpr=0&spd=${expectedSpdEncoded}`
    );
    const urlWithPayload = expectedUrl + `&payload=${payload}`;

    expect(request.url).to.equal(urlWithPayload);
    expect(dataToSend.pcid).to.equal(defaultIdentityObject.firstPartyData.pcid);
  });

  it("should send CMP data in report if available", function () {
    const uspData = "1NYN";
    const gppData = { gppString: '{"key1":"value1","key2":"value2"}' };
    const gdprData = { consentString: "gdprConsent" };

    const gppStub = sinon
      .stub(gppDataHandler, "getConsentData")
      .returns(gppData);
    const uspStub = sinon
      .stub(uspDataHandler, "getConsentData")
      .returns(uspData);
    const gdprStub = sinon
      .stub(gdprDataHandler, "getConsentData")
      .returns(gdprData);

    getWindowLocationStub = sinon
      .stub(utils, "getWindowLocation")
      .returns({ href: "http://localhost:9876/" });

    reportWin(getWonRequest());

    expect(server.requests.length).to.be.above(0);
    const request = server.requests[0];

    expect(request.url).to.contain(
      `&us_privacy=${encodeURIComponent(uspData)}`
    );
    expect(request.url).to.contain(
      `&gpp=${encodeURIComponent(gppData.gppString)}`
    );
    expect(request.url).to.contain(
      `&gdpr_consent=${encodeURIComponent(gdprData.consentString)}`
    );
    expect(request.url).to.contain(`&gdpr=1`);
    gppStub.restore();
    uspStub.restore();
    gdprStub.restore();
  });

  it("should include tcfv (TCF API version) in report when TCF CMP is detected", function () {
    const uspData = "1NYN";
    const gppData = { gppString: '{"k":"v"}' };
    const gdprData = { consentString: "gdprConsent", apiVersion: 2, gdprApplies: true };

    const gppStub = sinon.stub(gppDataHandler, "getConsentData").returns(gppData);
    const uspStub = sinon.stub(uspDataHandler, "getConsentData").returns(uspData);
    const gdprStub = sinon.stub(gdprDataHandler, "getConsentData").returns(gdprData);

    getWindowLocationStub = sinon
      .stub(utils, "getWindowLocation")
      .returns({ href: "http://localhost:9876/" });

    reportWin(getWonRequest());

    expect(server.requests.length).to.be.above(0);
    const request = server.requests[0];
    expect(request.url).to.contain(`&gdpr_consent=${encodeURIComponent(gdprData.consentString)}`);
    expect(request.url).to.contain(`&gdpr=1`);
    expect(request.url).to.contain(`&tcfv=2`);

    gppStub.restore();
    uspStub.restore();
    gdprStub.restore();
  });

  it("should handle initialization values from local storage", function () {
    window[identityName].actualABGroup = WITHOUT_IIQ;

    reportWin(getWonRequest());
    expect(iiqAnalyticsAnalyticsAdapter.initOptions.currentGroup).to.equal(
      WITHOUT_IIQ
    );
    expect(iiqAnalyticsAnalyticsAdapter.initOptions.fpid).to.be.not.null;
  });

  it("should always report an external win regardless of any manualWinReportEnabled config", function () {
    expect(
      window[`intentIqAnalyticsAdapter_${partner}`].reportExternalWin
    ).to.be.a("function");
    const result = reportWin({
      cpm: 1,
      currency: "USD",
    });
    expect(result).to.equal(true);
    expect(server.requests.length).to.be.above(0);
  });

  it("should return window.location.href when window.self === window.top", function () {
    // Stub helper functions
    getWindowSelfStub = sinon.stub(utils, "getWindowSelf").returns(window);
    getWindowTopStub = sinon.stub(utils, "getWindowTop").returns(window);
    getWindowLocationStub = sinon
      .stub(utils, "getWindowLocation")
      .returns({ href: "http://localhost:9876/" });

    const referrer = getCurrentUrl();
    expect(referrer).to.equal("http://localhost:9876/");
  });

  it("should return window.top.location.href when window.self !== window.top and access is successful", function () {
    // Stub helper functions to simulate iframe
    getWindowSelfStub = sinon.stub(utils, "getWindowSelf").returns({});
    getWindowTopStub = sinon
      .stub(utils, "getWindowTop")
      .returns({ location: { href: "http://example.com/" } });

    const referrer = getCurrentUrl();

    expect(referrer).to.equal("http://example.com/");
  });

  it("should return an empty string and log an error when accessing window.top.location.href throws an error", function () {
    // Stub helper functions to simulate error
    getWindowSelfStub = sinon.stub(utils, "getWindowSelf").returns({});
    getWindowTopStub = sinon
      .stub(utils, "getWindowTop")
      .throws(new Error("Access denied"));

    const referrer = getCurrentUrl();
    expect(referrer).to.equal("");
    expect(logErrorStub.calledOnce).to.be.true;
    expect(logErrorStub.firstCall.args[0]).to.contain(
      "Error accessing location: Error: Access denied"
    );
  });

  it("should include source parameter in report URL", function () {
    reportWin(getWonRequest());
    const request = server.requests[0];

    expect(server.requests.length).to.be.above(0);
    expect(request.url).to.include(`&source=${PREBID}`);
  });

  it("should include spd parameter from LS in report URL", function () {
    const spdObject = { foo: "bar", value: 42 };
    const expectedSpdEncoded = encodeURIComponent(JSON.stringify(spdObject));
    window[identityName].firstPartyData.spd =
      JSON.stringify(spdObject);
    window[identityName].partnerData.spd = spdObject;

    getWindowLocationStub = sinon
      .stub(utils, "getWindowLocation")
      .returns({ href: "http://localhost:9876/" });

    reportWin(getWonRequest());

    const request = server.requests[0];

    expect(server.requests.length).to.be.above(0);
    expect(request.url).to.include(`&spd=${expectedSpdEncoded}`);
  });

  it("should include spd parameter string from LS in report URL", function () {
    const spdData = "server provided data";
    const expectedSpdEncoded = encodeURIComponent(spdData);
    window[identityName].partnerData.spd = spdData;

    getWindowLocationStub = sinon
      .stub(utils, "getWindowLocation")
      .returns({ href: "http://localhost:9876/" });

    reportWin(getWonRequest());

    const request = server.requests[0];

    expect(server.requests.length).to.be.above(0);
    expect(request.url).to.include(`&spd=${expectedSpdEncoded}`);
  });

  const testCasesVrref = [
    {
      description: "domainName matches window.top.location.href",
      getWindowSelf: {},
      getWindowTop: { location: { href: "http://example.com/page" } },
      getWindowLocation: { href: "http://example.com/page" },
      domainName: "example.com",
      expectedVrref: encodeURIComponent("http://example.com/page"),
      shouldContainFui: false,
    },
    {
      description: "domainName does not match window.top.location.href",
      getWindowSelf: {},
      getWindowTop: { location: { href: "http://anotherdomain.com/page" } },
      getWindowLocation: { href: "http://anotherdomain.com/page" },
      domainName: "example.com",
      expectedVrref: encodeURIComponent("example.com"),
      shouldContainFui: false,
    },
    {
      description: "domainName is missing, only fui=1 is returned",
      getWindowSelf: {},
      getWindowTop: { location: { href: "" } },
      getWindowLocation: { href: "" },
      domainName: null,
      expectedVrref: "",
      shouldContainFui: true,
    },
    {
      description: "domainName is missing",
      getWindowSelf: {},
      getWindowTop: { location: { href: "http://example.com/page" } },
      getWindowLocation: { href: "http://example.com/page" },
      domainName: null,
      expectedVrref: encodeURIComponent("http://example.com/page"),
      shouldContainFui: false,
    },
  ];

  testCasesVrref.forEach(
    ({
      description,
      getWindowSelf,
      getWindowTop,
      getWindowLocation,
      domainName,
      expectedVrref,
      shouldContainFui,
    }) => {
      it(`should append correct vrref when ${description}`, function () {
        getWindowSelfStub = sinon
          .stub(utils, "getWindowSelf")
          .returns(getWindowSelf);
        getWindowTopStub = sinon
          .stub(utils, "getWindowTop")
          .returns(getWindowTop);
        getWindowLocationStub = sinon
          .stub(utils, "getWindowLocation")
          .returns(getWindowLocation);

        const url = "https://reports.intentiq.com/report?pid=10";
        const modifiedUrl = appendVrrefAndFui(url, domainName);
        const urlObj = new URL(modifiedUrl);

        const vrref = encodeURIComponent(
          urlObj.searchParams.get("vrref") || ""
        );
        const fui = urlObj.searchParams.get("fui");

        expect(vrref).to.equal(expectedVrref);
        expect(urlObj.searchParams.has("fui")).to.equal(shouldContainFui);
        if (shouldContainFui) {
          expect(fui).to.equal("1");
        }
      });
    }
  );

  const placementIdTests = [
    {
      description: "should extract adUnitCode when present",
      event: { adUnitCode: "adUnitCode-123", placementId: "placementId-456" },
      expectedPlacementId: "adUnitCode-123",
    },
    {
      description: "should fall back to placementId when there is no adUnitCode",
      event: { placementId: "placementId-456" },
      expectedPlacementId: "placementId-456",
    },
    {
      description:
        "should return empty placementId if neither adUnitCode nor placementId exist",
      event: {},
      expectedPlacementId: "",
    },
    {
      description:
        "should extract placementId from nested params array if no top-level adUnitCode or placementId exist",
      event: {
        params: [{ someKey: "value" }, { placementId: "nested-placementId" }],
      },
      expectedPlacementId: "nested-placementId",
    },
  ];

  placementIdTests.forEach(({ description, event, expectedPlacementId }) => {
    it(description, function () {
      const testEvent = { ...getWonRequest(), ...event };
      reportWin(testEvent);

      const request = server.requests[0];
      const urlParams = new URL(request.url);
      const encodedPayload = urlParams.searchParams.get("payload");
      const decodedPayload = JSON.parse(atob(JSON.parse(encodedPayload)[0]));

      expect(server.requests.length).to.be.above(0);
      expect(decodedPayload).to.have.property(
        "placementId",
        expectedPlacementId
      );
    });
  });

  it("should always include ABTestingConfigurationSource as 'group' in payload", function () {
    reportWin(getWonRequest());

    const request = server.requests[0];
    const urlParams = new URL(request.url);
    const encodedPayload = urlParams.searchParams.get("payload");
    const decodedPayload = JSON.parse(atob(JSON.parse(encodedPayload)[0]));

    expect(server.requests.length).to.be.above(0);
    expect(decodedPayload).to.have.property(
      "ABTestingConfigurationSource",
      "group"
    );
  });

  it("should use group provided by partner options in the payload", function () {
    const providedGroup = WITHOUT_IIQ;
    // Ensure actualABGroup is not set so group from options is used
    delete window[identityName].actualABGroup;

    enableAnalyticWithSpecialOptions({
      group: providedGroup,
    });

    reportWin(getWonRequest());

    const request = server.requests[0];
    const urlParams = new URL(request.url);
    const encodedPayload = urlParams.searchParams.get("payload");
    const decodedPayload = JSON.parse(atob(JSON.parse(encodedPayload)[0]));

    expect(server.requests.length).to.be.above(0);
    // Verify that the group from options is used in the payload
    expect(decodedPayload).to.have.property("abGroup", providedGroup);
  });

  it("should include partnerAuctionId in query params and payload if provided by partner", function () {
    const partnerAuctionId = "TEST-PAUCID-123";

    reportWin({
      cpm: 1,
      currency: "USD",
      adType: "banner",
      partnerAuctionId
    });

    const request = server.requests[0];
    const url = new URL(request.url);
    const paucidParam = url.searchParams.get("paucid");
    const payloadEncoded = url.searchParams.get("payload");
    const payloadDecoded = JSON.parse(
      atob(JSON.parse(payloadEncoded)[0])
    );

    expect(payloadEncoded).to.be.a('string');
    expect(JSON.parse(paucidParam)).to.deep.equal([partnerAuctionId]);
    expect(payloadDecoded.partnerAuctionId).to.equal(partnerAuctionId);
  });

  describe('constructFullUrl CMP isValidValue filtering', function () {
    let gppStub, uspStub, gdprStub;

    afterEach(function () {
      if (gppStub) gppStub.restore();
      if (uspStub) uspStub.restore();
      if (gdprStub) gdprStub.restore();
    });

    it('should not include us_privacy when uspString is null', function () {
      uspStub = sinon.stub(uspDataHandler, 'getConsentData').returns(null);
      gppStub = sinon.stub(gppDataHandler, 'getConsentData').returns(null);
      gdprStub = sinon.stub(gdprDataHandler, 'getConsentData').returns(null);

      reportWin(getWonRequest());

      expect(server.requests[0].url).to.not.include('us_privacy');
    });

    it('should not include us_privacy when uspString is the string "undefined"', function () {
      uspStub = sinon.stub(uspDataHandler, 'getConsentData').returns('undefined');
      gppStub = sinon.stub(gppDataHandler, 'getConsentData').returns(null);
      gdprStub = sinon.stub(gdprDataHandler, 'getConsentData').returns(null);

      reportWin(getWonRequest());

      expect(server.requests[0].url).to.not.include('us_privacy');
    });

    it('should not include gpp when gppString is null', function () {
      uspStub = sinon.stub(uspDataHandler, 'getConsentData').returns(null);
      gppStub = sinon.stub(gppDataHandler, 'getConsentData').returns(null);
      gdprStub = sinon.stub(gdprDataHandler, 'getConsentData').returns(null);

      reportWin(getWonRequest());

      expect(server.requests[0].url).to.not.include('&gpp=');
    });

    it('should not include gdpr_consent when gdprString is null', function () {
      uspStub = sinon.stub(uspDataHandler, 'getConsentData').returns(null);
      gppStub = sinon.stub(gppDataHandler, 'getConsentData').returns(null);
      gdprStub = sinon.stub(gdprDataHandler, 'getConsentData').returns(null);

      reportWin(getWonRequest());

      expect(server.requests[0].url).to.not.include('gdpr_consent');
    });

    it('should not include gdpr_consent when gdprString is the string "undefined"', function () {
      uspStub = sinon.stub(uspDataHandler, 'getConsentData').returns(null);
      gppStub = sinon.stub(gppDataHandler, 'getConsentData').returns(null);
      gdprStub = sinon.stub(gdprDataHandler, 'getConsentData').returns({ consentString: 'undefined', gdprApplies: false });

      reportWin(getWonRequest());

      expect(server.requests[0].url).to.not.include('gdpr_consent');
    });

    it('should include gdpr_consent and gdpr=1 when gdprString is valid', function () {
      const consentString = 'validConsent';
      uspStub = sinon.stub(uspDataHandler, 'getConsentData').returns(null);
      gppStub = sinon.stub(gppDataHandler, 'getConsentData').returns(null);
      gdprStub = sinon.stub(gdprDataHandler, 'getConsentData').returns({ consentString, gdprApplies: true });

      reportWin(getWonRequest());

      expect(server.requests[0].url).to.include(`gdpr_consent=${encodeURIComponent(consentString)}`);
      expect(server.requests[0].url).to.include('gdpr=1');
    });
  });
});
