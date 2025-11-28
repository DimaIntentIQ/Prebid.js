const REGION_MAPPING = {
  gdpr: true,
  apac: true,
  emea: true
};

function checkRegion(region) {
  if (typeof region !== 'string') return '';
  const lower = region.toLowerCase();
  return REGION_MAPPING[lower] ? lower : '';
}

function buildServerAddress(baseName, region, gdprDetected) {
  const checkedRegion = checkRegion(region);
  if (checkedRegion) return `https://${baseName}-${checkedRegion}.intentiq.com`;
  if (gdprDetected) return `https://${baseName}-gdpr.intentiq.com`;
  return `https://${baseName}.intentiq.com`;
}

export const iiqServerAddress = (configParams = {}, gdprDetected) => {
  if (typeof configParams?.iiqServerAddress === 'string') return configParams.iiqServerAddress;
  return buildServerAddress('api', configParams.region, gdprDetected);
};

export const iiqPixelServerAddress = (configParams = {}, gdprDetected) => {
  if (typeof configParams?.iiqPixelServerAddress === 'string') return configParams.iiqPixelServerAddress;
  return buildServerAddress('sync', configParams.region, gdprDetected);
};

export const reportingServerAddress = (reportEndpoint, gdprDetected, region) => {
  if (reportEndpoint && typeof reportEndpoint === 'string') return reportEndpoint;
  const host = buildServerAddress('reports', region, gdprDetected);
  return `${host}/report`;
};
