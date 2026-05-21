import { allConsent } from "../../src/consentHandler.js";

/**
 * Retrieves consent data from the Consent Management Platform (CMP).
 * @return {Object} An object containing the following fields:
 * - `gdprApplies` (boolean): Whether GDPR applies.
 * - `gdprString` (string): GDPR consent string if available.
 * - `uspString` (string): USP consent string if available.
 * - `gppString` (string): GPP consent string if available.
 * - `tcfVersion` (number|undefined): TCF API version when a TCF CMP is detected.
 */
export function getCmpData() {
  const consentData = allConsent.getConsentData();

  return {
    gdprApplies: consentData?.gdpr?.gdprApplies || false,
    gdprString: typeof consentData?.gdpr?.consentString === 'string' ? consentData.gdpr.consentString : null,
    uspString: typeof consentData?.usp === 'string' ? consentData.usp : null,
    gppString: typeof consentData?.gpp?.gppString === 'string' ? consentData.gpp.gppString : null,
    tcfVersion: detectTcfVersion(consentData?.gdpr?.apiVersion),
  };
}

export function isValidValue(val) {
  return !!val && val !== 'undefined';
}

export function areCmpValuesEqual(a, b) {
  const aValid = isValidValue(a);
  const bValid = isValidValue(b);
  if (!aValid && !bValid) return true;
  if (aValid !== bValid) return false;
  return a === b;
}

/**
 * Detects the TCF API version. Prefers the apiVersion exposed by Prebid's
 * consentManagementTcf module; falls back to probing window.__tcfapi when
 * the TCF CMP is available but the consent data was not yet populated.
 * @param {number|undefined} apiVersionFromConsent
 * @return {number|undefined}
 */
export function detectTcfVersion(apiVersionFromConsent) {
  if (typeof apiVersionFromConsent === 'number') return apiVersionFromConsent;
  try {
    const tcf = (typeof window !== 'undefined' && window.__tcfapi) ||
      (typeof window !== 'undefined' && window.top && window.top.__tcfapi);
    if (typeof tcf !== 'function') return undefined;
    let version;
    tcf('ping', 2, (pingReturn) => {
      if (pingReturn && typeof pingReturn.apiVersion === 'number') {
        version = pingReturn.apiVersion;
      } else if (pingReturn && typeof pingReturn.apiVersion === 'string') {
        const parsed = parseInt(pingReturn.apiVersion, 10);
        if (!Number.isNaN(parsed)) version = parsed;
      }
    });
    return version;
  } catch (e) {
    return undefined;
  }
}
