// Quiz page: one layout for every quiz type. The mode module fills the question card;
// this file owns the header, session stats, cheat sheet, keyboard and end screen.
//
// URL: quiz.html?set=<groupId>&type=capital|flag|map|mix|kwartet|history&dir=a|b|both
//      &ans=self|type|pick|click&order=deck|smart&infinite=1&mix=std|mega|own&custom=a,b

import { loadDataset, getGroup, shortTitle, siteUrl } from '../core/data.js';
import { QuizEngine } from '../core/engine.js';
import { loadHistory } from '../core/store.js';
import { escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I, prefs } from '../ui/shell.js';

const params = Object.fromEntries(new URLSearchParams(location.search));
const page = document.getElementById('page');
const MODE_LOADERS = {
  capital: () => import('./flashcard.js'),
  flag: () => import('./flashcard.js'),
  map: () => import('./mapquiz.js'),
  mix: () => import('./mix.js'),
  kwartet: () => import('./kwartet.js'),
  history: () => import('./history.js'),
  outline: () => import('./outline.js')
};

renderTopbar(document.getElementById('topbar'), { current: 'oefenen', dataset: params.dataset || 'world' });

(async function main() {
  let ds, group, mode;
  try {
    ds = await loadDataset(params.dataset || 'world');
    group = await getGroup(ds, params.set);
    const load = MODE_LOADERS[params.type];
    if (!load) throw new Error('Onbekende quizvorm.');
    mode = await (await load()).createMode({ ds, group, params });
  } catch (e) {
    page.innerHTML = `<div class="card" style="padding:24px"><h1 style="font-size:22px">Quiz kon niet starten</h1><p class="muted" style="margin-top:6px">${esc(e.message)}</p><p style="margin-top:14px"><a class="btn" href="${siteUrl('wereld.html')}">Terug naar het overzicht</a></p></div>`;
    console.error(e);
    return;
  }
  run(ds, group, mode);
})();

