// Overview of all weeks (or regions), grouped by continent, with multi-select for a custom quiz.
import { loadDataset, shortTitle, weekNumber, setCustomGroup, siteUrl } from '../core/data.js';
import { loadHistory, groupProgress } from '../core/store.js';
import { escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I } from '../ui/shell.js';

const params = Object.fromEntries(new URLSearchParams(location.search));
const page = document.getElementById('page');
const selbar = document.getElementById('selbar');
renderTopbar(document.getElementById('topbar'), { current: 'oefenen', dataset: params.dataset || 'world' });

(async () => {
  let ds;
  try { ds = await loadDataset(params.dataset || 'world'); }
  catch (e) { page.innerHTML = `<div class="card" style="padding:24px"><p>${esc(e.message)}</p></div>`; return; }
  const history = loadHistory();
  const groups = ds.groups.map(g => {
    const ids = g.countries.filter(id => ds.items.has(id));
    const p = groupProgress(g.id, ids, history);
    return { g, ids, prog: [p.capital, p.flag, p.map] };
  });
  const selected = new Set();
  const sections = ds.regions
    .map(r => ({ region: r, name: ds.regionTitle(r), items: groups.filter(x => x.g.continent === r) }))
    .filter(s => s.items.length);

  // Last played set from the history, for "Ga verder".
  const last = [...history.sessions].reverse().find(s => groups.some(x => x.g.id === s.groupId));
  const resume = last && groups.find(x => x.g.id === last.groupId);
  const total = new Set(groups.flatMap(x => x.ids)).size;
  const N = ds.noun;

  function stateOf(ids) {
    const n = ids.filter(id => selected.has(id)).length;
    return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
  }

  function card(x) {
    const sel = selected.has(x.g.id);
    const done = x.prog.every(p => p === 100);
    const avg = Math.round((x.prog[0] + x.prog[1] + x.prog[2]) / 3);
    const flags = x.ids.slice(0, 6).map(id => `<img class="flag" src="${ds.items.get(id).flag}" alt="" width="28" height="19" loading="lazy">`).join('');
    return `<article class="card week ${sel ? 'sel' : ''}" data-open="${x.g.id}" tabindex="0" aria-label="${esc(x.g.title)} openen">
      <div class="week-top">
        <div><div class="week-num">WEEK ${weekNumber(x.g) ?? ''}</div><h3>${esc(shortTitle(x.g))}</h3></div>
        <button class="check" data-toggle="${x.g.id}" aria-pressed="${sel}" aria-label="${esc(x.g.title)} meenemen in selectie"><span class="box">${I.check}</span></button>
      </div>
      <div class="flagstrip">${flags}${x.ids.length > 6 ? `<span class="more">+${x.ids.length - 6}</span>` : ''}</div>
      <div class="segbar" title="Hoofdstad · vlag · kaart">${x.prog.map(p => `<div class="meter ${p === 100 ? 'ok' : ''}"><i style="width:${p}%"></i></div>`).join('')}</div>
      <div class="week-foot"><span>${x.ids.length} ${N.many}</span>${done ? `<span class="done-badge">${I.check.replace('<svg', '<svg width="13" height="13"')} Beheerst</span>` : `<span><b>${avg}%</b></span>`}</div>
    </article>`;
  }

  function render() {
    const allIds = groups.map(x => x.g.id);
    page.innerHTML = `
      <section class="home-hero">
        <div class="lead">
          <div class="eyebrow">${total} ${N.many} · ${groups.length} weken</div>
          <h1>Welke week oefen je?</h1>
          <p>Open een week om te oefenen, of vink er een paar aan om ze te combineren in één quiz.</p>
          <div class="row">
            <button class="selall" data-selall="__all" data-state="${stateOf(allIds)}"><span class="box">${I.check}</span>Hele wereld selecteren</button>
          </div>
        </div>
        ${resume ? `<div class="card resume">
          <div class="resume-top"><span class="label">Ga verder</span><span class="muted" style="font-size:12px">${esc(relDay(last.endedAt || last.startedAt))}</span></div>
          <div><h3>${esc(shortTitle(resume.g))}</h3><p class="muted" style="font-size:13px">Week ${weekNumber(resume.g)} · ${resume.ids.length} ${N.many}</p></div>
          <div class="flagstrip">${resume.ids.slice(0, 8).map(id => `<img class="flag" src="${ds.items.get(id).flag}" alt="" width="30" height="20">`).join('')}${resume.ids.length > 8 ? `<span class="more">+${resume.ids.length - 8}</span>` : ''}</div>
          <div class="tri">${['Hoofdstad', 'Vlag', 'Kaart'].map((l, i) => `<div class="t"><span>${l}<b>${resume.prog[i]}%</b></span><div class="meter"><i style="width:${resume.prog[i]}%"></i></div></div>`).join('')}</div>
          <a class="btn primary" href="${siteUrl('set.html?id=' + encodeURIComponent(resume.g.id))}">Verder met ${esc(shortTitle(resume.g))} ${I.arrow}</a>
        </div>` : `<div class="card resume">
          <div class="resume-top"><span class="label">Zo werkt het</span></div>
          <p class="muted" style="font-size:14px">Elke week heeft hoofdsteden, vlaggen, de kaart, Kwartet en een mix. De drie balkjes op een week laten zien hoeveel hoofdsteden, vlaggen en kaartvragen je al goed hebt.</p>
        </div>`}
      </section>
      ${sections.map(sec => {
        const ids = sec.items.map(x => x.g.id);
        const members = new Set(sec.items.flatMap(x => x.ids)).size;
        return `<section class="continent">
          <div class="continent-head">
            <h2>${esc(sec.name)}</h2>
            <span class="count">${members} ${N.many} · ${sec.items.length} ${sec.items.length === 1 ? 'week' : 'weken'}</span>
            <span class="spacer"></span>
            <a class="chip" href="${siteUrl('set.html?id=continent_' + encodeURIComponent(sec.region))}">Heel ${esc(sec.name)} oefenen</a>
            <button class="selall" data-selall="${esc(sec.region)}" data-state="${stateOf(ids)}"><span class="box">${I.check}</span>Selecteren</button>
          </div>
          <div class="weeks">${sec.items.map(card).join('')}</div>
        </section>`;
      }).join('')}`;
    renderBar();
  }

  function renderBar() {
    const items = groups.filter(x => selected.has(x.g.id));
    const count = new Set(items.flatMap(x => x.ids)).size;
    selbar.classList.toggle('hide', !items.length);
    selbar.innerHTML = items.length ? `
      <div class="txt"><b>${items.length} ${items.length === 1 ? 'week' : 'weken'}</b> <span>· ${count} van ${total} ${N.many}</span></div>
      <button class="btn ghost" data-act="clear">Wissen</button>
      <button class="btn primary" data-act="start">Open selectie ${I.arrow}</button>` : '';
  }

  function openSet(id) { location.href = siteUrl('set.html?id=' + encodeURIComponent(id)); }

  page.addEventListener('click', e => {
    const t = e.target;
    const tg = t.closest('[data-toggle]');
    if (tg) { e.stopPropagation(); const id = tg.dataset.toggle; selected.has(id) ? selected.delete(id) : selected.add(id); render(); return; }
    const sa = t.closest('[data-selall]');
    if (sa) {
      const key = sa.dataset.selall;
      const ids = groups.filter(x => key === '__all' || x.g.continent === key).map(x => x.g.id);
      const all = ids.every(id => selected.has(id));
      ids.forEach(id => all ? selected.delete(id) : selected.add(id));
      render(); return;
    }
    const open = t.closest('[data-open]');
    if (open && !t.closest('a')) openSet(open.dataset.open);
  });
  page.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open]')) { e.preventDefault(); openSet(e.target.dataset.open); }
  });
  selbar.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'clear') { selected.clear(); render(); return; }
    const countries = [...new Set(groups.filter(x => selected.has(x.g.id)).flatMap(x => x.ids))];
    setCustomGroup({ id: 'custom', title: 'Mijn selectie', continent: 'Custom', countries });
    openSet('custom');
  });
  render();
})();

function relDay(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days <= 0) return 'Vandaag gespeeld';
  if (days === 1) return 'Gisteren gespeeld';
  return `${days} dagen geleden`;
}
