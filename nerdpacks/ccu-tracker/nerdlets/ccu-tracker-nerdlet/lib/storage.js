// Budgets: shared account storage (NerdStorage), with this browser's localStorage as a fallback.
import { AccountStorageQuery, AccountStorageMutation } from 'nr1';
import { STORAGE_ACCOUNT_ID, STORAGE_COLLECTION, STORAGE_DOCUMENT } from './config';

const LOCAL_KEY = `ccu-tracker:${STORAGE_ACCOUNT_ID}`;
export const EMPTY_BUDGET = { core: { perUser: '', total: '' }, adv: { perUser: '', total: '' } };

const readLocal = () => {
  try { return JSON.parse(window.localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { return null; }
};
const writeLocal = cfg => {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; }
};

/** Fill anything a saved document is missing. */
export function mergeBudget(saved) {
  const out = {};
  ['core', 'adv'].forEach(s => { out[s] = { ...EMPTY_BUDGET[s], ...((saved || {})[s] || {}) }; });
  return out;
}

/** -> { budget, source: 'account' | 'browser' | 'none' } */
export async function loadBudget() {
  try {
    const res = await AccountStorageQuery.query({ accountId: STORAGE_ACCOUNT_ID, collection: STORAGE_COLLECTION, documentId: STORAGE_DOCUMENT });
    if (res && res.data) return { budget: mergeBudget(res.data), source: 'account' };
    if (res && res.error) throw res.error;
  } catch (e) { /* fall through to the browser copy */ }
  const local = readLocal();
  return local ? { budget: mergeBudget(local), source: 'browser' } : { budget: mergeBudget(null), source: 'none' };
}

/** -> 'account' | 'browser' | 'failed' */
export async function saveBudget(budget) {
  try {
    const res = await AccountStorageMutation.mutate({
      accountId: STORAGE_ACCOUNT_ID,
      actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
      collection: STORAGE_COLLECTION,
      documentId: STORAGE_DOCUMENT,
      document: budget
    });
    if (res && res.error) throw res.error;
    writeLocal(budget);
    return 'account';
  } catch (e) {
    return writeLocal(budget) ? 'browser' : 'failed';
  }
}

// Users whose access is paused, keyed by lower-cased email. Account storage only: the saved groups are the only way to
// restore access, so there is deliberately no browser fallback (it would not be there for the next admin).
const PAUSED_DOCUMENT = 'paused';

/** -> { email: { userId, email, groups: [{ id, displayName }], pausedAt, pausedBy } } */
export async function loadPaused() {
  const res = await AccountStorageQuery.query({ accountId: STORAGE_ACCOUNT_ID, collection: STORAGE_COLLECTION, documentId: PAUSED_DOCUMENT });
  if (res && res.error) throw res.error;
  return (res && res.data) || {};
}

/** Throws if the write fails. */
export async function savePaused(paused) {
  const res = await AccountStorageMutation.mutate({
    accountId: STORAGE_ACCOUNT_ID,
    actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
    collection: STORAGE_COLLECTION,
    documentId: PAUSED_DOCUMENT,
    document: paused
  });
  if (res && res.error) throw res.error;
}
