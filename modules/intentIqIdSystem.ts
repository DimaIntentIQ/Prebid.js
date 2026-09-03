/**
 * This module adds IntentIqId to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/intentIqIdSystem
 * @requires module:modules/userId
 */

import { logError } from '../src/utils.js';
import { ajax } from '../src/ajax.js';
import { submodule } from '../src/hook.js';
import { appendSPData } from '../libraries/intentIqUtils/urlUtils.ts';
import { isCHSupported } from '../libraries/intentIqUtils/chUtils.ts';
import { appendVrrefAndFui } from '../libraries/intentIqUtils/getRefferer.ts';
import { getCmpData, areCmpValuesEqual, isValidValue } from '../libraries/intentIqUtils/getCmpData.ts';
import {
  AllowedStorageType,
  defineStorageType,
  readData,
  removeDataByKey,
  storeData,
  tryParse
} from '../libraries/intentIqUtils/storageUtils.ts';
import {
  CLIENT_HINTS_KEY,
  FIRST_PARTY_KEY,
  GVLID,
  VERSION, INVALID_ID, PREBID,
  HOURS_72, CH_KEYS, WITH_IIQ, WITHOUT_IIQ
} from '../libraries/intentIqConstants/intentIqConstants.ts';
import { getIiqServerAddress } from '../libraries/intentIqUtils/intentIqConfig.ts';
import { decryptData, encryptData } from '../libraries/intentIqUtils/cryptionUtils.ts';
// the augmentation below only applies where the spec is part of the program; naming a type from it
// in this module's public interface puts it there for anyone who imports this module
import type { UserIdConfig } from './userId/spec.ts';

export type IntentIqIdSystemModuleName = 'intentIqId';

export type IntentIqIdSystemParams = {
  /**
   * Partner ID assigned by IntentIQ. Required.
   */
  partner: number;

  /**
   * Invoked when the identity lookup completes or times out.
   * Receives the resolved EID payload or an empty string when the user is
   * opted out.
   */
  callback?: (data: { eids: unknown[] } | string) => void;

  /**
   * Milliseconds to wait for the server response before firing `callback`
   * with whatever data is currently available. Defaults to 500 ms.
   */
  timeoutInMillis?: number;

  /**
   * Explicit A/B group override. This build always assigns the A/B test
   * group directly from `group` (equivalent to a fixed
   * `ABTestingConfigurationSource: 'group'`), independent of the server
   * termination cause.
   */
  group?: 'A' | 'B';

  /**
   * Timeout in milliseconds for fetching Client Hints before falling back
   * to an empty string. Defaults to 10 ms.
   */
  chTimeout?: number;

  /**
   * Partner-supplied first-party client identifier.
   */
  partnerClientId?: string;

  /**
   * Type code for `partnerClientId`. Must be a positive integer recognised
   * by the IntentIQ server.
   */
  partnerClientIdType?: number;
};

declare module './userId/spec' {
  interface UserId {
    intentIqId: string;
  }

  interface ProvidersToId {
    intentIqId: 'intentIqId';
  }

  interface ProviderParams {
    intentIqId: IntentIqIdSystemParams;
  }
}

const MODULE_NAME = 'intentIqId' as const;

const encoderCH: Record<string, number> = {
  brands: 0,
  mobile: 1,
  platform: 2,
  architecture: 3,
  bitness: 4,
  model: 5,
  platformVersion: 6,
  wow64: 7,
  fullVersionList: 8
};
let globalName = '';

let FIRST_PARTY_KEY_FINAL = FIRST_PARTY_KEY;
let PARTNER_DATA_KEY: string = '';
let callCount = 0;
let failCount = 0;
let noDataCount = 0;

export let firstPartyData: any;
let partnerData: any;
let clientHints: string | null | undefined;
let actualABGroup: IntentIqIdSystemParams['group'] | undefined;

/**
 * Generate standard UUID string
 * @return {string}
 */
