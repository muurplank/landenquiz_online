// Syncs every synced landjes_* localStorage value to users/{uid}/progress for the signed-in player.
// Games keep using localStorage as before: writes are noticed by wrapping Storage.setItem/removeItem.
import { collection, doc, getDoc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onUser, db, auth } from './account.js';
import { isSyncedKey } from './merge.js';
import { chunk, unchunk, cloudJSON, mergeRaw, reconcile } from './sync-plan.js';

const META = 'landjes__sync_meta';       // {key: last local change in ms}
const DIRTY = 'landjes__sync_dirty';     // [keys changed since the last push]
const PARTS = 'landjes__sync_parts';     // {key: number of documents in the cloud}
const OWNER = 'landjes__sync_owner';     // uid this device last synced for
const STASHES = 'landjes__sync_stashes'; // {uid: {at, values}}: unpushed values of earlier accounts here
const PULLED = 'landjes__sync_pulled';   // {uid, at}: last full download
const JUST_IN = 'landjes__just_signed_in';
const PULL_EVERY = 5 * 60 * 1000;

const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
let uid = null, applying = false, timer = null, chain = Promise.resolve(), syncing = null;

const get = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const put = (k, v) => { try { rawSet.call(localStorage, k, v); return true; } catch (_) { return false; } };
const drop = k => { try { rawRemove.call(localStorage, k); } catch (_) { /* blocked */ } };
const getJSON = (k, fb) => { try { return JSON.parse(get(k)) ?? fb; } catch (_) { return fb; } };
const putJSON = (k, v) => put(k, JSON.stringify(v));
const status = state => window.dispatchEvent(new CustomEvent('landjes:sync', { detail: { state } }));
const failed = e => { status(navigator.onLine ? 'error' : 'offline'); console.warn('Sync mislukt', e); };

function localValues() {
  const out = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (isSyncedKey(k)) out[k] = localStorage.getItem(k); } } catch (_) { /* blocked */ }
  return out;
}

function markDirty(key) {
  const meta = getJSON(META, {}); meta[key] = Date.now(); putJSON(META, meta);
  const dirty = new Set(getJSON(DIRTY, [])); dirty.add(key); putJSON(DIRTY, [...dirty]);
  if (uid) { clearTimeout(timer); timer = setTimeout(flush, 2000); }
}

Storage.prototype.setItem = function (k, v) {
  rawSet.call(this, k, v);
  if (this === localStorage && !applying && isSyncedKey(String(k))) markDirty(String(k));
};
Storage.prototype.removeItem = function (k) {
  rawRemove.call(this, k);
  if (this === localStorage && !applying && isSyncedKey(String(k))) markDirty(String(k));
};

function write(key, raw) {
  applying = true;
  try { raw === null ? drop(key) : put(key, raw); } finally { applying = false; }
}

const partId = (key, i) => (i ? `${key}#${i}` : key);

/** Reads one key from the cloud (all its parts); null when it has no value there. */
async function readRemote(col, key) {
  const first = await getDoc(doc(col, key));
  if (!first.exists()) return null;
  const docs = [{ id: key, ...first.data() }];
  for (let i = 1; i < (first.data().parts || 1); i++) {
    const d = await getDoc(doc(col, partId(key, i)));
    if (d.exists()) docs.push({ id: d.id, ...d.data() });
  }
  return unchunk(docs)[key] || null;
}

/** Pushes dirty keys; each is merged with the cloud copy first, so another device's push is not lost. */
async function pushNow() {
  const dirty = getJSON(DIRTY, []);
  if (!uid || !dirty.length) return;
  status('syncing');
  const me = uid, col = collection(db, 'users', me, 'progress'), started = Date.now();
  const meta = getJSON(META, {}), parts = getJSON(PARTS, {}), batch = writeBatch(db), next = {};
  for (const key of dirty) {
    const r = await readRemote(col, key);
    const merged = mergeRaw(key, get(key), r ? r.json : null, meta[key] || started, r ? r.updatedAt : 0);
    if (merged !== get(key)) write(key, merged);
    const pieces = merged === null ? [] : chunk(cloudJSON(key, merged));
    pieces.forEach((value, i) => batch.set(doc(col, partId(key, i)), { value, updatedAt: meta[key] || started, part: i, parts: pieces.length }));
    for (let i = pieces.length; i < Math.max(parts[key] || 0, r ? r.parts : 0, 1); i++) batch.delete(doc(col, partId(key, i)));
    next[key] = pieces.length;
  }
  if (uid !== me) return;
  await batch.commit();
  const nowMeta = getJSON(META, {});
  putJSON(PARTS, { ...getJSON(PARTS, {}), ...next });
  // Keys changed again while pushing stay dirty for the next round.
  putJSON(DIRTY, getJSON(DIRTY, []).filter(k => !(k in next) || (nowMeta[k] || 0) > started));
  status('idle');
}

export function flush() {
  clearTimeout(timer);
  chain = chain.then(pushNow).catch(failed);
  return chain;
}

/** Full download + merge (or replace, when another account used this device last). */
async function syncIn(user) {
  status('syncing');
  const snap = await getDocs(collection(db, 'users', user.uid, 'progress'));
  if (!auth.currentUser || auth.currentUser.uid !== user.uid) return false;
  const remote = unchunk(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  const local = localValues();
  const plan = reconcile({ uid: user.uid, owner: get(OWNER), local, remote, meta: getJSON(META, {}), dirty: getJSON(DIRTY, []), stashes: getJSON(STASHES, {}) });
  // Keep the previous account's unpushed progress; if it cannot be kept, change nothing.
  if (!putJSON(STASHES, plan.stashes)) throw new Error('Geen ruimte om de voortgang van het vorige account te bewaren.');
  for (const [k, v] of Object.entries(plan.writes)) write(k, v);
  putJSON(META, plan.meta);
  putJSON(PARTS, Object.fromEntries(Object.entries(remote).map(([k, r]) => [k, r.parts])));
  putJSON(DIRTY, plan.dirty);
  put(OWNER, user.uid);
  putJSON(PULLED, { uid: user.uid, at: Date.now() });
  return Object.keys(plan.writes).length > 0;
}

async function start(user) {
  const pulled = getJSON(PULLED, {});
  const fresh = get(OWNER) === user.uid && pulled.uid === user.uid && Date.now() - pulled.at < PULL_EVERY;
  const changed = fresh ? false : await syncIn(user);
  uid = user.uid;
  await flush();
  status('idle');
  let justIn = false;   // read late: the dialog marks the sign-in only after its call resolves
  try { justIn = sessionStorage.getItem(JUST_IN) === user.uid; sessionStorage.removeItem(JUST_IN); } catch (_) { /* blocked */ }
  // Pages read localStorage once; right after signing in, show the merged progress.
  if (changed && justIn) location.reload();
  else if (changed) window.dispatchEvent(new CustomEvent('landjes:synced'));
}

onUser(user => {
  // Sync only once the player has a name: a failed sign-up (name taken) never touches this device.
  if (!user || !user.name) { if (!user) uid = null; return; }
  if (uid === user.uid || syncing) return;
  syncing = start(user).catch(failed).finally(() => { syncing = null; });
});

/** Called by the sign-in dialog after a successful sign-in, so the first sync reloads the page. */
export function markSignedIn() {
  try { sessionStorage.setItem(JUST_IN, auth.currentUser ? auth.currentUser.uid : ''); } catch (_) { /* blocked */ }
}

addEventListener('pagehide', () => { if (uid) flush(); });
addEventListener('online', () => { if (uid) flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && uid) flush(); });
