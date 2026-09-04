import { logError, logInfo } from '../src/utils.js';
import adapter from '../libraries/analyticsAdapter/AnalyticsAdapter.js';
import adapterManager from '../src/adapterManager.js';
import { ajax } from '../src/ajax.js';
import { appendSPData } from '../libraries/intentIqUtils/urlUtils.ts';
import { appendVrrefAndFui, getCurrentUrl } from '../libraries/intentIqUtils/getRefferer.ts';
import { getCmpData, isValidValue } from '../libraries/intentIqUtils/getCmpData.ts';
import { getUnitPosition } from '../libraries/intentIqUtils/getUnitPosition.ts';
import {
  VERSION,
  PREBID,
  WITH_IIQ,
  WITHOUT_IIQ
} from '../libraries/intentIqConstants/intentIqConstants.ts';
import { reportingServerAddress } from '../libraries/intentIqUtils/intentIqConfig.ts';
import { getGlobal } from '../src/prebidGlobal.js';

/**
 * Payload passed to `window.intentIqAnalyticsAdapter_<partnerId>.reportExternalWin()`.
 * Use this when Prebid is NOT the winning bidding platform (e.g. Amazon TAM, GAM).
 */
export interface IiqExternalWinData {
  /**
   * Platform that rendered this impression.
   * 1 = Prebid, 2 = Amazon, 3 = Google, 4 = Open RTB / local Prebid server.
   */
  biddingPlatformId: 1 | 2 | 3 | 4;

  /**
   * Unified auction identifier when running multiple auction solutions.
   */
  partnerAuctionId?: string;

  /**
   * Name of the bidder that won the auction as reported by the platform.
   */
  bidderCode: string;

  /**
   * Prebid auction ID. Leave undefined when Prebid is not the platform.
   */
  prebidAuctionId?: string;

  /**
   * CPM received from the demand-side auction, before any floor adjustments.
   */
  cpm: number;

  /**
   * ISO 4217 currency code for `cpm`, e.g. `'USD'`.
   */
  currency: string;

  /**
   * Pre-adjustment CPM. Leave undefined when Prebid is not the platform.
   */
  originalCpm?: number;

  /**
   * Currency of `originalCpm`. Leave undefined when Prebid is not the platform.
   */
  originalCurrency?: string;

  /**
   * Impression status. Leave undefined when Prebid is not the platform.
   */
  status?: string;

  /**
   * Unique identifier of the ad unit that showed this ad.
   */
  placementId?: string;

  /**
   * Type of ad served.
   */
  adType?: 'banner' | 'video' | 'native' | 'audio';
}

/**
 * Options passed to `pbjs.enableAnalytics({ provider: 'iiqAnalytics', options: { … } })`.
 */
export interface IntentIqAnalyticsAdapterOptions {
  /**
   * Partner ID assigned by IntentIQ. Required.
   */
  partner: number;

  /**
   * Explicit A/B group override. This build always assigns the A/B test
   * group directly from `group` (equivalent to a fixed
   * `ABTestingConfigurationSource: 'group'`), independent of the server
   * termination cause.
   */
  group?: 'A' | 'B';
}

declare module '../libraries/analyticsAdapter/AnalyticsAdapter' {
  interface AnalyticsProviderConfig {
    iiqAnalytics: {
      options: IntentIqAnalyticsAdapterOptions
    }
  }
}

const MODULE_NAME = 'iiqAnalytics' as const;
const analyticsType = 'endpoint' as const;
const prebidVersion = '$prebid.version$';
const pbjs: any = getGlobal();
export const REPORTER_ID = Date.now() + '_' + getRandom(0, 1000);
let globalName: string | undefined;
let identityGlobalName: string | undefined;
let iiqConfig: any;

const PARAMS_NAMES: Record<string, string> = {
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
  partnerId: 'partnerId',
  firstPartyId: 'pcid',
  placementId: 'placementId',
  adType: 'adType',
  abTestUuid: 'abTestUuid',
  abPercentage: 'abPercentage',
  userPercentage: 'userPercentage',
};

const DEFAULT_URL = 'https://reports.intentiq.com/report';

const getDefaultInitOptions = () => {
  return {
    adapterConfigInitialized: false,
    partner: null,
    fpid: null,
    currentGroup: null,
    dataInLs: null,
    eidl: null,
    dataIdsInitialized: false,
    abTestUuid: null
  };
};

