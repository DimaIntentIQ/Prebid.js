import {
  ADDITIONAL_ANALYTIC_PARAMS as AAP,
  businessAdapters,
  emptyWarning,
  ErrorsMap,
  ErrorType,
  multipleErrors
} from '../intentIqConstants/performanceConstants.js';

class PerformanceTracker {
  constructor() {
    this.performanceStart = performance.now();
    this.performanceData = {};
    this.warningData = JSON.parse(JSON.stringify(emptyWarning));
    this.additionalAnalyticParams = {};
  }

  addPerformance(id, value) {
    const raw = typeof value === 'number'
      ? value
      : id === 0
        ? this.performanceStart
        : id === 60
          ? performance.now()
          : performance.now() - this.performanceStart;

    this.performanceData[id] = this.performanceData[id] || [];
    this.performanceData[id].push(parseFloat(raw.toFixed(1)));
  }

  addAdditionalAnalyticParam(id, value) {
    const rawIds = [
      AAP.AUCTION_EIDS_DIFF,
      AAP.AUCTION_TO_BIDWON_PERCENTAGE,
      AAP.BIDWON_MINUS_IMPRESSIONS
    ];

    this.additionalAnalyticParams[id] = rawIds.includes(id) ? value : value ? 1 : 0;
  }

  addWarning(id, errorType) {
    if (!ErrorsMap[errorType]?.includes(id)) return;
    this.warningData[errorType][id] = (this.warningData[errorType][id] || 0) + 1;
  }

  checkWarnings(config = []) {
    config.forEach(({ id, warningCode, errorType }) => {
      if (this.performanceData[id]?.length > 1) this.addWarning(warningCode, errorType);
    });
  }

  filterWarningData(data, ids = []) {
    return ids.reduce((acc, id) => {
      if (data[id]) acc[id] = data[id];
      return acc;
    }, {});
  }

  updatePerformanceData(ids = []) {
    if (ids.includes(-1)) return { ...this.performanceData };
    return ids.reduce((acc, id) => {
      if (this.performanceData[id]) acc[id] = this.performanceData[id];
      return acc;
    }, {});
  }

  getFilteredData(pd, installedModules = [], force = false) {
    this.checkWarnings(multipleErrors);

    const performanceData = force ? { ...this.performanceData } : {};
    const warningData = JSON.parse(JSON.stringify(emptyWarning));
    const businessData = {};
    let additionalAnalyticData = {};

    if (!force && pd?.p?.ct && pd?.p?.d?.length) {
      Object.assign(performanceData, this.updatePerformanceData(pd.p.d));
      pd.p.ct--;
    }

    if (force) {
      Object.assign(warningData.ed, this.warningData.ed);
      Object.assign(warningData.ld, this.warningData.ld);
      Object.assign(warningData.fd, this.warningData.fd);
      additionalAnalyticData = { ...this.additionalAnalyticParams };
    } else if (pd?.w?.ct) {
      Object.values(ErrorType).forEach(key => {
        const ids = pd?.w?.[key] || [];
        warningData[key] = ids.includes(-1) ? this.warningData[key] : this.filterWarningData(this.warningData[key], ids);
      });

      if (Object.values(warningData).some(data => Object.keys(data).length)) pd.w.ct--;
    }

    if (pd?.b?.ct && pd?.b?.d?.length) {
      const ids = pd.b.d.includes(-1) ? Object.keys(businessAdapters).map(Number) : pd.b.d;
      ids.forEach(id => {
        if (businessAdapters[id]) businessData[id] = installedModules.includes(businessAdapters[id]) ? 1 : 0;
      });
      pd.b.ct--;
    }

    if (!force && pd?.ad?.ct && pd?.ad?.d?.length) {
      const keys = Object.keys(this.additionalAnalyticParams);
      if (keys.length) {
        additionalAnalyticData = pd.ad.d.includes(-1)
          ? { ...this.additionalAnalyticParams }
          : pd.ad.d.reduce((acc, key) => {
              acc[key] = this.additionalAnalyticParams[key];
              return acc;
            }, {});
        pd.ad.ct--;
      }
    }

    return {
      apd: performanceData,
      aed: warningData.ed,
      ald: warningData.ld,
      afd: warningData.fd,
      abd: businessData,
      add: additionalAnalyticData
    };
  }

  hasPerformance(id) {
    return this.performanceData[id] !== undefined;
  }

  resetData() {
    this.performanceData = {};
    this.warningData = JSON.parse(JSON.stringify(emptyWarning));
    this.additionalAnalyticParams = {};
  }
}

export const performanceTracker = new PerformanceTracker();