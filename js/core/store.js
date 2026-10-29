// Session history in localStorage. Same key and shape as the old app (js/app.js),
// so existing progress and statistics keep working.

const HISTORY_KEY = 'landjes_history_v1';
const empty = () => ({ version: 1, sessions: [], perGroup: {} });

export function loadHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || 'null') || empty();
    h.version = h.version || 1;
    h.sessions = h.sessions || [];
    h.perGroup = h.perGroup || {};
    return h;
  } catch (e) {
    console.error('Geschiedenis onleesbaar, begin opnieuw.', e);
    return empty();
  }
}

export function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch (e) {
    // Quota vol: gooi de per-vraag-events van de oudste sessies weg en probeer opnieuw.
    for (const s of history.sessions) {
      Object.values(s.perCountryStats || {}).forEach(st => { if (st.events && st.events.length) st.events = []; });
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); return true; } catch (_) { /* nog te vol */ }
    }
    console.error('Kon geschiedenis niet opslaan.', e);
    return false;
  }
}

export function clearHistory() { saveHistory(empty()); }

export function startSession({ groupId, quizType, subMode, dataset = 'world' }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    dataset,
    groupId,
    quizType,
    subMode,
    startedAt: new Date().toISOString(),
    endedAt: null,
    perCountryStats: {},
    totals: {
      questions: 0, correct: 0, incorrect: 0, accuracy: 0,
      totalResponseTimeMs: 0, avgResponseTimeMs: null,
      streakBest: 0, streakEnd: 0, rounds: 0,
      correctByType: { capital: 0, flag: 0, map: 0 }
    }
  };
}

/** Saves a finished session. Sessions without any answered question are not stored. */
export function finalizeSession(session) {
  if (!session || session.endedAt || !session.totals.questions) return;
  session.endedAt = new Date().toISOString();
  const t = session.totals;
  t.accuracy = t.correct / t.questions;
  t.avgResponseTimeMs = t.totalResponseTimeMs / t.questions;

  const history = loadHistory();
  history.sessions.push(session);
  const g = history.perGroup[session.groupId] || { sessionsPlayed: 0, bestAccuracy: 0, totalCorrect: 0, totalIncorrect: 0 };
  g.sessionsPlayed += 1;
  g.bestAccuracy = Math.max(g.bestAccuracy, t.accuracy);
  g.totalCorrect += t.correct;
  g.totalIncorrect += t.incorrect;
  history.perGroup[session.groupId] = g;
  saveHistory(history);
}

/**
 * Progress per group in percent per type (capital, flag, map), as in the old
 * getGroupProgress: a country counts once it was answered correctly at least once.
 * "Beide kanten" sessions of capital/flag do not count.
 */
export function groupProgress(groupId, ids, history = loadHistory()) {
  const idSet = new Set(ids);
  const mastered = { capital: new Set(), flag: new Set(), map: new Set() };
  for (const s of history.sessions) {
    if (!s.endedAt || s.groupId !== groupId) continue;
    const type = s.quizType;
    if ((type === 'capital' || type === 'flag') && s.subMode === 'both') continue;
    for (const [iso, st] of Object.entries(s.perCountryStats || {})) {
      if (!idSet.has(iso)) continue;
      if (mastered[type]) { if ((st.correct_count || 0) >= 1) mastered[type].add(iso); }
      else if (type === 'mix') (st.events || []).forEach(e => { if (mastered[e.quizType] && e.result === 'correct') mastered[e.quizType].add(iso); });
    }
  }
  const pct = set => ids.length ? Math.round(set.size / ids.length * 100) : 0;
  return { capital: pct(mastered.capital), flag: pct(mastered.flag), map: pct(mastered.map) };
}
