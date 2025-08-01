import { isEmpty, logWarn } from './utils.js';
import { config } from './config.js';

const _defaultPrecision = 2;
const _lgPriceConfig = {
  'buckets': [{
    'max': 5,
    'increment': 0.5
  }]
};
const _mgPriceConfig = {
  'buckets': [{
    'max': 20,
    'increment': 0.1
  }]
};
const _hgPriceConfig = {
  'buckets': [{
    'max': 20,
    'increment': 0.01
  }]
};
const _densePriceConfig = {
  'buckets': [{
    'max': 3,
    'increment': 0.01
  },
  {
    'max': 8,
    'increment': 0.05
  },
  {
    'max': 20,
    'increment': 0.5
  }]
};
const _autoPriceConfig = {
  'buckets': [{
    'max': 5,
    'increment': 0.05
  },
  {
    'max': 10,
    'increment': 0.1
  },
  {
    'max': 20,
    'increment': 0.5
  }]
};

function getPriceBucketString(cpm, customConfig, granularityMultiplier = 1) {
  let cpmFloat: any = parseFloat(cpm);
  if (isNaN(cpmFloat)) {
    cpmFloat = '';
  }

  return {
    low: (cpmFloat === '') ? '' : getCpmStringValue(cpm, _lgPriceConfig, granularityMultiplier),
    med: (cpmFloat === '') ? '' : getCpmStringValue(cpm, _mgPriceConfig, granularityMultiplier),
    high: (cpmFloat === '') ? '' : getCpmStringValue(cpm, _hgPriceConfig, granularityMultiplier),
    auto: (cpmFloat === '') ? '' : getCpmStringValue(cpm, _autoPriceConfig, granularityMultiplier),
    dense: (cpmFloat === '') ? '' : getCpmStringValue(cpm, _densePriceConfig, granularityMultiplier),
    custom: (cpmFloat === '') ? '' : getCpmStringValue(cpm, customConfig, granularityMultiplier)
  };
}

function getCpmStringValue(cpm, config, granularityMultiplier) {
  let cpmStr = '';
  if (!isValidPriceConfig(config)) {
    return cpmStr;
  }
  const cap = config.buckets.reduce((prev, curr) => {
    if (prev.max > curr.max) {
      return prev;
    }
    return curr;
  }, {
    'max': 0,
  });

  let bucketFloor = 0;
  let bucket = config.buckets.find(bucket => {
    if (cpm > cap.max * granularityMultiplier) {
      // cpm exceeds cap, just return the cap.
      let precision = bucket.precision;
      if (typeof precision === 'undefined') {
        precision = _defaultPrecision;
      }
      cpmStr = (bucket.max * granularityMultiplier).toFixed(precision);
    } else if (cpm <= bucket.max * granularityMultiplier && cpm >= bucketFloor * granularityMultiplier) {
      bucket.min = bucketFloor;
      return bucket;
    } else {
      bucketFloor = bucket.max;
    }
  });
  if (bucket) {
    cpmStr = getCpmTarget(cpm, bucket, granularityMultiplier);
  }
  return cpmStr;
}

function isValidPriceConfig(config) {
  if (isEmpty(config) || !config.buckets || !Array.isArray(config.buckets)) {
    return false;
  }
  let isValid = true;
  config.buckets.forEach(bucket => {
    if (!bucket.max || !bucket.increment) {
      isValid = false;
    }
  });
  return isValid;
}

declare module './config' {
    interface Config {
        /**
         * CPM rounding function. Default is Math.floor.
         * @param cpm
         */
        cpmRoundingFunction?: (cpm: number) => number;
    }
}

function getCpmTarget(cpm, bucket, granularityMultiplier) {
  const precision = typeof bucket.precision !== 'undefined' ? bucket.precision : _defaultPrecision;
  const increment = bucket.increment * granularityMultiplier;
  const bucketMin = bucket.min * granularityMultiplier;
  let roundingFunction = Math.floor;
  let customRoundingFunction = config.getConfig('cpmRoundingFunction');
  if (typeof customRoundingFunction === 'function') {
    roundingFunction = customRoundingFunction;
  }

  // start increments at the bucket min and then add bucket min back to arrive at the correct rounding
  // note - we're padding the values to avoid using decimals in the math prior to flooring
  // this is done as JS can return values slightly below the expected mark which would skew the price bucket target
  //   (eg 4.01 / 0.01 = 400.99999999999994)
  // min precison should be 2 to move decimal place over.
  let pow = Math.pow(10, precision + 2);
  let cpmToRound = ((cpm * pow) - (bucketMin * pow)) / (increment * pow);
  let cpmTarget;
  let invalidRounding;
  // It is likely that we will be passed {cpmRoundingFunction: roundingFunction()}
  // rather than the expected {cpmRoundingFunction: roundingFunction}. Default back to floor in that case
  try {
    cpmTarget = (roundingFunction(cpmToRound) * increment) + bucketMin;
  } catch (err) {
    invalidRounding = true;
  }
  if (invalidRounding || typeof cpmTarget !== 'number') {
    logWarn('Invalid rounding function passed in config');
    cpmTarget = (Math.floor(cpmToRound) * increment) + bucketMin;
  }
  // force to 10 decimal places to deal with imprecise decimal/binary conversions
  //    (for example 0.1 * 3 = 0.30000000000000004)

  cpmTarget = Number(cpmTarget.toFixed(10));
  return cpmTarget.toFixed(precision);
}

export { getPriceBucketString, isValidPriceConfig };
