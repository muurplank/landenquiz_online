// Quiz engine: picks the next item, records answers, knows when a session is done.
// Mirrors the old behaviour of the quiz_*.js pages:
//  - 'deck': every item once per round (shuffled), then a new round
//  - 'smart': Thompson Sampling, favours items you get wrong
//  - the session ends when every item was answered correctly at least once,
//    unless it is endless (infinite, "beide kanten" or smart)

import { startSession, finalizeSession } from './store.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function sampleBeta(alpha, beta) {
  const gamma = shape => {
    if (shape < 1) return gamma(1 + shape) * Math.pow(Math.random(), 1 / shape);
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const x = gamma(alpha), y = gamma(beta);
  return x / (x + y);
}

export class QuizEngine {
  constructor({ ids, groupId, quizType, subMode, picker = 'deck', endless = false, dataset = 'world' }) {
    this.ids = [...ids];
    this.picker = picker;
    this.endless = endless || picker === 'smart';
    this.session = startSession({ groupId, quizType, subMode, dataset });
    this.stats = Object.fromEntries(this.ids.map(id => [id, { iso: id, seen_count: 0, correct_count: 0, incorrect_count: 0, is_mastered: false, events: [] }]));
    this.deck = [];
    this.rounds = 0;
    this.current = null;
    this.t0 = 0;
    this.finished = false;
    this.history = []; // true/false per answer, for the streak strip
    this._onHide = () => this.finish();
    window.addEventListener('pagehide', this._onHide);
  }

  get total() { return this.ids.length; }
  get mastered() { return Object.values(this.stats).filter(s => s.is_mastered).length; }
  get totals() { return this.session.totals; }
  get allMastered() { return this.mastered === this.total; }

  /** Next item id, or null when the session is complete. */
  next() {
    if (this.finished) return null;
    if (!this.endless && this.allMastered) { this.finish(); return null; }
    if (this.picker === 'smart') {
      let best = null, bestScore = Infinity;
      for (const s of Object.values(this.stats)) {
        const score = sampleBeta(s.correct_count + 1, s.incorrect_count + 1);
        if (score < bestScore) { bestScore = score; best = s.iso; }
      }
      this.current = best;
    } else {
      if (!this.deck.length) {
        if (this.current !== null) this.rounds++;
        this.deck = shuffle(this.ids);
      }
      this.current = this.deck.pop();
      this.session.totals.rounds = this.rounds;
    }
    this.t0 = performance.now();
    return this.current;
  }

  /** Records the answer for the current item (or `id`). */
  answer(correct, { quizType = this.session.quizType, subType = this.session.subMode, id = this.current } = {}) {
    const s = this.stats[id];
    if (!s || this.finished) return;
    const ms = performance.now() - this.t0;
    s.seen_count++;
    if (correct) { s.correct_count++; s.is_mastered = true; } else s.incorrect_count++;
    s.events.push({ timestamp: new Date().toISOString(), quizType, subType, result: correct ? 'correct' : 'incorrect', responseTimeMs: ms });

    const t = this.session.totals;
    t.questions++;
    t.totalResponseTimeMs += ms;
    t.avgResponseTimeMs = t.totalResponseTimeMs / t.questions;
    if (correct) {
      t.correct++;
      t.correctByType[quizType] = (t.correctByType[quizType] || 0) + 1;
      t.streakEnd++;
      t.streakBest = Math.max(t.streakBest, t.streakEnd);
    } else {
      t.incorrect++;
      t.streakEnd = 0;
    }
    this.session.perCountryStats[id] = s;
    this.history.push(correct);
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    window.removeEventListener('pagehide', this._onHide);
    finalizeSession(this.session);
  }

  /** Downloads the full history as JSON (the old "Download log" button). */
  static downloadLog(history) {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'landjes_history.json' });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }
}
