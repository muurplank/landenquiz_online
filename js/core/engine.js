// Quiz engine: picks the next item, records answers, knows when a session is done.
// Mirrors the old behaviour of the quiz_*.js pages:
//  - 'deck': every item once per round (shuffled), then a new round
//  - 'smart': Thompson Sampling, favours items you get wrong
//  - 'tempo': weighted draw on how slow you are per country and skill, kept across sessions (tempo.js)
//  - the session ends when every item was answered correctly at least once,
//    unless it is endless (infinite, "beide kanten" or smart); 'tempo' ends after a fixed number of questions
//
// Whatever the order, every answer also updates the tempo items when a tempo store is given,
// so the times are there from the very first session.

import { startSession, finalizeSession } from './store.js';
import { pickNext, processAnswer, newSession, sessionLength, dayOf, armOf, keyOf } from './tempo.js';

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
  constructor({ ids, groupId, quizType, subMode, picker = 'deck', endless = false, dataset = 'world', retryOnly = false, skills = [], skillCount = skills.length, tempo = null }) {
    this.ids = [...ids];
    this.picker = picker;
    this.endless = endless || picker === 'smart';
    this.retryOnly = retryOnly;   // a new deck holds only what is not answered correctly yet
    this.session = startSession({ groupId, quizType, subMode, dataset });
    this.stats = Object.fromEntries(this.ids.map(id => [id, { iso: id, seen_count: 0, correct_count: 0, incorrect_count: 0, is_mastered: false, events: [] }]));
    this.deck = [];
    this.rounds = 0;
    this.current = null;
    this.skill = skills[0] || null;
    this.t0 = 0;
    this.firstMs = null;   // time to the first key/click/reveal, see mark()
    this.hidden = false;   // the tab was hidden during this question
    this.finished = false;
    this.history = []; // true/false per answer, for the streak strip
    this.tempo = tempo;   // {items, baselines, device, uid, save()}
    if (tempo) {
      this.tsession = newSession(this.ids.length);
      this.limit = sessionLength(this.ids.length, skillCount || 1);   // a chain of steps about one country is one question
      this.candidates = this.ids.flatMap(id => (skills.length ? skills : [null]).map(skill => ({ country: id, skill })));
    }
    this._onHide = () => this.finish();
    this._onVis = () => { if (document.visibilityState === 'hidden') this.hidden = true; };
    window.addEventListener('pagehide', this._onHide);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVis);
  }

  get total() { return this.ids.length; }
  get mastered() { return Object.values(this.stats).filter(s => s.is_mastered).length; }
  get totals() { return this.session.totals; }
  get allMastered() { return this.mastered === this.total; }

  /** Next item id, or null when the session is complete. */
  next() {
    if (this.finished) return null;
    if (this.picker === 'tempo') {
      if (!this.endless && this.totals.questions >= this.limit) { this.finish(); return null; }
      const c = pickNext(this.candidates, this.tempo.items, this.tsession, dayOf(), Math.random, this.tempo.uid);
      this.current = c.country;
      this.skill = c.skill;
    } else if (!this.endless && this.allMastered) { this.finish(); return null; }
    else if (this.picker === 'smart') {
      let best = null, bestScore = Infinity;
      for (const s of Object.values(this.stats)) {
        const score = sampleBeta(s.correct_count + 1, s.incorrect_count + 1);
        if (score < bestScore) { bestScore = score; best = s.iso; }
      }
      this.current = best;
    } else {
      if (!this.deck.length) {
        if (this.current !== null) this.rounds++;
        const open = this.retryOnly ? this.ids.filter(id => !this.stats[id].is_mastered) : [];
        this.deck = shuffle(open.length ? open : this.ids);
      }
      this.current = this.deck.pop();
      this.session.totals.rounds = this.rounds;
    }
    this.ready();
    return this.current;
  }

  /** The stimulus is on screen (map zoomed, flag decoded): the clock starts here. */
  ready() { this.t0 = performance.now(); this.firstMs = null; this.hidden = false; }
  /** First key, click or reveal of this question: the recall itself, without typing the rest. */
  mark() { if (this.firstMs === null) this.firstMs = performance.now() - this.t0; }

  /**
   * Records the answer for the current item (or `id`). For the tempo items, meta may carry
   * skill, answerMode, rtMs, k, editDist, confusable, distKm, cheatOpen, wErr, or `steps`
   * (a list of {skill, correct, answerMode, ...} for a chain of questions about one country).
   */
  answer(correct, { quizType = this.session.quizType, subType = this.session.subMode, id = this.current, ...meta } = {}) {
    const s = this.stats[id];
    if (!s || this.finished) return;
    const now = performance.now();
    const ms = now - this.t0;
    s.seen_count++;
    if (correct) { s.correct_count++; s.is_mastered = true; } else s.incorrect_count++;
    const ev = { timestamp: new Date().toISOString(), quizType, subType, result: correct ? 'correct' : 'incorrect', responseTimeMs: ms };
    if (this.firstMs !== null) ev.firstMs = Math.round(this.firstMs);
    if (meta.answerMode) ev.mode = meta.answerMode;
    if (this.hidden) ev.hidden = true;
    s.events.push(ev);

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

    if (this.tempo) {
      const steps = meta.steps || [{ skill: meta.skill || this.skill, correct, answerMode: meta.answerMode || 'none', k: meta.k, rtMs: meta.rtMs, editDist: meta.editDist, confusable: meta.confusable, distKm: meta.distKm, wErr: meta.wErr }];
      for (const st of steps) {
        if (!st.skill) continue;
        processAnswer({ country: id, device: this.tempo.device, setSize: this.total, hidden: this.hidden, cheatOpen: meta.cheatOpen, tMs: now, ...st, rtMs: st.rtMs ?? this.firstMs ?? ms },
          this.tempo.items, this.tempo.baselines, this.tsession, dayOf());
      }
      if (steps[0] && steps[0].skill) ev.arm = armOf(this.tempo.uid, keyOf(id, steps[0].skill));
      this.tempo.save();
    }
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    window.removeEventListener('pagehide', this._onHide);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVis);
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
