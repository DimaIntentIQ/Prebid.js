import { logInfo, logError } from '../src/utils.js';
import adapter from '../libraries/analyticsAdapter/AnalyticsAdapter.js';
import adapterManager from '../src/adapterManager.js';
import { ajax } from '../src/ajax.js';
import { getStorageManager } from '../src/storageManager.js';
import { config } from '../src/config.js';
import { EVENTS } from '../src/constants.js';
import { MODULE_TYPE_ANALYTICS } from '../src/activities/modules.js';

const MODULE_NAME = 'iiqAnalytics'
const analyticsType = 'endpoint';
const defaultUrl = 'https://reports.intentiq.com/report';
const storage = getStorageManager({ moduleType: MODULE_TYPE_ANALYTICS, moduleName: MODULE_NAME });
const prebidVersion = '$prebid.version$';
export const REPORTER_ID = Date.now() + '_' + getRandom(0, 1000);

const FIRST_PARTY_KEY = '_iiq_fdata';
const FIRST_PARTY_DATA_KEY = '_iiq_fdata';
const JSVERSION = 0.1

const PARAMS_NAMES = {
  abTestGroup: 'abGroup',
  pbPauseUntil: 'pbPauseUntil',
  pbMonitoringEnabled: 'pbMonitoringEnabled',
  isInTestGroup: 'isInTestGroup',
  enhanceRequests: 'enhanceRequests',
  wasSubscribedForPrebid: 'wasSubscribedForPrebid',
  hadEids: 'hadEids',
  ABTestingConfigurationSource: 'ABTestingConfigurationSource',
  lateConfiguration: 'lateConfiguration',
  jsversion: 'jsversion',
  eidsNames: 'eidsNames',
  requestRtt: 'rtt',
  clientType: 'clientType',
  adserverDeviceType: 'AdserverDeviceType',
  terminationCause: 'terminationCause',
  callCount: 'callCount',
  manualCallCount: 'mcc',
  pubprovidedidsFailedToregister: 'ppcc',
  noDataCount: 'noDataCount',
  profile: 'profile',
  isProfileDeterministic: 'pidDeterministic',
  siteId: 'sid',
  hadEidsInLocalStorage: 'idls',
  auctionStartTime: 'ast',
  eidsReadTime: 'eidt',
  agentId: 'aid',
  auctionEidsLength: 'aeidln',
  wasServerCalled: 'wsrvcll',
  referrer: 'vrref',
  isInBrowserBlacklist: 'inbbl',
  prebidVersion: 'pbjsver',
  partnerId: 'partnerId'
};

let iiqAnalyticsAnalyticsAdapter = Object.assign(adapter({ defaultUrl, analyticsType }), {
  initOptions: {
    lsValueInitialized: false,
    partner: null,
    fpid: null,
    currentGroup: null,
    dataInLs: null,
    eidl: null,
    lsIdsInitialized: false,
    manualReport: false
  },
  track({ eventType, args }) {
    switch (eventType) {
      case BID_WON:
        bidWon(args);
        break;
      default:
        break;
    }
  }
});

// Events needed
const {
  BID_WON
} = EVENTS;

function readData(key) {
  try {
    if (storage.hasLocalStorage()) {
      return storage.getDataFromLocalStorage(key);
    }
    if (storage.cookiesAreEnabled()) {
      return storage.getCookie(key);
    }
  } catch (error) {
    logError(error);
  }
}

function initLsValues() {
  if (iiqAnalyticsAnalyticsAdapter.initOptions.lsValueInitialized) return;
  iiqAnalyticsAnalyticsAdapter.initOptions.fpid = JSON.parse(readData(FIRST_PARTY_KEY));
  let iiqArr = config.getConfig('userSync.userIds').filter(m => m.name == 'intentIqId');
  if (iiqArr && iiqArr.length > 0) iiqAnalyticsAnalyticsAdapter.initOptions.lsValueInitialized = true;
  if (!iiqArr) iiqArr = [];
  if (iiqArr.length == 0) {
    iiqArr.push({
      'params': {
        'partner': -1,
        'group': 'U'
      }
    })
  }
  if (iiqArr && iiqArr.length > 0) {
    if (iiqArr[0].params && iiqArr[0].params.partner && !isNaN(iiqArr[0].params.partner)) {
      iiqAnalyticsAnalyticsAdapter.initOptions.partner = iiqArr[0].params.partner;
      iiqAnalyticsAnalyticsAdapter.initOptions.currentGroup = iiqAnalyticsAnalyticsAdapter.initOptions.fpid.group;
    }

    iiqAnalyticsAnalyticsAdapter.initOptions.browserBlackList = typeof iiqArr[0].params.browserBlackList === 'string' ? iiqArr[0].params.browserBlackList.toLowerCase() : '';
  }
}

