import {
  AAP,
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
    let newPerformance;

    if (typeof value === 'number') {
      newPerformance = value;
    } else {
      switch (id) {
        case 0:
          newPerformance = this.performanceStart;
          break;
        case 60:
          newPerformance = performance.now();
          break;
        default:
          newPerformance = performance.now() - this.performanceStart;
          break;
      }
    }

    this.performanceData[id] = this.performanceData[id] || [];
    this.performanceData[id].push(
      parseFloat(newPerformance.toFixed(1))
    );
  }

  addAdditionalAnalyticParam(id, value) {
    if (
      id === AAP.eidsDiff ||
      id === AAP.auctionToBidWonPercentage ||
      id === AAP.bidWonImpressionsDiff
    ) {
      this.additionalAnalyticParams[id] = value;
      return;
    }

    this.additionalAnalyticParams[id] = value ? 1 : 0;
  }

  addWarning(id, errorType) {
    if (ErrorsMap[errorType]?.includes(id)) {
      this.warningData[errorType][id] =
        (this.warningData[errorType][id] || 0) + 1;
    }
  }

  checkWarnings(config) {
    config.forEach(({ id, warningCode, errorType }) => {
      if (this.performanceData[id]?.length > 1) {
        this.addWarning(warningCode, errorType);
      }
    });
  }

  filterWarningData(data, ids) {
    const filteredData = {};

    for (const id of ids) {
      if (data[id]) {
        filteredData[id] = data[id];
      }
    }

    return filteredData;
  }

  updatePerformanceData(ids) {
    if (ids.some(el => el === -1)) {
      return Object.keys(this.performanceData).reduce((acc, key) => {
        acc[Number(key)] = this.performanceData[Number(key)][0];
        return acc;
      }, {});
    }

    return ids.reduce((acc, id) => {
      if (this.performanceData[id]) {
        acc[id] = this.performanceData[id][0];
      }
      return acc;
    }, {});
  }

  getFilteredData(pd, installedModules = []) {
    let performanceData = {};
    const warningData = JSON.parse(JSON.stringify(emptyWarning));
    const businessData = {};
    let additionalAnalyticData = {};

    this.checkWarnings(multipleErrors);

    if (pd?.p?.ct && pd?.p?.d?.length) {
      performanceData = this.updatePerformanceData(pd.p.d);
      pd.p.ct--;
    }

    if (pd?.w?.ct) {
      const keys = Object.values(ErrorType);

      keys.forEach(key => {
        const data = pd?.w?.[key];

        if (
          data &&
          data.length &&
          data.some(el => el === -1)
        ) {
          warningData[key] = this.warningData[key];
        } else {
          warningData[key] = this.filterWarningData(
            this.warningData[key],
            data || []
          );
        }
      });

      if (
        Object.values(warningData).some(
          data => Object.keys(data).length > 0
        )
      ) {
        pd.w.ct--;
      }
    }

    if (pd?.b?.ct && pd?.b?.d?.length) {
      if (pd.b.d.some(el => el === -1)) {
        Object.entries(businessAdapters).forEach(([key, adapter]) => {
          const index = Number(key);

          businessData[index] =
            installedModules.includes(adapter) ? 1 : 0;
        });
      } else {
        pd.b.d.forEach(el => {
          if (businessAdapters[el]) {
            businessData[el] =
              installedModules.includes(
                businessAdapters[el]
              )
                ? 1
                : 0;
          }
        });
      }

      pd.b.ct--;
    }

    if (pd?.ad?.ct && pd?.ad?.d?.length) {
      const addParamKeys = Object.keys(
        this.additionalAnalyticParams
      );

      if (addParamKeys.length) {
        if (pd.ad.d.some(item => item === -1)) {
          additionalAnalyticData = {
            ...this.additionalAnalyticParams
          };
        } else {
          pd.ad.d.forEach(key => {
            additionalAnalyticData[key] =
              this.additionalAnalyticParams[key];
          });
        }

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