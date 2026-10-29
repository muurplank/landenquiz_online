// Main page: choose the world or the US states, or one of the games.
import { loadDataset, siteUrl } from '../core/data.js';
import { loadHistory } from '../core/store.js';
import { renderTopbar, I } from '../ui/shell.js';

renderTopbar(document.getElementById('topbar'), { current: 'hub' });
const page = document.getElementById('page');

const ICONS = {
  cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M7 14h10"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  shape: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 3l6 2 5-1 2 6-3 4 1 6-6-2-5 2-2-6-3-3 3-5z"/></svg>',
  question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.5h0"/></svg>'
};

const GAMES = [
  { live: true, href: 'exam.html', icon: ICONS.cap, t: 'Het Grote Eindexamen', d: '588 vragen over alle 196 landen, met een seed om tegen elkaar te spelen.' },
  { live: true, href: 'sporcle.html', icon: ICONS.keyboard, t: 'Typ ze allemaal', d: 'Alle landen, hoofdsteden of vlaggen uit je hoofd typen tegen de klok.' },
  { live: true, href: 'grensroute.html', icon: I.map, t: 'Grensroute', d: 'Reis van het ene land naar het andere, steeds naar een buurland, in zo min mogelijk stappen.' },
  { icon: ICONS.target, t: 'Warm of koud', d: 'Raad een geheim land. Elke gok kleurt de globe warmer naarmate je dichterbij zit.', pill: 'Binnenkort' },
  { icon: ICONS.shape, t: 'Silhouet', d: 'Raad het land aan zijn vorm. Na elke gok zie je hoe ver en welke kant op.', pill: 'Binnenkort' },
  { icon: ICONS.question, t: 'Geo trivia', d: 'Hoogste berg, langste rivier, grootste stad: snelle meerkeuzevragen.', pill: 'Idee' }
];

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

  const usCells = Array.from({ length: 55 }, (_, i) => `<i class="${[11, 39, 40, 51, 52, 53, 62, 63, 64].includes(i) ? 'off' : (i % 7 === 0 ? 'on' : '')}"></i>`).join('');
  page.innerHTML = `
    <section class="hub-hero">
      <div class="eyebrow">Land Trainer</div>
      <h1>Wat ga je vandaag <em>leren</em>?</h1>
      <p>Oefen per week of per regio, of test jezelf met een van de spellen.</p>
    </section>
    <section class="hub-main" aria-label="Oefensets">
      <a class="world-card w" href="${siteUrl('wereld.html')}">
        <div class="world-art w" aria-hidden="true"></div>
        <div style="display:grid;gap:10px;position:relative">
          <div class="meta"><span>${total} landen</span><span>16 weken</span><span>6 continenten</span></div>
          <h2>De wereld</h2>
          <p>Landen, hoofdsteden, vlaggen en de satellietkaart.</p>
        </div>
        <div class="go">
          <div class="prog">${mastered ? `${mastered} van ${total} landen minstens één keer goed` : 'Nog niet begonnen'}<div class="bar"><i style="width:${mastered / total * 100}%"></i></div></div>
          <b>Oefenen ${I.arrow}</b>
        </div>
      </a>
      <a class="world-card us" href="${siteUrl('wereld.html?dataset=us')}">
        <div class="us-grid" aria-hidden="true">${usCells}</div>
        <div style="display:grid;gap:10px;position:relative">
          <div class="meta"><span>50 staten</span><span>5 regio's</span></div>
          <h2>Amerikaanse staten</h2>
          <p>Alle staten, hoofdsteden en staatsvlaggen, op dezelfde kaart.</p>
        </div>
        <div class="go">
          <div class="prog">${usDone ? `${usDone} van 50 staten minstens één keer goed` : 'Nog niet begonnen'}<div class="bar"><i style="width:${usDone / 50 * 100}%"></i></div></div>
          <b>Oefenen ${I.arrow}</b>
        </div>
      </a>
    </section>
    <section style="display:grid;gap:14px" aria-label="Spellen">
      <div class="section-head"><div><h2>Spellen</h2><p>Test wat je weet, zonder hints.</p></div></div>
      <div class="games">
        ${GAMES.map(g => g.live
          ? `<a class="card game live" href="${siteUrl(g.href)}"><div class="gicon">${g.icon}</div><h3>${g.t}</h3><p>${g.d}</p></a>`
          : `<div class="card game later"><span class="pill soon">${g.pill}</span><div class="gicon">${g.icon}</div><h3>${g.t}</h3><p>${g.d}</p></div>`).join('')}
      </div>
    </section>`;
})();
