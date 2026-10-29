// Pure merge rules for syncing localStorage progress between devices (no DOM, no network).

const DEVICE_ONLY = [/^landjes__/, /^landjes_theme$/, /^landjes_oefenen_collapsed$/, /^landjes_stats_filters$/,
  /^landjes_exam_intro_seen$/, /^landjes_exam_show_feedback$/, /^landjes_picker_v/, /^landjes_alles_oneindig$/, /^landjes_cheat_open_/];

export function isSyncedKey(key) {
  return key.startsWith('landjes_') && !DEVICE_ONLY.some(re => re.test(key));
}

const hasEvents = s => Object.values(s.perCountryStats || {}).some(st => st.events && st.events.length);

/** perGroup totals as finalizeSession in store.js builds them. */
export function recomputePerGroup(sessions) {
  const out = {};
  for (const s of sessions) {
    if (!s.endedAt || !s.totals) continue;
    const g = out[s.groupId] || (out[s.groupId] = { sessionsPlayed: 0, bestAccuracy: 0, totalCorrect: 0, totalIncorrect: 0 });
    g.sessionsPlayed += 1;
    g.bestAccuracy = Math.max(g.bestAccuracy, s.totals.accuracy || 0);
    g.totalCorrect += s.totals.correct || 0;
    g.totalIncorrect += s.totals.incorrect || 0;
  }
  return out;
}

function mergeHistory(a, b) {
  const byId = new Map();
  for (const s of [...(a.sessions || []), ...(b.sessions || [])]) {
    const prev = byId.get(s.id);
    if (!prev || (!hasEvents(prev) && hasEvents(s))) byId.set(s.id, s);
  }
  const sessions = [...byId.values()].sort((x, y) => String(x.startedAt).localeCompare(String(y.startedAt)));
  return { ...b, ...a, version: a.version || b.version || 1, sessions, perGroup: recomputePerGroup(sessions) };
}

const finished = g => !!(g && (g.done || g.endedAt));
const size = g => Math.max(0, ...Object.values(g || {}).map(v => Array.isArray(v) ? v.length : 0));

/** Per date: a finished game beats an unfinished one, otherwise the longer game; ties keep local. */
function pickDay(a, b) {
  if (finished(a) !== finished(b)) return finished(a) ? a : b;
  return size(b) > size(a) ? b : a;
}
function mergeDays(a, b) {
  const out = { ...b };
  for (const [d, v] of Object.entries(a)) out[d] = d in b ? pickDay(v, b[d]) : v;
  return out;
}
function mergeDaily(a, b) {
  const out = { ...b };
  for (const [game, days] of Object.entries(a)) out[game] = mergeDays(days || {}, b[game] || {});
  return out;
}

function mergeStats(a, b) {
  const lead = (b.played || 0) > (a.played || 0) ? b : a;
  return { ...a, ...b, played: Math.max(a.played || 0, b.played || 0), won: Math.max(a.won || 0, b.won || 0),
    best: Math.max(a.best || 0, b.best || 0), streak: lead.streak || 0, guesses: lead.guesses || [] };
}

/**
 * Merges a local and remote value of one synced key. `localAt`/`remoteAt` are the last-change
 * times in ms, used where no smarter rule exists.
 */
export function mergeValue(key, local, remote, localAt, remoteAt) {
  if (local == null) return remote;
  if (remote == null) return local;
  if (key === 'landjes_history_v1') return mergeHistory(local, remote);
  if (key === 'landjes_daily_results') return mergeDaily(local, remote);
  if (/^landjes_.+_days$/.test(key)) return mergeDays(local, remote);
  if (/^landjes_.+_stats(_daily)?$/.test(key)) return mergeStats(local, remote);
  if (key === 'landjes_geotrivia') {
    const newest = remoteAt > localAt ? remote : local;
    return { ...local, ...remote, best: Math.max(local.best || 0, remote.best || 0),
      rounds: Math.max(local.rounds || 0, remote.rounds || 0), cats: newest.cats };
  }
  return remoteAt > localAt ? remote : local;
}

/** Copy of a history without per-question events; mix sessions keep {quizType, result} for progress. */
export function compactHistory(history) {
  return {
    ...history,
    sessions: (history.sessions || []).map(s => ({
      ...s,
      perCountryStats: Object.fromEntries(Object.entries(s.perCountryStats || {}).map(([iso, st]) => {
        const { events, ...rest } = st;
        return [iso, s.quizType === 'mix' && events ? { ...rest, events: events.map(e => ({ quizType: e.quizType, result: e.result })) } : rest];
      }))
    }))
  };
}