function run(ds, group, mode) {
  const ids = mode.ids || group.countries.filter(id => ds.items.has(id));
  const engine = new QuizEngine({
    ids, groupId: group.id, dataset: ds.name,
    quizType: mode.quizType, subMode: mode.subMode,
    picker: params.order === 'smart' ? 'smart' : 'deck',
    endless: params.infinite === '1' || mode.endless
  });
  const backUrl = siteUrl(`set.html?id=${encodeURIComponent(group.id)}${ds.name !== 'world' ? '&dataset=' + ds.name : ''}`);
  const cheatKey = `landjes_cheat_open_${mode.quizType}`;
  let menuOpen = false;
  let flashTimer = null;

  document.title = `${mode.title} · ${shortTitle(group)} — Land Trainer`;
  page.innerHTML = `
    <div class="quiz-head">
      <a class="icon-btn" href="${backUrl}" aria-label="Terug naar de set">${I.back}</a>
      <div class="t"><h1>${esc(mode.title)}</h1><p>${esc(mode.label)} · ${esc(shortTitle(group))}</p></div>
      <div style="display:flex;gap:12px;align-items:center">
        <div class="deck"><span>Deck<b class="tabnum" id="deck-txt"></b></span><div class="meter ok"><i id="deck-bar"></i></div></div>
        <div class="menu-wrap">
          <button class="icon-btn" id="menu-btn" aria-label="Meer opties" aria-expanded="false">${I.dots}</button>
          <div class="card menu" id="menu" hidden>
            <button data-menu="log">Download log (JSON)</button>
            <button data-menu="restart">Opnieuw beginnen</button>
          </div>
        </div>
      </div>
    </div>
    <div class="quiz-grid ${mode.wide ? 'wide' : ''}">
      <article class="card qcard" id="qcard"></article>
      <aside class="side" aria-label="Deze sessie">
        <div class="tiles">
          <div class="card tile"><span class="v" id="s-q">0</span><span class="k">Vragen</span></div>
          <div class="card tile"><span class="v" id="s-acc">0%</span><span class="k">Goed</span></div>
          <div class="card tile"><span class="v" id="s-time">–</span><span class="k">Gem. tijd</span></div>
          <div class="card tile"><span class="v" id="s-rounds">0</span><span class="k">Rondes</span></div>
        </div>
        <div class="card streak">
          <div style="display:grid;gap:6px;flex:1;min-width:0">
            <span style="font-size:13px"><b id="s-streak">Reeks 0</b> <span class="muted" id="s-best">· beste 0</span></span>
            <div class="dots2" id="s-dots" aria-hidden="true"></div>
          </div>
        </div>
        ${mode.sideHtml ? mode.sideHtml() : ''}
      </aside>
    </div>
    ${mode.cheatItem ? `<section class="card learn cheat ${prefs.get(cheatKey, true) ? '' : 'closed'}" id="cheat" aria-label="Spiekbrief">
      <div class="learn-head"><button id="cheat-toggle" aria-expanded="${prefs.get(cheatKey, true)}">${I.chev} Spiekbrief</button>
        <div class="search" style="padding:0;border:0;max-width:260px;flex:1"><span style="position:relative;display:block">${I.search.replace('<svg', '<svg style="left:12px"')}<input id="cheat-search" placeholder="Zoek…" autocomplete="off" aria-label="Zoek in spiekbrief"></span></div>
      </div>
      <div class="learn-body cheat-body"><div class="cheat-grid" id="cheat-grid"></div></div>
    </section>` : ''}`;

  const card = document.getElementById('qcard');
  const $ = id => document.getElementById(id);

  // ---------- Header, stats, menu ----------
  function updateStats() {
    const t = engine.totals;
    $('deck-txt').textContent = `${engine.mastered}/${engine.total} beheerst`;
    $('deck-bar').style.width = `${engine.mastered / engine.total * 100}%`;
    $('s-q').textContent = t.questions;
    $('s-acc').textContent = `${t.questions ? Math.round(t.correct / t.questions * 100) : 0}%`;
    $('s-time').textContent = t.avgResponseTimeMs ? `${(t.avgResponseTimeMs / 1000).toFixed(1).replace('.', ',')} s` : '–';
    $('s-rounds').textContent = engine.picker === 'smart' ? '–' : engine.rounds;
    $('s-streak').textContent = `Reeks ${t.streakEnd}`;
    $('s-best').textContent = `· beste ${t.streakBest}`;
    const last = engine.history.slice(-22);
    $('s-dots').innerHTML = Array.from({ length: 22 }, (_, i) => `<i class="${last[i] === true ? 'g' : last[i] === false ? 'r' : ''}"></i>`).join('');
  }

  $('menu-btn').addEventListener('click', () => {
    menuOpen = !menuOpen;
    $('menu').hidden = !menuOpen;
    $('menu-btn').setAttribute('aria-expanded', menuOpen);
  });
  $('menu').addEventListener('click', e => {
    const b = e.target.closest('[data-menu]'); if (!b) return;
    if (b.dataset.menu === 'log') QuizEngine.downloadLog(loadHistory());
    if (b.dataset.menu === 'restart') { engine.finish(); location.reload(); }
    menuOpen = false; $('menu').hidden = true;
  });
  document.addEventListener('click', e => { if (menuOpen && !e.target.closest('.menu-wrap')) { menuOpen = false; $('menu').hidden = true; } });

  // ---------- Cheat sheet ----------
  if (mode.cheatItem) {
    const sorted = [...ids].sort((a, b) => ds.items.get(a).name.localeCompare(ds.items.get(b).name, 'nl'));
    const fold = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const renderCheat = () => {
      const q = fold($('cheat-search').value.trim());
      $('cheat-grid').innerHTML = sorted.map(id => ds.items.get(id))
        .filter(it => !q || fold(it.name + ' ' + it.answers.join(' ')).includes(q))
        .map(it => mode.cheatItem(it)).join('');
    };
    $('cheat-search').addEventListener('input', renderCheat);
    $('cheat-toggle').addEventListener('click', () => {
      const open = $('cheat').classList.toggle('closed') === false;
      $('cheat-toggle').setAttribute('aria-expanded', open);
      prefs.set(cheatKey, open);
    });
    renderCheat();
  }

  // ---------- Question flow ----------
  const api = {
    ds, group, engine, card, params,
    /** Called by the mode when the user answered. */
    answered(correct, meta = {}) {
      engine.answer(correct, meta);
      updateStats();
      card.classList.remove('flash-ok', 'flash-bad');
      void card.offsetWidth;
      card.classList.add(correct ? 'flash-ok' : 'flash-bad');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => card.classList.remove('flash-ok', 'flash-bad'), 450);
    },
    next
  };

  function next() {
    const id = engine.next();
    if (id === null) return showDone();
    mode.show(id, api, engine.totals.questions + 1);
  }

  function showDone() {
    const t = engine.totals;
    const acc = t.questions ? Math.round(t.correct / t.questions * 100) : 0;
    card.innerHTML = `
      <div class="done">
        <div class="done-icon">${I.check}</div>
        <h2>Alles beheerst</h2>
        <p class="muted">Je hebt alle ${engine.total} ${esc(ds.noun.many)} minstens één keer goed. ${t.questions} vragen, ${acc}% goed in één keer.</p>
        <div class="qactions"><a class="btn lg" href="${backUrl}">Terug naar de set</a><button class="btn lg primary" id="again">Nog een keer</button></div>
      </div>`;
    $('again').addEventListener('click', () => location.reload());
    mode.onDone && mode.onDone(api);
  }

  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    mode.onKey && mode.onKey(e, api);
  });

  updateStats();
  mode.start ? mode.start(api).then(next) : next();
}
