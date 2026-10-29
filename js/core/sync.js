// Syncs every synced landjes_* localStorage value to users/{uid}/progress for the signed-in player.
// Games keep using localStorage as before: writes are noticed by wrapping Storage.setItem/removeItem.
import { collection, doc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onUser, db } from './account.js';
import { isSyncedKey, mergeValue, compactHistory } from './merge.js';
import { planSignIn, chunk, unchunk } from './sync-plan.js';

const META = 'landjes__sync_meta';     // {key: last local change in ms}
const DIRTY = 'landjes__sync_dirty';   // [keys changed since the last push]
const PARTS = 'landjes__sync_parts';   // {key: number of documents in the cloud}
const OWNER = 'landjes__sync_owner';   // uid this device last synced for
const STASH = 'landjes__sync_stash_';  // + uid: unpushed values of a previous account on this device
const RELOADED = 'landjes__sync_reloaded';

const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
let uid = null, applying = false, timer = null, pushing = null;

const get = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const put = (k, v) => { try { rawSet.call(localStorage, k, v); } catch (_) { /* full or blocked */ } };
const drop = k => { try { rawRemove.call(localStorage, k); } catch (_) { /* blocked */ } };
const getJSON = (k, fb) => { try { return JSON.parse(get(k)) ?? fb; } catch (_) { return fb; } };
const putJSON = (k, v) => put(k, JSON.stringify(v));
const status = state => window.dispatchEvent(new CustomEvent('landjes:sync', { detail: { state } }));

function localKeys() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (isSyncedKey(k)) out.push(k); } } catch (_) { /* blocked */ }
  return out;
}

function markDirty(key) {
  const meta = getJSON(META, {}); meta[key] = Date.now(); putJSON(META, meta);
  const dirty = new Set(getJSON(DIRTY, [])); dirty.add(key); putJSON(DIRTY, [...dirty]);
  if (uid) { clearTimeout(timer); timer = setTimeout(push, 2000); }
}

Storage.prototype.setItem = function (k, v) {
  rawSet.call(this, k, v);
  if (this === localStorage && !applying && isSyncedKey(String(k))) markDirty(String(k));
};
Storage.prototype.removeItem = function (k) {
  rawRemove.call(this, k);
  if (this === localStorage && !applying && isSyncedKey(String(k))) markDirty(String(k));
};

/** The JSON that goes to the cloud for a local value (history without per-question events). */
function cloudJSON(key, raw) {
  if (key !== 'landjes_history_v1') return raw;
  try { return JSON.stringify(compactHistory(JSON.parse(raw))); } catch (_) { return raw; }
}

async function pushNow() {
  const dirty = getJSON(DIRTY, []);
  if (!uid || !dirty.length) return;
  status('syncing');
  const meta = getJSON(META, {}), parts = getJSON(PARTS, {});
  const started = Date.now(), batch = writeBatch(db), col = collection(db, 'users', uid, 'progress');
  const next = {};
  for (const key of dirty) {
    const raw = get(key);
    const pieces = raw === null ? [] : chunk(cloudJSON(key, raw));
    pieces.forEach((value, i) => batch.set(doc(col, i ? `${key}#${i}` : key),
      { value, updatedAt: meta[key] || started, part: i, parts: pieces.length }));
    for (let i = pieces.length; i < (parts[key] || 1); i++) batch.delete(doc(col, i ? `${key}#${i}` : key));
    next[key] = pieces.length;
  }
  await batch.commit();
  const nowMeta = getJSON(META, {});
  putJSON(PARTS, { ...getJSON(PARTS, {}), ...next });
  // Keys changed again while pushing stay dirty for the next round.
  putJSON(DIRTY, getJSON(DIRTY, []).filter(k => !(k in next) || (nowMeta[k] || 0) > started));
  status('idle');
}

export function flush() {
  clearTimeout(timer);
  pushing = (pushing || Promise.resolve()).then(pushNow).catch(e => { status(navigator.onLine ? 'error' : 'offline'); console.warn('Sync mislukt', e); });
  return pushing;
}
const push = flush;

const parse = s => { try { return { ok: true, v: JSON.parse(s) }; } catch (_) { return { ok: false }; } };

/** Merges two raw values of one key; returns the raw string to keep (null = no value). */
function mergeRaw(key, local, remote, localAt, remoteAt) {
  if (local === null) return remote;
  if (remote === null) return local;
  const a = parse(local), b = parse(remote);
  if (!a.ok || !b.ok) return remoteAt > localAt ? remote : local;
  return JSON.stringify(mergeValue(key, a.v, b.v, localAt, remoteAt));
}

function write(key, raw) {
  applying = true;
  try { raw === null ? drop(key) : put(key, raw); } finally { applying = false; }
}

async function syncIn(user) {
  status('syncing');
  const snap = await getDocs(collection(db, 'users', user.uid, 'progress'));
  const remote = unchunk(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  const meta = getJSON(META, {}), dirty = new Set(getJSON(DIRTY, []));
  const owner = get(OWNER);
  let changed = false;

  if (planSignIn({ ownerUid: owner, uid: user.uid }) === 'replace') {
    // Keep what the previous account had not pushed yet, for when it signs in again.
    if (dirty.size) putJSON(STASH + owner, Object.fromEntries([...dirty].map(k => [k, get(k)])));
    for (const k of localKeys()) if (!(k in remote)) { write(k, null); changed = true; }
    for (const [k, r] of Object.entries(remote)) if (get(k) !== r.json) { write(k, r.json); changed = true; }
    dirty.clear();
    putJSON(META, Object.fromEntries(Object.entries(remote).map(([k, r]) => [k, r.updatedAt])));
  } else {
    const stash = getJSON(STASH + user.uid, null);
    const keys = new Set([...localKeys(), ...Object.keys(remote), ...Object.keys(stash || {})]);
    for (const k of keys) {
      const r = remote[k];
      let local = get(k);
      if (stash && k in stash) local = mergeRaw(k, local, stash[k], meta[k] || 0, meta[k] || 0);
      const merged = mergeRaw(k, local, r ? r.json : null, meta[k] || 0, r ? r.updatedAt : 0);
      if (merged !== get(k)) { write(k, merged); changed = true; }
      if (merged !== null && (!r || cloudJSON(k, merged) !== r.json)) dirty.add(k);
    }
    if (stash) drop(STASH + user.uid);
  }
  putJSON(PARTS, Object.fromEntries(Object.entries(remote).map(([k, r]) => [k, r.parts])));
  putJSON(DIRTY, [...dirty]);
  put(OWNER, user.uid);
  uid = user.uid;
  await flush();
  status('idle');
  // Open pages read localStorage once; show the merged progress (once per browser session).
  let reloaded = null;
  try { reloaded = sessionStorage.getItem(RELOADED); } catch (_) { /* blocked */ }
  if (changed && reloaded !== user.uid) {
    try { sessionStorage.setItem(RELOADED, user.uid); } catch (_) { /* blocked */ }
    location.reload();
  }
}

onUser(user => {
  if (!user) { uid = null; return; }
  if (uid === user.uid) return;
  syncIn(user).catch(e => { status(navigator.onLine ? 'error' : 'offline'); console.warn('Sync mislukt', e); });
});

addEventListener('pagehide', () => { if (uid) flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && uid) flush(); });