function initReadLsIds() {
  if (isNaN(iiqAnalyticsAnalyticsAdapter.initOptions.partner) || iiqAnalyticsAnalyticsAdapter.initOptions.partner == -1) return;
  try {
    iiqAnalyticsAnalyticsAdapter.initOptions.dataInLs = null;
    let iData = readData(FIRST_PARTY_DATA_KEY + '_' + iiqAnalyticsAnalyticsAdapter.initOptions.partner)
    if (iData) {
      iiqAnalyticsAnalyticsAdapter.initOptions.lsIdsInitialized = true;
      let pData = JSON.parse(iData);
      iiqAnalyticsAnalyticsAdapter.initOptions.dataInLs = pData.data;
      iiqAnalyticsAnalyticsAdapter.initOptions.eidl = pData.eidl || -1;
    }
  } catch (e) {
    logError(e)
  }
}

function bidWon(args) {
  if (!iiqAnalyticsAnalyticsAdapter.initOptions.lsValueInitialized) { initLsValues(); }

  const currentBrowserLowerCase = detectBrowser();
  if (iiqAnalyticsAnalyticsAdapter.initOptions.browserBlackList?.includes(currentBrowserLowerCase)) {
    logError('IIQ ANALYTICS -> Browser is in blacklist!');
    return;
  }

  if (iiqAnalyticsAnalyticsAdapter.initOptions.lsValueInitialized && !iiqAnalyticsAnalyticsAdapter.initOptions.lsIdsInitialized) { initReadLsIds(); }
  if (!iiqAnalyticsAnalyticsAdapter.initOptions.manualReport) {
    ajax(constructFullUrl(preparePayload(args, true)), undefined, null, { method: 'GET' });
  }

  logInfo('IIQ ANALYTICS -> BID WON')
}

function getRandom(start, end) {
  return Math.floor((Math.random() * (end - start + 1)) + start);
}

export function preparePayload(data) {
  let result = getDefaultDataObject();

  result[PARAMS_NAMES.partnerId] = iiqAnalyticsAnalyticsAdapter.initOptions.partner;
  result[PARAMS_NAMES.prebidVersion] = prebidVersion;
  result[PARAMS_NAMES.referrer] = getReferrer();

  result[PARAMS_NAMES.abTestGroup] = iiqAnalyticsAnalyticsAdapter.initOptions.currentGroup;

  result[PARAMS_NAMES.isInTestGroup] = iiqAnalyticsAnalyticsAdapter.initOptions.currentGroup == 'A';

  result[PARAMS_NAMES.agentId] = REPORTER_ID;

  fillPrebidEventData(data, result);

  fillEidsData(result);

  return result;
}

function fillEidsData(result) {
  if (iiqAnalyticsAnalyticsAdapter.initOptions.lsIdsInitialized) {
    result[PARAMS_NAMES.hadEidsInLocalStorage] = iiqAnalyticsAnalyticsAdapter.initOptions.eidl && iiqAnalyticsAnalyticsAdapter.initOptions.eidl > 0;
    result[PARAMS_NAMES.auctionEidsLength] = iiqAnalyticsAnalyticsAdapter.initOptions.eidl || -1;
  }
}

function fillPrebidEventData(eventData, result) {
  if (eventData.bidderCode) { result.bidderCode = eventData.bidderCode; }
  if (eventData.cpm) { result.cpm = eventData.cpm; }
  if (eventData.currency) { result.currency = eventData.currency; }
  if (eventData.originalCpm) { result.originalCpm = eventData.originalCpm; }
  if (eventData.originalCurrency) { result.originalCurrency = eventData.originalCurrency; }
  if (eventData.status) { result.status = eventData.status; }
  if (eventData.auctionId) { result.prebidAuctionId = eventData.auctionId; }

  result.biddingPlatformId = 1;
  result.partnerAuctionId = 'BW';
}

