import adapterManager from '../../src/adapterManager.js';
import { getGlobal } from '../../src/prebidGlobal.js';

import {
  PERFORMANCE_EVENT,
  ERROR_CODES,
  ErrorType
} from '../intentIqConstants/performanceConstants.js';

import { performanceTracker } from './performanceTracker.js';

import { appendVrrefAndFui } from './getRefferer.js';
import { getIiqServerAddress } from './intentIqConfig.js';

const pbjs = getGlobal();

let missingAnalyticsReported = false;

export function hasIIQAnalytics(partnerId) {
  try {
    const adapter =
      adapterManager.getAnalyticsAdapter('iiqAnalytics');

    const enabled =
      adapter?.adapter?.enabled === true;

    const globalExists =
      !!window[`intentIqAnalyticsAdapter_${partnerId}`];

    return enabled || globalExists;
  } catch (e) {
    return false;
  }
}

export function collectPerformanceData({
  configParams,
  firstPartyData,
  partnerData,
  runtimeEids
}) {
  const payload = performanceTracker.getFilteredData(
    partnerData?.pd,
    pbjs?.installedModules || []
  );

  const hasPayload = Object.values(payload).some(data => {
    return (
      data &&
      typeof data === 'object' &&
      Object.keys(data).length > 0
    );
  });

  if (!hasPayload) {
    return {};
  }

  return {
    pcid: firstPartyData?.pcid,
    dpi: configParams.partner,
    jsver: configParams.version,
    pbjsver: pbjs?.version,
    pid: firstPartyData?.pid,
    vrref: appendVrrefAndFui(
      '',
      configParams.domainName
    ).replace('&vrref=', ''),
    eidLn: runtimeEids?.eids?.length || 0,
    dm: partnerData?.dm || [],
    ...payload
  };
}

export function makePerformanceRequest({
  configParams,
  firstPartyData,
  partnerData,
  runtimeEids
}) {
  const performanceData = collectPerformanceData({
    configParams,
    firstPartyData,
    partnerData,
    runtimeEids
  });

  if (!Object.keys(performanceData).length) {
    return;
  }

  const queryParams = new URLSearchParams();

  Object.keys(performanceData).forEach(key => {
    const value = performanceData[key];

    if (
      value !== undefined &&
      value !== null
    ) {
      if (typeof value === 'object') {
        queryParams.append(
          key,
          JSON.stringify(value)
        );
      } else {
        queryParams.append(
          key,
          String(value)
        );
      }
    }
  });

  const endpoint =
    partnerData?.ae ||
    `${getIiqServerAddress(configParams)}/report`;

  const img = new Image();

  img.src = `${endpoint}?${queryParams.toString()}`;

  performanceTracker.resetData();
}

export function scheduleAnalyticsDetection({
  configParams,
  firstPartyData,
  partnerData,
  runtimeEids,
  timeout = 5000
}) {
  const detect = () => {
    if (missingAnalyticsReported) return;

    const analyticsDetected =
      hasIIQAnalytics(configParams.partner);

    if (analyticsDetected) {
      performanceTracker.addPerformance(
        PERFORMANCE_EVENT.ANALYTICS_ADAPTER_DETECTED
      );

      return;
    }

    missingAnalyticsReported = true;

    performanceTracker.addWarning(
      ERROR_CODES.ANALYTICS_ADAPTER_MISSING,
      ErrorType.ERROR
    );

    makePerformanceRequest({
      configParams,
      firstPartyData,
      partnerData,
      runtimeEids
    });
  };

  setTimeout(detect, timeout);

  window.addEventListener(
    'pagehide',
    detect,
    { once: true }
  );
}