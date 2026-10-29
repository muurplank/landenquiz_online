// Main page: choose the world or the US states, or one of the games.
import { loadDataset, siteUrl } from '../core/data.js';
import { loadHistory } from '../core/store.js';
import { renderTopbar, I } from '../ui/shell.js';
import { DAILY_GAMES, results, today, msToMidnight } from '../games/daily.js';

renderTopbar(document.getElementById('topbar'), { current: 'hub' });
const page = document.getElementById('page');

const ICONS = {
  cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M7 14h10"/></svg>',
};

const MORE = [
  { href: 'exam.html', icon: ICONS.cap, t: 'Het Grote Eindexamen', d: '588 vragen over alle 196 landen, met een seed om tegen elkaar te spelen.' },
  { href: 'sporcle.html', icon: ICONS.keyboard, t: 'Typ ze allemaal', d: 'Alle landen, hoofdsteden of vlaggen uit je hoofd typen tegen de klok.' }
];
const DAILY_ICON = { warmkoud: '🌡️', silhouet: '🗺️', grensroute: '🧭', geotrivia: '⚡', kompas: '📍' };

function dailyCard(g) {
  const r = results(g.id)[today()];
  const isNew = (Date.parse(today()) - Date.parse(g.since)) / 864e5 < 7;
  const status = r && r.done ? (r.won ? 'Vandaag gespeeld' : 'Vandaag geprobeerd') : 'Nog niet gespeeld';
  return `<div class="daily">
    ${isNew && !(r && r.done) ? '<span class="daily-new">Nieuw</span>' : ''}
    <span class="daily-icon" aria-hidden="true">${DAILY_ICON[g.id]}</span>
    <span class="daily-title">${g.title}</span>
    <span class="daily-sub">${g.sub}</span>
    <span class="daily-status${r && r.done ? ' done' : ''}">${r && r.done ? I.check.replace('<svg', '<svg width="13" height="13"') + ' ' : ''}${status}</span>
    <a class="btn primary lg daily-play" href="${siteUrl(g.href)}" aria-label="${g.title}: spel van vandaag spelen">${r && r.done ? 'Bekijk resultaat' : 'Speel vandaag'}</a>
    <div class="daily-links">
      <a href="${siteUrl(g.href + '?mode=random')}">🎲 Willekeurige ronde</a>
      <a href="${siteUrl('archief.html?game=' + g.id)}">Archief</a>
    </div>
  </div>`;
}

function countdown() {
  const ms = msToMidnight();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(Math.floor(ms / 36e5))}:${pad(Math.floor(ms / 6e4) % 60)}:${pad(Math.floor(ms / 1e3) % 60)}`;
}


(async () => {
  let mastered = 0, total = 196, usDone = 0;
  try {
    const ds = await loadDataset('world');
    total = ds.items.size;
    const done = new Set();
    for (const s of loadHistory().sessions) {
      if (!s.endedAt || (s.dataset && s.dataset !== 'world')) continue;
      for (const [id, st] of Object.entries(s.perCountryStats || {})) if (st.correct_count > 0 && ds.items.has(id)) done.add(id);
    }
    mastered = done.size;
    const us = new Set();
    for (const s of loadHistory().sessions) {
      if (!s.endedAt || s.dataset !== 'us') continue;
      for (const [id, st] of Object.entries(s.perCountryStats || {})) if (st.correct_count > 0) us.add(id);
    }
    usDone = us.size;
  } catch (_) { /* show the page without progress */ }

  page.innerHTML = `
    <section class="hub-hero">
      <div class="eyebrow">Land Trainer</div>
      <h1>Wat ga je vandaag <em>leren</em>?</h1>
      <p>Oefen per week of per regio, of test jezelf met een van de spellen.</p>
    </section>
    <section class="hub-main" aria-label="Oefensets">
      <a class="world-card w" href="${siteUrl('wereld.html')}">
        <div class="world-art w" aria-hidden="true" data-art="art-globe.svg"></div>
        <div style="display:grid;gap:10px;position:relative">
          <div class="meta"><span>🌍 16 weken · 6 continenten</span></div>
          <h2>De wereld</h2>
          <p>${total} landen met hoofdsteden, vlaggen en ligging.</p>
        </div>
        <div class="go">
          <div class="prog"><span>${mastered ? `<strong>${mastered} van ${total}</strong> landen minstens één keer goed` : 'Nog niet begonnen'}</span><div class="bar"><i style="width:${mastered / total * 100}%"></i></div></div>
          <b>Oefenen ${I.arrow}</b>
        </div>
      </a>
      <a class="world-card us" href="${siteUrl('wereld.html?dataset=us')}">
        <div class="world-art us" aria-hidden="true" data-art="art-us.svg"></div>
        <div style="display:grid;gap:10px;position:relative">
          <div class="meta"><span>🇺🇸 5 weken</span></div>
          <h2>Amerikaanse staten</h2>
          <p>Alle 50 staten met hoofdsteden en staatsvlaggen.</p>
        </div>
        <div class="go">
          <div class="prog"><span>${usDone ? `<strong>${usDone} van 50</strong> staten minstens één keer goed` : 'Nog niet begonnen'}</span><div class="bar"><i style="width:${usDone / 50 * 100}%"></i></div></div>
          <b>Oefenen ${I.arrow}</b>
        </div>
      </a>
    </section>
    <section class="daily-section" aria-label="Spellen van de dag">
      <div class="section-head">
        <div><h2>Spellen van de dag</h2><p>Elke dag nieuw, voor iedereen hetzelfde. Of speel een willekeurige ronde.</p></div>
        <div class="countdown" aria-live="off"><span aria-hidden="true">⏳</span><span>Nieuwe spellen over</span><b id="countdown" class="tabnum">${countdown()}</b></div>
      </div>
      <div class="daily-grid">${DAILY_GAMES.map(dailyCard).join('')}</div>
    </section>
    <section style="display:grid;gap:14px" aria-label="Meer spellen">
      <div class="section-head"><div><h2>Meer spellen</h2><p>Grote tests om te laten zien wat je kunt.</p></div></div>
      <div class="games more">
        ${MORE.map(g => `<a class="card game live" href="${siteUrl(g.href)}"><div class="gicon">${g.icon}</div><h3>${g.t}</h3><p>${g.d}</p></a>`).join('')}
      </div>
    </section>`;
  // Decorative globe / US map, inlined so the theme colours apply to it.
  page.querySelectorAll('[data-art]').forEach(el => {
    fetch(siteUrl('assets/' + el.dataset.art)).then(r => r.ok ? r.text() : '').then(svg => { el.innerHTML = svg; }).catch(() => {});
  });
  setInterval(() => {
    const el = document.getElementById('countdown');
    if (!el) return;
    el.textContent = countdown();
    if (msToMidnight() < 1000) setTimeout(() => location.reload(), 1500);
  }, 1000);
})();