function getDefaultDataObject() {
  return {
    'inbbl': false,
    'pbjsver': prebidVersion,
    'partnerAuctionId': 'BW',
    'reportSource': 'pbjs',
    'abGroup': 'U',
    'jsversion': JSVERSION,
    'partnerId': -1,
    'biddingPlatformId': 1,
    'idls': false,
    'ast': -1,
    'aeidln': -1
  }
}

function constructFullUrl(data) {
  let report = []
  data = btoa(JSON.stringify(data))
  report.push(data)
  return defaultUrl + '?pid=' + iiqAnalyticsAnalyticsAdapter.initOptions.partner +
    '&mct=1' +
    ((iiqAnalyticsAnalyticsAdapter.initOptions && iiqAnalyticsAnalyticsAdapter.initOptions.fpid)
      ? '&iiqid=' + encodeURIComponent(iiqAnalyticsAnalyticsAdapter.initOptions.fpid.pcid) : '') +
    '&agid=' + REPORTER_ID +
    '&jsver=' + JSVERSION +
    '&vrref=' + getReferrer() +
    '&source=pbjs' +
    '&payload=' + JSON.stringify(report)
}

export function getReferrer() {
  return document.referrer;
}

iiqAnalyticsAnalyticsAdapter.originEnableAnalytics = iiqAnalyticsAnalyticsAdapter.enableAnalytics;

iiqAnalyticsAnalyticsAdapter.enableAnalytics = function (myConfig) {
  iiqAnalyticsAnalyticsAdapter.originEnableAnalytics(myConfig); // call the base class function
};

/**
 * Detects the browser using either userAgent or userAgentData
 * @return {string} The name of the detected browser or 'unknown' if unable to detect
 */
function detectBrowser() {
  try {
    if (navigator.userAgent) {
      return detectBrowserFromUserAgent(navigator.userAgent);
    } else if (navigator.userAgentData) {
      return detectBrowserFromUserAgentData(navigator.userAgentData);
    }
  } catch (error) {
    logError('Error detecting browser:', error);
  }
  return 'unknown';
}

/**
 * Detects the browser from the user agent string
 * @param {string} userAgent - The user agent string from the browser
 * @return {string} The name of the detected browser or 'unknown' if unable to detect
 */
function detectBrowserFromUserAgent(userAgent) {
  const browserRegexPatterns = {
    opera: /Opera|OPR/,
    edge: /Edg/,
    chrome: /Chrome|CriOS/,
    safari: /Safari/,
    firefox: /Firefox/,
    ie: /MSIE|Trident/,
  };

  // Check for Chrome first to avoid confusion with Safari
  if (browserRegexPatterns.chrome.test(userAgent)) {
    return 'chrome';
  }

  // Now we can safely check for Safari
  if (browserRegexPatterns.safari.test(userAgent) && !browserRegexPatterns.chrome.test(userAgent)) {
    return 'safari';
  }

  // Check other browsers
  for (const browser in browserRegexPatterns) {
    if (browserRegexPatterns[browser].test(userAgent)) {
      return browser;
    }
  }

  return 'unknown';
}

/**
 * Detects the browser from the NavigatorUAData object
 * @param {NavigatorUAData} userAgentData - The user agent data object from the browser
 * @return {string} The name of the detected browser or 'unknown' if unable to detect
 */
function detectBrowserFromUserAgentData(userAgentData) {
  const brandNames = userAgentData.brands.map(brand => brand.brand);

  if (brandNames.includes('Microsoft Edge')) {
    return 'edge';
  } else if (brandNames.includes('Opera')) {
    return 'opera';
  } else if (brandNames.some(brand => brand === 'Chromium' || brand === 'Google Chrome')) {
    return 'chrome';
  }

  return 'unknown';
}

adapterManager.registerAnalyticsAdapter({
  adapter: iiqAnalyticsAnalyticsAdapter,
  code: MODULE_NAME
});

export default iiqAnalyticsAnalyticsAdapter;