function generateGUID(): string {
  let d = new Date().getTime();
  const guid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c: string) {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  return guid;
}

function appendFirstPartyData(url: string, firstPartyData: any, partnerData: any): string {
  url += firstPartyData.pid ? '&pid=' + encodeURIComponent(firstPartyData.pid) : '';
  url += firstPartyData.pcid ? '&iiqidtype=2&iiqpcid=' + encodeURIComponent(firstPartyData.pcid) : '';
  url += firstPartyData.pcidDate ? '&iiqpciddate=' + encodeURIComponent(firstPartyData.pcidDate) : '';
  return url;
}

function verifyIdType(value: number): number {
  if (value === 0 || value === 1 || value === 3 || value === 4) return value;
  return -1;
}

function appendPartnersFirstParty(url: string, configParams: any): string {
  const partnerClientId = typeof configParams.partnerClientId === 'string' ? encodeURIComponent(configParams.partnerClientId) : '';
  const partnerClientIdType = typeof configParams.partnerClientIdType === 'number' ? verifyIdType(configParams.partnerClientIdType) : -1;

  if (partnerClientIdType === -1) return url;
  if (partnerClientId !== '') {
    url = url + '&pcid=' + partnerClientId;
    url = url + '&idtype=' + partnerClientIdType;
  }
  return url;
}

function appendCMPData(url: string, cmpData: any): string {
  url += isValidValue(cmpData.uspString) ? '&us_privacy=' + encodeURIComponent(cmpData.uspString) : '';
  url += isValidValue(cmpData.gppString) ? '&gpp=' + encodeURIComponent(cmpData.gppString) : '';
  if (cmpData.gdprApplies) {
    url += isValidValue(cmpData.gdprString) ? '&gdpr_consent=' + encodeURIComponent(cmpData.gdprString) : '';
    url += '&gdpr=1';
    url += isValidValue(cmpData.tcfApiVersion) ? '&tcfv=' + encodeURIComponent(cmpData.tcfApiVersion) : '';
  } else {
    url += '&gdpr=0';
  }
  return url;
}

function appendCounters(url: string): string {
  url += '&jaesc=' + encodeURIComponent(callCount);
  url += '&jafc=' + encodeURIComponent(failCount);
  url += '&jaensc=' + encodeURIComponent(noDataCount);
  return url;
}

export function initializeGlobalIIQ(partnerId: number): boolean {
  if (!globalName || !(window as any)[globalName]) {
    globalName = `iiq_identity_${partnerId}`;
    (window as any)[globalName] = {};
    return true;
  }
  return false;
}

/**
 * Processes raw client hints data into a structured format.
 * @param {object} clientHints - Raw client hints data
 * @return {string} A JSON string of processed client hints or an empty string if no hints
 */
export function handleClientHints(clientHints: any): string {
  const chParams: Record<string, string> = {};
  for (const key in clientHints) {
    if (clientHints.hasOwnProperty(key) && clientHints[key] !== '') {
      if (['brands', 'fullVersionList'].includes(key)) {
        let handledParam = '';
        clientHints[key].forEach((element: any, index: number) => {
          const isNotLast = index < clientHints[key].length - 1;
          handledParam += `"${element.brand}";v="${element.version}"${isNotLast ? ', ' : ''}`;
        });
        chParams[encoderCH[key]] = handledParam;
      } else if (typeof clientHints[key] === 'boolean') {
        chParams[encoderCH[key]] = `?${clientHints[key] ? 1 : 0}`;
      } else {
        chParams[encoderCH[key]] = `"${clientHints[key]}"`;
      }
    }
  }
  return Object.keys(chParams).length ? JSON.stringify(chParams) : '';
}

export function isCMPStringTheSame(fpData: any, cmpData: any): boolean {
  return ['gdprString', 'gppString', 'uspString'].every((field: string) =>
    areCmpValuesEqual(fpData[field], cmpData[field])
  );
}