const iiqAnalyticsAnalyticsAdapter: any = Object.assign(adapter({ url: DEFAULT_URL, analyticsType }), {
  initOptions: getDefaultInitOptions(),
  track() {
    // Intentional no-op: this build fixes manualWinReportEnabled to true, so BID_WON
    // reports are only sent via window.intentIqAnalyticsAdapter_<partnerId>.reportExternalWin().
    // Keeping this override in place prevents the base AnalyticsAdapter's default
    // endpoint auto-send behavior for every tracked event.
  }
});

function initAdapterConfig(config: any): void {
  if (iiqAnalyticsAnalyticsAdapter.initOptions.adapterConfigInitialized) return;

  const options = config?.options || {};
  iiqConfig = options;
  const { partner, group } = options;
  // ABTestingConfigurationSource is fixed to 'group' for this build: the group is
  // taken directly from `group`, independent of the server termination cause.
  iiqAnalyticsAnalyticsAdapter.initOptions.currentGroup =
    typeof group === 'string' && group.toUpperCase() === WITHOUT_IIQ ? WITHOUT_IIQ : WITH_IIQ;
  iiqAnalyticsAnalyticsAdapter.initOptions.idModuleConfigInitialized = true;
  if (!partner) {
    logError('IIQ ANALYTICS -> partner ID is missing');
    iiqAnalyticsAnalyticsAdapter.initOptions.partner = -1;
  } else iiqAnalyticsAnalyticsAdapter.initOptions.partner = partner;
  defineGlobalVariableName();
  iiqAnalyticsAnalyticsAdapter.initOptions.adapterConfigInitialized = true;
}

function receivePartnerData(): boolean | void {
  try {
    iiqAnalyticsAnalyticsAdapter.initOptions.dataInLs = null;
    const FPD = (window as any)[identityGlobalName as string]?.firstPartyData;
    if (!(window as any)[identityGlobalName as string] || !FPD) {
      return false;
    }
    iiqAnalyticsAnalyticsAdapter.initOptions.fpid = FPD;
    const { partnerData, clientHints = '', actualABGroup } = (window as any)[identityGlobalName as string];

    if (partnerData) {
      iiqAnalyticsAnalyticsAdapter.initOptions.dataIdsInitialized = true;
      iiqAnalyticsAnalyticsAdapter.initOptions.terminationCause = partnerData.terminationCause;
      iiqAnalyticsAnalyticsAdapter.initOptions.abTestUuid = partnerData.abTestUuid;
      iiqAnalyticsAnalyticsAdapter.initOptions.dataInLs = partnerData.data;
      iiqAnalyticsAnalyticsAdapter.initOptions.eidl = partnerData.eidl || -1;
      iiqAnalyticsAnalyticsAdapter.initOptions.clientType = partnerData.clientType || null;
      iiqAnalyticsAnalyticsAdapter.initOptions.siteId = partnerData.siteId || null;
      iiqAnalyticsAnalyticsAdapter.initOptions.wsrvcll = partnerData.wsrvcll || false;
      iiqAnalyticsAnalyticsAdapter.initOptions.rrtt = partnerData.rrtt || null;
    }

    if (actualABGroup) {
      iiqAnalyticsAnalyticsAdapter.initOptions.currentGroup = actualABGroup;
    }
    iiqAnalyticsAnalyticsAdapter.initOptions.clientHints = clientHints;
  } catch (e) {
    logError(e);
    return false;
  }
}

function bidWon(args: any): boolean | void {
  if (isNaN(iiqAnalyticsAnalyticsAdapter.initOptions.partner)) {
    iiqAnalyticsAnalyticsAdapter.initOptions.partner = -1;
  }
  const success = receivePartnerData();
  const preparedPayload = preparePayload(args);
  if (!preparedPayload) return false;
  if (success === false) {
    preparedPayload[PARAMS_NAMES.terminationCause] = -1;
  }
  const { url } = constructFullUrl(preparedPayload);
  ajax(url, undefined, null, { method: 'GET' });
  logInfo('IIQ ANALYTICS -> BID WON');
  return true;
}

