// Contract inputs: shared account storage (NerdStorage), with this browser's localStorage as a fallback.
import { AccountStorageQuery, AccountStorageMutation } from 'nr1';
import { STORAGE_ACCOUNT_ID, STORAGE_COLLECTION, STORAGE_DOCUMENT } from './config';

const LOCAL_KEY = `contract-consumption:${STORAGE_ACCOUNT_ID}`;

const readLocal = () => {
  try { return JSON.parse(window.localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { return null; }
};
const writeLocal = cfg => {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; }
};

/** -> { config | null, source: 'account' | 'browser' | 'none' } */
export async function loadConfig() {
  try {
    const res = await AccountStorageQuery.query({ accountId: STORAGE_ACCOUNT_ID, collection: STORAGE_COLLECTION, documentId: STORAGE_DOCUMENT });
    if (res && res.data) return { config: res.data, source: 'account' };
    if (res && res.error) throw res.error;
  } catch (e) { /* fall through to the browser copy */ }
  const local = readLocal();
  return local ? { config: local, source: 'browser' } : { config: null, source: 'none' };
}

/** -> 'account' | 'browser' | 'failed' */
export async function saveConfig(cfg) {
  try {
    const res = await AccountStorageMutation.mutate({
      accountId: STORAGE_ACCOUNT_ID,
      actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
      collection: STORAGE_COLLECTION,
      documentId: STORAGE_DOCUMENT,
      document: cfg
    });
    if (res && res.error) throw res.error;
    writeLocal(cfg);
    return 'account';
  } catch (e) {
    return writeLocal(cfg) ? 'browser' : 'failed';
  }
}