function updateCountersAndStore(runtimeEids: any, allowedStorage: any, partnerData: any): void {
  if (!runtimeEids?.eids?.length) {
    noDataCount++;
  } else {
    callCount++;
  }
  storeCounters(allowedStorage, partnerData);
}

function clearCountersAndStore(allowedStorage: any, partnerData: any): void {
  callCount = 0;
  failCount = 0;
  noDataCount = 0;
  storeCounters(allowedStorage, partnerData);
}

function storeCounters(allowedStorage: any, partnerData: any): void {
  partnerData.callCount = callCount;
  partnerData.failCount = failCount;
  partnerData.noDataCounter = noDataCount;
  storeData(PARTNER_DATA_KEY, JSON.stringify(partnerData), allowedStorage, firstPartyData);
}

export const intentIqIdSubmodule = {
  /**
   * used to link submodule with config
   * @type {string}
   */
  name: MODULE_NAME,
  gvlid: GVLID,
  /**
   * decode the stored id value for passing to bid requests
   * @function
   * @param {{string}} value
   * @returns {{intentIqId: {string}}|undefined}
   */
  decode(value: string) {
    return value && INVALID_ID !== value ? { 'intentIqId': value } : undefined;
  },

  getId(config: UserIdConfig<IntentIqIdSystemModuleName>) {
    const configParams: Partial<IntentIqIdSystemParams> = config?.params ?? {};

    const firePartnerCallback = (): void => {
      if (configParams.callback && !callbackFired) {
        callbackFired = true;
        if (callbackTimeoutID) clearTimeout(callbackTimeoutID);
        let data = runtimeEids;
        if (data?.eids?.length === 1 && typeof data.eids[0] === 'string') data = data.eids[0];
        configParams.callback(data);
      }
      updateGlobalObj();
    };

    if (typeof configParams.partner !== 'number') {
      logError('User ID - intentIqId submodule requires a valid partner to be defined');
      firePartnerCallback();
      return;
    }

    initializeGlobalIIQ(configParams.partner);

    let decryptedData: any, callbackTimeoutID: ReturnType<typeof setTimeout> | undefined;
    let callbackFired = false;
    let runtimeEids: any = { eids: [] };

    const chTimeout = Number(configParams?.chTimeout) >= 0 ? Number(configParams.chTimeout) : 10;
    PARTNER_DATA_KEY = `${FIRST_PARTY_KEY}_${configParams.partner}`;

    const allowedStorage: AllowedStorageType[] = defineStorageType((config as any).enabledStorageTypes);
    partnerData = tryParse(readData(PARTNER_DATA_KEY, allowedStorage) as string) || {};

    let rrttStrtTime = 0;
    let shouldCallServer = false;
    const cmpData = getCmpData();
    const gdprDetected = cmpData.gdprString;
    firstPartyData = tryParse(readData(FIRST_PARTY_KEY_FINAL, allowedStorage) as string);

    // ABTestingConfigurationSource is fixed to 'group' for this build: the group
    // is taken directly from configParams.group, independent of the server tc.
    actualABGroup = typeof configParams.group === 'string' && configParams.group.toUpperCase() === WITHOUT_IIQ
      ? WITHOUT_IIQ
      : WITH_IIQ;

    callbackTimeoutID = setTimeout(() => {
      firePartnerCallback();
    }, configParams.timeoutInMillis || 500
    );

    if (!firstPartyData?.pcid) {
      const firstPartyId = generateGUID();
      const newObj = {
        pcid: firstPartyId,
        pcidDate: Date.now(),
        date: Date.now()
      };
      // Preserve existing FPD (gdprString, isOptedOut, sCal, ...) when present —
      // when opted out, pcid/pcidDate are not persisted to device, so the runtime
      // value is regenerated each session without overwriting persisted fields.
      firstPartyData = firstPartyData ? { ...firstPartyData, ...newObj } : newObj;
      storeData(FIRST_PARTY_KEY_FINAL, JSON.stringify(firstPartyData), allowedStorage, firstPartyData);
    } else if (!firstPartyData.pcidDate) {
      firstPartyData.pcidDate = Date.now();
      storeData(FIRST_PARTY_KEY_FINAL, JSON.stringify(firstPartyData), allowedStorage, firstPartyData);
    }

    if (gdprDetected && !('isOptedOut' in firstPartyData)) {
      firstPartyData.isOptedOut = true;
    }

    // Read client hints from storage
    clientHints = readData(CLIENT_HINTS_KEY, allowedStorage);
    const chSupported = isCHSupported();
    let chPromise: Promise<string> | null = null;

    function fetchAndHandleCH(): Promise<string> {
      return (navigator as any).userAgentData.getHighEntropyValues(CH_KEYS)
        .then((raw: any) => {
          const nextCH = handleClientHints(raw) || '';
          const prevCH = clientHints || '';
          if (nextCH !== prevCH) {
            clientHints = nextCH;
            storeData(CLIENT_HINTS_KEY, clientHints, allowedStorage, firstPartyData);
          }
          return nextCH;
        })
        .catch((err: any) => {
          logError('CH fetch failed', err);
          if (clientHints !== '') {
            clientHints = '';
            removeDataByKey(CLIENT_HINTS_KEY, allowedStorage);
          }
          return '';
        });
    }

    if (chSupported) {
      chPromise = fetchAndHandleCH();
      chPromise.catch((err: any) => {
        logError('fetchAndHandleCH failed', err);
      });
    } else {
      clientHints = '';
      removeDataByKey(CLIENT_HINTS_KEY, allowedStorage);
    }

    function waitOnCH(timeoutMs: number): Promise<any> {
      const timeout = new Promise<string>(resolve => setTimeout(() => resolve(''), timeoutMs));
      return Promise.race([chPromise, timeout]);
    }

    if (typeof partnerData.callCount === 'number') callCount = partnerData.callCount;
    if (typeof partnerData.failCount === 'number') failCount = partnerData.failCount;
    if (typeof partnerData.noDataCounter === 'number') noDataCount = partnerData.noDataCounter;
    if (partnerData.wsrvcll) {
      partnerData.wsrvcll = false;
      storeData(PARTNER_DATA_KEY, JSON.stringify(partnerData), allowedStorage, firstPartyData);
    }

    if (partnerData.data) {
      if (partnerData.data.length) { // encrypted data
        decryptedData = tryParse(decryptData(partnerData.data));
        runtimeEids = decryptedData;
      }
    }

    function updateGlobalObj(): void {
      if (globalName) {
        (window as any)[globalName].partnerData = partnerData;
        (window as any)[globalName].firstPartyData = firstPartyData;
        (window as any)[globalName].clientHints = clientHints;
        (window as any)[globalName].actualABGroup = actualABGroup;
      }
    }

    const pdLength = Object.keys(partnerData).length;
    const hasPartnerData = pdLength && pdLength > 1; // in OptOut case we keep one property inside

    if ((!isCMPStringTheSame(firstPartyData, cmpData)) ||
      !firstPartyData.sCal ||
      (hasPartnerData && (!partnerData.cttl || !partnerData.date || Date.now() - partnerData.date > partnerData.cttl))) {
      firstPartyData.uspString = cmpData.uspString;
      firstPartyData.gppString = cmpData.gppString;
      firstPartyData.gdprString = cmpData.gdprString;
      shouldCallServer = true;
      storeData(FIRST_PARTY_KEY_FINAL, JSON.stringify(firstPartyData), allowedStorage, firstPartyData);
      storeData(PARTNER_DATA_KEY, JSON.stringify(partnerData), allowedStorage, firstPartyData);
    }
    if (!shouldCallServer) {
      if (!hasPartnerData && !firstPartyData.isOptedOut) {
        shouldCallServer = true;
      } else shouldCallServer = Date.now() > firstPartyData.sCal + HOURS_72;
    }

    if (firstPartyData.isOptedOut) {
      partnerData.data = runtimeEids = { eids: [] };
      firePartnerCallback();
    }

    if (runtimeEids?.eids?.length) {
      firePartnerCallback();
    }

    if (!shouldCallServer) {
      firePartnerCallback();
      updateCountersAndStore(runtimeEids, allowedStorage, partnerData);
      return { id: runtimeEids.eids };
    }

    updateGlobalObj(); // update global object before server request, to make sure analytical adapter will have it even if the server is "not in time"

    // use protocol relative urls for http or https
    let url = `${getIiqServerAddress(configParams as any)}/profiles_engine/ProfilesEngineServlet?at=39&mi=10&dpi=${configParams.partner}&pt=17&dpn=1`;
    url = appendFirstPartyData(url, firstPartyData, partnerData);
    url = appendPartnersFirstParty(url, configParams);
    url += (partnerData.cttl) ? '&cttl=' + encodeURIComponent(partnerData.cttl) : '';
    url += (partnerData.rrtt) ? '&rrtt=' + encodeURIComponent(partnerData.rrtt) : '';
    url = appendCMPData(url, cmpData);
    url += '&japs=false';
    url = appendCounters(url);
    url += VERSION ? '&jsver=' + VERSION : '';
    url += actualABGroup ? '&testGroup=' + encodeURIComponent(actualABGroup) : '';
    url = appendSPData(url, partnerData);
    url += '&source=' + PREBID;
    url += '&ABTestingConfigurationSource=group';
    url += '&abtg=' + encodeURIComponent(actualABGroup as string);

    // Add vrref and fui to the URL
    url = appendVrrefAndFui(url);

    const storeFirstPartyData = (): void => {
      partnerData.eidl = runtimeEids?.eids?.length || -1;
      storeData(FIRST_PARTY_KEY_FINAL, JSON.stringify(firstPartyData), allowedStorage, firstPartyData);
      storeData(PARTNER_DATA_KEY, JSON.stringify(partnerData), allowedStorage, firstPartyData);
    };

    const resp = function (callback: (value: any) => void) {
      const callbacks = {
        success: (response: any) => {
          if (rrttStrtTime && rrttStrtTime > 0) {
            partnerData.rrtt = Date.now() - rrttStrtTime;
          }
          const respJson = tryParse(response) as any;
          // If response is a valid json and should save is true
          if (respJson) {
            partnerData.date = Date.now();
            firstPartyData.sCal = Date.now();
            const defineEmptyDataAndFireCallback = (): void => {
              respJson.data = partnerData.data = runtimeEids = { eids: [] };
              storeFirstPartyData();
              firePartnerCallback();
              callback(runtimeEids);
            };
            if (callbackTimeoutID) clearTimeout(callbackTimeoutID);
            if ('cttl' in respJson) {
              partnerData.cttl = respJson.cttl;
            } else partnerData.cttl = HOURS_72;

            if ('tc' in respJson) {
              // ABTestingConfigurationSource is fixed to 'group' for this build, so the
              // group never depends on the server's termination cause — only store it
              // for downstream reporting (e.g. the analytics adapter).
              partnerData.terminationCause = respJson.tc;
            }
            if ('isOptedOut' in respJson) {
              if (respJson.isOptedOut !== firstPartyData.isOptedOut) {
                firstPartyData.isOptedOut = respJson.isOptedOut;
              }
              if (respJson.isOptedOut === true) {
                respJson.data = partnerData.data = runtimeEids = { eids: [] };

                // Remove client hints entirely; partner data is rewritten below with
                // only terminationCause persisted (handled by storeData when opted out).
                removeDataByKey(CLIENT_HINTS_KEY, allowedStorage);

                storeData(FIRST_PARTY_KEY_FINAL, JSON.stringify(firstPartyData), allowedStorage, firstPartyData);
                storeData(PARTNER_DATA_KEY, JSON.stringify(partnerData), allowedStorage, firstPartyData);
                firePartnerCallback();
                callback(runtimeEids);
                return;
              }
            }
            if ('pid' in respJson) {
              firstPartyData.pid = respJson.pid;
            }
            if ('dbsaved' in respJson) {
              firstPartyData.dbsaved = respJson.dbsaved;
            }
            if ('ls' in respJson) {
              if (respJson.ls === false) {
                defineEmptyDataAndFireCallback();
                return;
              }
              // If data is empty, means we should save as INVALID_ID
              if (respJson.data === '') {
                respJson.data = INVALID_ID;
              } else {
                // If data is a single string, assume it is an id with source intentiq.com
                if (respJson.data && typeof respJson.data === 'string') {
                  respJson.data = { eids: [respJson.data] };
                }
              }
              partnerData.data = respJson.data;
            }

            if ('ct' in respJson) {
              partnerData.clientType = respJson.ct;
            }

            if ('sid' in respJson) {
              partnerData.siteId = respJson.sid;
            }

            if ('spd' in respJson) {
              // server provided data
              partnerData.spd = respJson.spd;
            }

            if ('abTestUuid' in respJson) {
              if ('ls' in respJson && respJson.ls === true) {
                partnerData.abTestUuid = respJson.abTestUuid;
              }
            }

            if (respJson.data?.eids) {
              runtimeEids = respJson.data;
              callback(respJson.data.eids);
              firePartnerCallback();
              const encryptedData = encryptData(JSON.stringify(respJson.data));
              partnerData.data = encryptedData;
            } else {
              callback(runtimeEids);
              firePartnerCallback();
            }
            updateCountersAndStore(runtimeEids, allowedStorage, partnerData);
            storeFirstPartyData();
          } else {
            callback(runtimeEids);
            firePartnerCallback();
          }
        },
        error: (error: any) => {
          logError(MODULE_NAME + ': ID fetch encountered an error', error);
          failCount++;
          updateCountersAndStore(runtimeEids, allowedStorage, partnerData);
          callback(runtimeEids);
        }
      };

      partnerData.wsrvcll = true;
      storeData(PARTNER_DATA_KEY, JSON.stringify(partnerData), allowedStorage, firstPartyData);
      clearCountersAndStore(allowedStorage, partnerData);

      rrttStrtTime = Date.now();

      const sendAjax = (uh: string) => {
        if (uh) url += '&uh=' + encodeURIComponent(uh);
        ajax(url, callbacks, undefined, { method: 'GET', withCredentials: true });
      };

      if (chSupported) {
        if (clientHints) {
          // CH found in LS: send immediately; background fetch will refresh/clear later
          sendAjax(clientHints);
        } else {
          // No CH in LS: wait up to chTimeout, then send
          waitOnCH(chTimeout).then((ch: any) => {
            // Send with received CH or without it
            sendAjax(ch || '');
          });
        }
      } else {
        // CH not supported: send without uh
        sendAjax('');
      }
    };
    const respObj: any = { callback: resp };

    if (runtimeEids?.eids?.length) respObj.id = runtimeEids.eids;
    return respObj;
  },
  eids: {
    [MODULE_NAME]: {
      source: 'intentiq.com',
      atype: 1 as any,
      getSource: function (data: any) {
        return data.source;
      },
      getValue: function (data: any) {
        if (data?.uids?.length) {
          return data.uids[0].id;
        }
        return null;
      },
      getUidExt: function (data: any) {
        if (data?.uids?.length) {
          return data.uids[0].ext;
        }
        return null;
      }
    },
  }
};

submodule('userId', intentIqIdSubmodule);