function defineGlobalVariableName(): void {
  function reportExternalWin(args: any): boolean | void {
    return bidWon(args);
  }

  const partnerId = iiqConfig?.partner || 0;
  globalName = `intentIqAnalyticsAdapter_${partnerId}`;
  identityGlobalName = `iiq_identity_${partnerId}`;

  (window as any)[globalName as string] = { reportExternalWin };
}

function getRandom(start: number, end: number): number {
  return Math.floor(Math.random() * (end - start + 1) + start);
}

export function preparePayload(data: any): Record<string, any> | void {
  const result = getDefaultDataObject();
  const fullUrl = getCurrentUrl();
  result[PARAMS_NAMES.partnerId] = iiqAnalyticsAnalyticsAdapter.initOptions.partner;
  result[PARAMS_NAMES.prebidVersion] = prebidVersion;
  result[PARAMS_NAMES.referrer] = encodeURIComponent(fullUrl);
  result[PARAMS_NAMES.terminationCause] = iiqAnalyticsAnalyticsAdapter.initOptions.terminationCause;
  result[PARAMS_NAMES.clientType] = iiqAnalyticsAnalyticsAdapter.initOptions.clientType;
  result[PARAMS_NAMES.siteId] = iiqAnalyticsAnalyticsAdapter.initOptions.siteId;
  result[PARAMS_NAMES.wasServerCalled] = iiqAnalyticsAnalyticsAdapter.initOptions.wsrvcll;
  result[PARAMS_NAMES.requestRtt] = iiqAnalyticsAnalyticsAdapter.initOptions.rrtt;
  result[PARAMS_NAMES.isInTestGroup] = iiqAnalyticsAnalyticsAdapter.initOptions.currentGroup === WITH_IIQ;

  if (iiqAnalyticsAnalyticsAdapter.initOptions.currentGroup) {
    result[PARAMS_NAMES.abTestGroup] = iiqAnalyticsAnalyticsAdapter.initOptions.currentGroup;
  }
  result[PARAMS_NAMES.agentId] = REPORTER_ID;
  if (iiqAnalyticsAnalyticsAdapter.initOptions.abTestUuid) {
    result[PARAMS_NAMES.abTestUuid] = iiqAnalyticsAnalyticsAdapter.initOptions.abTestUuid;
  }
  if (iiqAnalyticsAnalyticsAdapter.initOptions.fpid?.pcid) {
    result[PARAMS_NAMES.firstPartyId] = encodeURIComponent(iiqAnalyticsAnalyticsAdapter.initOptions.fpid.pcid);
  }
  if (iiqAnalyticsAnalyticsAdapter.initOptions.fpid?.pid) {
    result[PARAMS_NAMES.profile] = encodeURIComponent(iiqAnalyticsAnalyticsAdapter.initOptions.fpid.pid);
  }
  // ABTestingConfigurationSource is fixed to 'group' for this build.
  result[PARAMS_NAMES.ABTestingConfigurationSource] = 'group';
  prepareData(data, result);

  fillEidsData(result);

  return result;
}

function fillEidsData(result: Record<string, any>): void {
  if (iiqAnalyticsAnalyticsAdapter.initOptions.dataIdsInitialized) {
    result[PARAMS_NAMES.hadEidsInLocalStorage] =
            iiqAnalyticsAnalyticsAdapter.initOptions.eidl && iiqAnalyticsAnalyticsAdapter.initOptions.eidl > 0;
    result[PARAMS_NAMES.auctionEidsLength] = iiqAnalyticsAnalyticsAdapter.initOptions.eidl || -1;
  }
}

function prepareData(data: any, result: Record<string, any>): void {
  const adTypeValue = data.adType || data.mediaType;

  if (data.bidderCode) result.bidderCode = data.bidderCode;
  if (data.cpm) result.cpm = data.cpm;
  if (data.currency) result.currency = data.currency;
  if (data.originalCpm) result.originalCpm = data.originalCpm;
  if (data.originalCurrency) result.originalCurrency = data.originalCurrency;
  if (data.status) result.status = data.status;
  if (data.size) result.size = data.size;
  if (typeof data.pos === 'number') {
    result.pos = data.pos;
  } else if (data.adUnitCode) {
    const pos = getUnitPosition(pbjs, data.adUnitCode);
    if (typeof pos === 'number') result.pos = pos;
  }

  result.prebidAuctionId = data.auctionId || data.prebidAuctionId;

  if (adTypeValue) result[PARAMS_NAMES.adType] = adTypeValue;

  // adUnitConfig is fixed to the default (adUnitCode, falling back to placementId).
  result.placementId = data.adUnitCode || extractPlacementId(data) || '';

  result.biddingPlatformId = data.biddingPlatformId || 1;

  if (data?.partnerAuctionId) result.partnerAuctionId = data.partnerAuctionId;
}

