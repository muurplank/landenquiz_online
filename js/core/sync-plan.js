// Pure helpers for sync.js: what to do on sign-in, merging raw values and splitting them over documents.
import { mergeValue, compactHistory } from './merge.js';

/** 'replace' when this device last synced for another account, so its data is not merged into this one. */
export const planSignIn = ({ ownerUid, uid }) => (ownerUid && ownerUid !== uid ? 'replace' : 'merge');

/** Firestore documents hold at most 1 MiB; 400k characters stays below that even for 2-byte text. */
export function chunk(json, max = 400_000) {
  const parts = [];
  for (let i = 0; i < json.length; i += max) parts.push(json.slice(i, i + max));
  return parts.length ? parts : [''];
}

/** Part documents ({id: key or key#n, value, part, parts, updatedAt}) back to {key: {json, updatedAt, parts}}. */
export function unchunk(docs) {
  const groups = {};
  for (const d of docs) {
    const key = d.id.split('#')[0];
    (groups[key] || (groups[key] = [])).push(d);
  }
  const out = {};
  for (const [key, list] of Object.entries(groups)) {
    const parts = list[0].parts || 1;
    list.sort((a, b) => (a.part || 0) - (b.part || 0));
    if (list.length !== parts || list.some((d, i) => (d.part || 0) !== i)) continue;
    out[key] = { json: list.map(d => d.value).join(''), updatedAt: list[0].updatedAt || 0, parts };
  }
  return out;
}

/** The JSON stored in the cloud for a local value (history without per-question events). */
export function cloudJSON(key, raw) {
  if (raw === null || key !== 'landjes_history_v1') return raw;
  try { return JSON.stringify(compactHistory(JSON.parse(raw))); } catch (_) { return raw; }
}

const parse = s => { try { return { ok: true, v: JSON.parse(s) }; } catch (_) { return { ok: false }; } };

/** Merges two raw localStorage strings of one key; null means "no value" (a newer deletion wins). */
export function mergeRaw(key, local, remote, localAt, remoteAt) {
  if (local === null) return localAt > remoteAt ? null : remote;
  if (remote === null) return local;
  const a = parse(local), b = parse(remote);
  if (!a.ok || !b.ok) return remoteAt > localAt ? remote : local;
  return JSON.stringify(mergeValue(key, a.v, b.v, localAt, remoteAt));
}

/**
 * Decides what a sign-in does to this device. local: {key: raw}; remote: {key: {json, updatedAt}};
 * stashes: {uid: {at, values: {key: raw}}} (unpushed values of accounts that used this device before).
 * Returns {writes: {key: raw|null} to apply locally, dirty: keys to push, meta, stashes}.
 */
export function reconcile({ uid, owner, local, remote, meta, dirty, stashes }) {
  const next = {}, push = new Set(), newMeta = { ...meta }, newStashes = { ...stashes };
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  if (planSignIn({ ownerUid: owner, uid }) === 'replace') {
    if (dirty.length) newStashes[owner] = { at: Math.max(0, ...dirty.map(k => meta[k] || 0)), values: Object.fromEntries(dirty.map(k => [k, local[k] ?? null])) };
    for (const k of keys) { next[k] = remote[k] ? remote[k].json : null; newMeta[k] = remote[k] ? remote[k].updatedAt : 0; }
  } else {
    for (const k of keys) {
      const r = remote[k];
      next[k] = mergeRaw(k, local[k] ?? null, r ? r.json : null, meta[k] || 0, r ? r.updatedAt : 0);
      if (cloudJSON(k, next[k]) !== (r ? r.json : null)) push.add(k);
    }
  }
  const mine = newStashes[uid];
  if (mine) {
    for (const [k, v] of Object.entries(mine.values)) {
      next[k] = mergeRaw(k, v, next[k] ?? null, mine.at, newMeta[k] || 0);
      push.add(k);
    }
    delete newStashes[uid];
  }
  const writes = {};
  for (const [k, v] of Object.entries(next)) if (v !== (local[k] ?? null)) writes[k] = v;
  return { writes, dirty: [...push], meta: newMeta, stashes: newStashes };
}
