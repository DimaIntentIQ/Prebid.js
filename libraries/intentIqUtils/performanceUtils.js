import adapterManager from '../../src/adapterManager.js';
import { getGlobal } from '../../src/prebidGlobal.js';

import {
  PERFORMANCE_EVENT,
  ERROR_CODES,
  ErrorType,
  ADDITIONAL_ANALYTIC_PARAMS
} from '../intentIqConstants/performanceConstants.js';

import { performanceTracker } from './performanceTracker.js';
import { appendVrrefAndFui } from './getRefferer.js';
import { getIiqServerAddress } from './intentIqConfig.js';
import { VERSION } from '../intentIqConstants/intentIqConstants.js';

const pbjs = getGlobal();

let missingAnalyticsReported = false;

export function hasIIQAnalytics(partnerId) {
  try {
    const wrapper = adapterManager.getAnalyticsAdapter('iiqAnalytics');
    const enabled = wrapper?.adapter?.enabled === true;
    const globalExists = !!window[`intentIqAnalyticsAdapter_${partnerId}`];
    return enabled || globalExists;
  } catch (e) {
    return false;
  }
}

export function collectPerformanceData({ configParams, firstPartyData, partnerData, runtimeEids, force = false }) {
  const payload = performanceTracker.getFilteredData(partnerData?.pd, pbjs?.installedModules || [], force);
  const hasPayload = Object.values(payload).some(data => data && typeof data === 'object' && Object.keys(data).length);

  if (!hasPayload) return {};

  return {
    pcid: firstPartyData?.pcid,
    dpi: configParams.partner,
    jsver: configParams.version || VERSION,
    pbjsver: pbjs?.version,
    pid: firstPartyData?.pid,
    vrref: appendVrrefAndFui('', configParams.domainName).replace('&vrref=', ''),
    eidLn: runtimeEids?.eids?.length || 0,
    dm: partnerData?.dm || [],
    ...payload
  };
}

export function makePerformanceRequest({ configParams, firstPartyData, partnerData, runtimeEids, force = false }) {
  const performanceData = collectPerformanceData({ configParams, firstPartyData, partnerData, runtimeEids, force });
  if (!Object.keys(performanceData).length) return false;

  const queryParams = new URLSearchParams();

  Object.entries(performanceData).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    queryParams.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });

  const endpoint = partnerData?.ae || `${getIiqServerAddress(configParams)}/report`;
  new Image().src = `${endpoint}?${queryParams.toString()}`;

  performanceTracker.addPerformance(PERFORMANCE_EVENT.ANALYTICS_REPORT_SENT);
  performanceTracker.resetData();
  return true;
}

export function scheduleAnalyticsDetection({ configParams, firstPartyData, partnerData, runtimeEids, timeout = 5000 }) {
  const detect = () => {
    if (missingAnalyticsReported) return;

    const analyticsDetected = hasIIQAnalytics(configParams.partner);
    performanceTracker.addAdditionalAnalyticParam(ADDITIONAL_ANALYTIC_PARAMS.ANALYTICS_ENABLED, analyticsDetected);

    if (analyticsDetected) {
      performanceTracker.addPerformance(PERFORMANCE_EVENT.ANALYTICS_ADAPTER_DETECTED);
      return;
    }

    missingAnalyticsReported = true;
    performanceTracker.addWarning(ERROR_CODES.ANALYTICS_ADAPTER_MISSING, ErrorType.ERROR);

    makePerformanceRequest({ configParams, firstPartyData, partnerData, runtimeEids, force: true });
  };

  setTimeout(detect, timeout);
}