function extractPlacementId(data: any): string | null {
  if (data.placementId) {
    return data.placementId;
  }
  if (data.params && Array.isArray(data.params)) {
    for (let i = 0; i < data.params.length; i++) {
      if (data.params[i].placementId) {
        return data.params[i].placementId;
      }
    }
  }
  return null;
}

function getDefaultDataObject(): Record<string, any> {
  return {
    inbbl: false,
    pbjsver: prebidVersion,
    reportSource: 'pbjs',
    jsversion: VERSION,
    partnerId: -1,
    biddingPlatformId: 1,
    idls: false,
    ast: -1,
    aeidln: -1
  };
}

function constructFullUrl(data: Record<string, any>): { url: string } {
  const report: string[] = [];
  const partnerData = (window as any)[identityGlobalName as string]?.partnerData;
  const partnerAuctionId = data?.partnerAuctionId;
  const encodedData = btoa(JSON.stringify(data));
  report.push(encodedData);

  const cmpData = getCmpData();
  const baseUrl = reportingServerAddress();

  let url =
        baseUrl +
        '?pid=' +
        iiqAnalyticsAnalyticsAdapter.initOptions.partner;
  if (partnerAuctionId) {
    url +=
          '&paucid=' +
          encodeURIComponent(JSON.stringify([partnerAuctionId]));
  }
  url += '&mct=1' +
        (iiqAnalyticsAnalyticsAdapter.initOptions?.fpid
          ? '&iiqid=' + encodeURIComponent(iiqAnalyticsAnalyticsAdapter.initOptions.fpid.pcid)
          : '') +
        '&agid=' +
        REPORTER_ID +
        '&jsver=' +
        VERSION +
        '&source=' +
        PREBID +
        '&uh=' +
        encodeURIComponent(iiqAnalyticsAnalyticsAdapter.initOptions.clientHints) +
        (isValidValue(cmpData.uspString) ? '&us_privacy=' + encodeURIComponent(cmpData.uspString as string) : '') +
        (isValidValue(cmpData.gppString) ? '&gpp=' + encodeURIComponent(cmpData.gppString as string) : '') +
        (isValidValue(cmpData.gdprString)
          ? '&gdpr_consent=' + encodeURIComponent(cmpData.gdprString as string) + '&gdpr=1'
          : '&gdpr=0') +
        (cmpData.gdprApplies && isValidValue(cmpData.tcfApiVersion) ? '&tcfv=' + encodeURIComponent(cmpData.tcfApiVersion as string) : '');

  url = appendSPData(url, partnerData);
  url = appendVrrefAndFui(url);
  url += '&payload=' + encodeURIComponent(JSON.stringify(report));

  return { url };
}

iiqAnalyticsAnalyticsAdapter.originEnableAnalytics = iiqAnalyticsAnalyticsAdapter.enableAnalytics;

iiqAnalyticsAnalyticsAdapter.enableAnalytics = function (myConfig: any): void {
  iiqAnalyticsAnalyticsAdapter.originEnableAnalytics(myConfig); // call the base class function
  initAdapterConfig(myConfig);
};

iiqAnalyticsAnalyticsAdapter.originDisableAnalytics = iiqAnalyticsAnalyticsAdapter.disableAnalytics;
iiqAnalyticsAnalyticsAdapter.disableAnalytics = function(): void {
  globalName = undefined;
  identityGlobalName = undefined;
  iiqConfig = undefined;
  iiqAnalyticsAnalyticsAdapter.initOptions = getDefaultInitOptions();
  iiqAnalyticsAnalyticsAdapter.originDisableAnalytics();
};
adapterManager.registerAnalyticsAdapter({
  adapter: iiqAnalyticsAnalyticsAdapter,
  code: MODULE_NAME
});

export default iiqAnalyticsAnalyticsAdapter;
