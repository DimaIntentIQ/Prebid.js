import {isPlainObject} from '../../src/utils.js';

export function setPPID({ runtimeEids, gamObjectReference, shouldSetPPID, isBlacklisted }) {
  if (isBlacklisted) return;
  if (!shouldSetPPID) return;

  if (!isPlainObject(gamObjectReference) || !gamObjectReference.cmd) return;

  const eids = runtimeEids?.eids;
  if (!Array.isArray(eids) || !eids.length) return;

  const iiqBlock = eids.find(e => e?.source === 'intentiq.com');
  const uids = iiqBlock?.uids;
  if (!Array.isArray(uids) || !uids.length) return;

  let ppuid;
  for (const uid of uids) {
    if (uid?.ext?.stype === 'ppuid' && typeof uid.id === 'string' && uid.id) {
      ppuid = uid.id;
    }
  }
  if (!ppuid) return;

  gamObjectReference.cmd.push(() => {
    gamObjectReference.pubads().setPublisherProvidedId(ppuid);
  });
}
