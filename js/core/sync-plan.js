// Pure helpers for sync.js: what to do on sign-in, and splitting values over Firestore documents.

/** 'replace' when this device last synced for another account, so its data is not merged into this one. */
export const planSignIn = ({ ownerUid, uid }) => (ownerUid && ownerUid !== uid ? 'replace' : 'merge');

/** Firestore documents hold at most 1 MiB; JSON strings are split below that. */
export function chunk(json, max = 900_000) {
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
