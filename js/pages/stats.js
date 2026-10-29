// Statistics: filters, key figures, questions per day, per quiz type, best/hardest countries,
// insights, per week and per continent. Reads the same history as the quizzes.
import { loadDataset, shortTitle, weekNumber, selectionGroup } from '../core/data.js';
import { loadHistory, clearHistory, groupProgress } from '../core/store.js';
import { QuizEngine } from '../core/engine.js';
import { escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I, prefs } from '../ui/shell.js';

renderTopbar(document.getElementById('topbar'), { current: 'stats' });
const page = document.getElementById('page');
const TYPE_LABEL = { capital: 'Hoofdsteden', flag: 'Vlaggen', map: 'Kaart', mix: 'Mix', kwartet: 'Kwartet', history: 'Geschiedenis', outline: 'Omtrek', exam: 'Eindexamen' };
const MIN_SEEN = 3;

const S = Object.assign({ period: 'all', group: '', type: 'all', tab: 'algemeen' }, prefs.get('landjes_stats_filters', {}));
S.confirm = false;

(async () => {
  const ds = await loadDataset('world');
  const us = await loadDataset('us').catch(() => null);
  const lookup = id => ds.items.get(id) || (us && us.items.get(id));
  const groupsById = Object.fromEntries(ds.groups.map(g => [g.id, g]));
  if (us) us.groups.forEach(g => { groupsById[g.id] = g; });
  let history = loadHistory();

  function filtered() {
    const now = new Date();
    let from = null;
    if (S.period === '7' || S.period === '30') { from = new Date(now); from.setDate(now.getDate() - Number(S.period)); }
    if (S.period === 'week') { from = new Date(now); from.setDate(now.getDate() - ((now.getDay() || 7) - 1)); from.setHours(0, 0, 0, 0); }
    return history.sessions.filter(s => s.endedAt
      && (!from || new Date(s.endedAt) >= from)
      && (!S.group || s.groupId === S.group)
      && (S.type === 'all' || s.quizType === S.type));
  }

  function perCountry(sessions) {
    const by = {};
    for (const s of sessions) for (const [id, st] of Object.entries(s.perCountryStats || {})) {
      const t = by[id] || (by[id] = { id, seen: 0, correct: 0, ms: 0, events: [] });
      t.seen += st.seen_count || 0;
      t.correct += st.correct_count || 0;
      (st.events || []).forEach(e => { t.ms += e.responseTimeMs || 0; t.events.push(e); });
    }
    Object.values(by).forEach(t => { t.acc = t.seen ? t.correct / t.seen : 0; t.avgMs = t.seen ? t.ms / t.seen : null; });
    return by;
  }

  const stars = (acc, seen) => acc >= .9 && seen >= 5 ? 5 : acc >= .8 && seen >= 4 ? 4 : acc >= .65 && seen >= 3 ? 3 : acc >= .45 && seen >= 2 ? 2 : 1;
  const starHtml = n => `<span class="stars" aria-label="${n} van 5 sterren">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
  const pct = x => `${Math.round(x * 100)}%`;
  const secs = ms => ms == null ? '–' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const name = id => lookup(id)?.name || id;
  const flag = id => lookup(id) ? `<img class="flag" src="${lookup(id).flag}" alt="" width="30" height="20" loading="lazy">` : '<span class="flag-fallback" style="width:30px;height:20px"></span>';
  function duration(ms) {
    if (ms <= 0) return '–';
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
    return h ? `${h}u ${m % 60}m` : m ? `${m}m` : `${Math.floor(ms / 1000)}s`;
  }

  function dayChart(sessions) {
    const days = 14, today = new Date(); today.setHours(0, 0, 0, 0);
    const counts = Array(days).fill(0);
    for (const s of sessions) {
      const d = new Date(s.endedAt); d.setHours(0, 0, 0, 0);
      const i = days - 1 - Math.round((today - d) / 864e5);
      if (i >= 0 && i < days) counts[i] += s.totals?.questions || 0;
    }
    const max = Math.max(10, ...counts), nice = Math.ceil(max / 10) * 10;
    const W = 560, H = 200, padL = 30, base = H - 22, plot = base - 8, bw = (W - padL) / days;
    const label = i => { const d = new Date(today); d.setDate(d.getDate() - (days - 1 - i)); return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); };
    const bars = counts.map((v, i) => {
      const h = v / nice * plot, x = padL + i * bw + 3, w = bw - 6, y = base - h;
      return `<g data-tip="${label(i)} · ${v} vragen"><rect x="${x - 2}" y="0" width="${w + 4}" height="${base}" fill="transparent"></rect>${v ? `<path d="M${x},${base} V${y + 4} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${base} Z" fill="var(--accent)"></path>` : ''}</g>`;
    }).join('');
    const grid = [0, nice / 2, nice].map(v => { const y = base - v / nice * plot; return `<line x1="${padL}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--border)" ${v ? 'stroke-dasharray="3 4"' : ''}></line><text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`; }).join('');
    const xl = [0, 7, 13].map(i => `<text x="${padL + i * bw + bw / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="var(--muted)">${label(i)}</text>`).join('');
    return `<div class="chart" id="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Vragen per dag, laatste 14 dagen">${grid}${bars}${xl}</svg><div class="tip" id="tip"></div></div>`;
  }

  function rollingChart(sessions) {
    const events = sessions.flatMap(s => Object.values(s.perCountryStats || {}).flatMap(st => st.events || []))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (events.length < 5) return '<p class="muted">Nog te weinig antwoorden voor een verloop.</p>';
    const k = 5, pts = events.map((_, i) => { const sl = events.slice(Math.max(0, i - k + 1), i + 1); return sl.filter(e => e.result === 'correct').length / sl.length; });
    const W = 960, H = 200, padL = 40, top = 22, base = H - 18, n = pts.length;
    const x = i => padL + (n === 1 ? 0 : i / (n - 1)) * (W - padL - 4), y = v => base - v * (base - top);
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)},${base} L${x(0)},${base} Z`;
    const grid = [0, .5, 1].map(v => `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" ${v ? 'stroke-dasharray="3 4"' : ''}></line><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v * 100}%</text>`).join('');
    const last = pts[n - 1];
    return `<svg class="line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verloop van je nauwkeurigheid over de laatste ${n} antwoorden">
      <defs><linearGradient id="ar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".25"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#ar)"></path><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"></path>
      <circle cx="${x(n - 1)}" cy="${y(last)}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"></circle>
      <text x="${W - 4}" y="${Math.max(14, y(last) - 10)}" text-anchor="end" font-size="12" font-weight="600" fill="var(--text)">${pct(last)}</text>
    </svg><p class="muted" style="font-size:12.5px">Gemiddelde over de laatste 5 antwoorden, voor ${n} antwoorden.</p>`;
  }

  function countryList(arr, empty) {
    return arr.length ? `<div class="clist2">${arr.map(c => `<div>${flag(c.id)}<span class="nm">${esc(name(c.id))}</span><span class="v">${pct(c.acc)}</span><span class="m">${c.seen}× · ${secs(c.avgMs)}</span>${starHtml(stars(c.acc, c.seen))}</div>`).join('')}</div>` : `<p class="muted">${empty}</p>`;
  }

  function tabAlgemeen(sessions) {
    const q = sessions.reduce((a, s) => a + (s.totals?.questions || 0), 0);
    const c = sessions.reduce((a, s) => a + (s.totals?.correct || 0), 0);
    const rt = sessions.reduce((a, s) => a + (s.totals?.totalResponseTimeMs || 0), 0);
    const study = sessions.reduce((a, s) => a + Math.max(0, new Date(s.endedAt) - new Date(s.startedAt)), 0);
    const best = Math.max(0, ...sessions.map(s => s.totals?.streakBest || 0));
    const rounds = sessions.reduce((a, s) => a + (s.totals?.rounds || 0), 0);
    const byType = {};
    sessions.forEach(s => { const t = s.quizType || 'mix'; const b = byType[t] || (byType[t] = { q: 0, c: 0 }); b.q += s.totals?.questions || 0; b.c += s.totals?.correct || 0; });
    const maxQ = Math.max(1, ...Object.values(byType).map(b => b.q));
    const pc = Object.values(perCountry(sessions)).filter(x => x.seen >= MIN_SEEN);
    const worst = [...pc].sort((a, b) => a.acc - b.acc || b.seen - a.seen).slice(0, 8);
    const bestC = [...pc].sort((a, b) => b.acc - a.acc || b.seen - a.seen).slice(0, 8);
    const two = Object.values(perCountry(sessions)).filter(x => x.seen >= 2);
    const most = [...two].sort((a, b) => b.seen - a.seen).slice(0, 5);
    const fastWrong = two.filter(x => x.acc < .5 && x.avgMs).sort((a, b) => a.avgMs - b.avgMs).slice(0, 5);
    const slowGood = two.filter(x => x.acc >= .7 && x.avgMs).sort((a, b) => b.avgMs - a.avgMs).slice(0, 5);
    const insight = (t, arr, f) => `<div class="insight"><h4>${t}</h4>${arr.length ? `<ul>${arr.map(x => `<li>${flag(x.id)}<span>${esc(name(x.id))}</span><span class="muted">${f(x)}</span></li>`).join('')}</ul>` : '<p class="muted">Nog niets</p>'}</div>`;
    return `
      <div class="kpis">
        <div class="card kpi"><span class="k">Sessies</span><span class="v">${sessions.length}</span><span class="sub">${rounds} rondes · ${duration(study)} geoefend</span></div>
        <div class="card kpi"><span class="k">Vragen beantwoord</span><span class="v">${q}</span></div>
        <div class="card kpi"><span class="k">Goed</span><span class="v">${q ? pct(c / q) : '–'}</span><span class="sub">Beste reeks ${best}</span></div>
        <div class="card kpi"><span class="k">Gem. reactietijd</span><span class="v">${secs(q ? rt / q : null)}</span></div>
      </div>
      <div class="two">
        <div class="card panel"><div class="panel-head"><h3>Vragen per dag</h3><span class="muted" style="font-size:13px">laatste 14 dagen</span></div>${dayChart(sessions)}</div>
        <div class="card panel"><div class="panel-head"><h3>Per quizvorm</h3><span class="muted" style="font-size:13px">vragen · % goed</span></div>
          <div class="rows types">${Object.entries(byType).sort((a, b) => b[1].q - a[1].q).map(([t, b]) => `<div class="row2"><span>${TYPE_LABEL[t] || esc(t)}</span><div class="meter"><i style="width:${b.q / maxQ * 100}%"></i></div><span class="n">${b.q} · ${b.q ? pct(b.c / b.q) : '–'}</span></div>`).join('') || '<p class="muted">Nog geen data</p>'}</div>
        </div>
      </div>
      <div class="card panel"><div class="panel-head"><h3>Verloop van je nauwkeurigheid</h3></div>${rollingChart(sessions)}</div>
      <div class="two even">
        <div class="card panel"><div class="panel-head"><h3>Lastigste landen</h3><span class="muted" style="font-size:13px">min. ${MIN_SEEN}× gezien</span></div>${countryList(worst, 'Speel wat meer om hier je lastigste landen te zien.')}</div>
        <div class="card panel"><div class="panel-head"><h3>Beste landen</h3><span class="muted" style="font-size:13px">min. ${MIN_SEEN}× gezien</span></div>${countryList(bestC, 'Nog niet genoeg data.')}</div>
      </div>
      <div class="card panel"><h3>Inzichten</h3><div class="insights">
        ${insight('Meest geoefend', most, x => `${x.seen}×`)}
        ${insight('Snel maar fout', fastWrong, x => `${pct(x.acc)} · ${secs(x.avgMs)}`)}
        ${insight('Langzaam maar goed', slowGood, x => `${pct(x.acc)} · ${secs(x.avgMs)}`)}
      </div></div>`;
  }

  function tabWeek(sessions) {
    const byGroup = {};
    sessions.forEach(s => (byGroup[s.groupId] = byGroup[s.groupId] || []).push(s));
    const ids = Object.keys(byGroup).sort((a, b) => (weekNumber(groupsById[a] || { title: '' }) ?? 99) - (weekNumber(groupsById[b] || { title: '' }) ?? 99));
    if (!ids.length) return '<div class="card panel"><p class="muted">Nog geen sessies in dit filter.</p></div>';
    return `<div class="group-cards">${ids.map(gid => {
      const ss = byGroup[gid], g = groupsById[gid] || selectionGroup(ds, gid);
      const q = ss.reduce((a, s) => a + (s.totals?.questions || 0), 0), c = ss.reduce((a, s) => a + (s.totals?.correct || 0), 0);
      const rt = ss.reduce((a, s) => a + (s.totals?.totalResponseTimeMs || 0), 0);
      const weak = Object.values(perCountry(ss)).filter(x => x.seen >= 2).sort((a, b) => a.acc - b.acc).slice(0, 3);
      const p = g ? groupProgress(gid, g.countries, history) : null;
      const title = g ? (weekNumber(g) ? `Week ${weekNumber(g)} · ${shortTitle(g)}` : g.title) : ({ custom: 'Mijn selectie', world: 'Hele wereld' }[gid] || gid.replace('continent_', ''));
      return `<div class="card panel">
        <h3>${esc(title)}</h3>
        <dl class="dl"><div><dt>Sessies</dt><dd>${ss.length}</dd></div><div><dt>Vragen</dt><dd>${q}</dd></div><div><dt>Goed</dt><dd>${q ? pct(c / q) : '–'}</dd></div>
          <div><dt>Beste reeks</dt><dd>${Math.max(0, ...ss.map(s => s.totals?.streakBest || 0))}</dd></div><div><dt>Gem. tijd</dt><dd>${secs(q ? rt / q : null)}</dd></div><div><dt>Rondes</dt><dd>${ss.reduce((a, s) => a + (s.totals?.rounds || 0), 0)}</dd></div></dl>
        ${p ? `<div class="tri">${[['Hoofdstad', p.capital], ['Vlag', p.flag], ['Kaart', p.map]].map(([l, v]) => `<div class="t"><span>${l}<b>${v}%</b></span><div class="meter"><i style="width:${v}%"></i></div></div>`).join('')}</div>` : ''}
        <p class="muted" style="font-size:13px">Zwakste: ${weak.map(x => esc(name(x.id))).join(', ') || '–'}</p>
      </div>`;
    }).join('')}</div>`;
  }

  function tabContinent(sessions) {
    const pc = perCountry(sessions);
    const rows = ds.regions.map(r => {
      const list = Object.values(pc).filter(x => ds.items.get(x.id)?.region === r);
      const seen = list.reduce((a, x) => a + x.seen, 0), cor = list.reduce((a, x) => a + x.correct, 0);
      const total = [...ds.items.values()].filter(it => it.region === r).length;
      const weak = list.filter(x => x.seen >= 2).sort((a, b) => a.acc - b.acc).slice(0, 3);
      return { r, seen, acc: seen ? cor / seen : null, covered: list.length, total, weak };
    });
    return `<div class="card panel"><div class="panel-head"><h3>Goed per continent</h3><span class="muted" style="font-size:13px">% goed · landen geoefend</span></div>
      <div class="rows">${rows.map(x => `<div class="row3"><span>${esc(ds.regionTitle(x.r))}</span><div class="meter"><i style="width:${(x.acc || 0) * 100}%"></i></div><span class="n">${x.acc == null ? '–' : pct(x.acc)}</span><span class="n">${x.covered}/${x.total}</span><span class="muted weak">${x.weak.map(w => esc(name(w.id))).join(', ')}</span></div>`).join('')}</div></div>`;
  }

  function render() {
    prefs.set('landjes_stats_filters', { period: S.period, group: S.group, type: S.type, tab: S.tab });
    const sessions = filtered();
    const lastEnd = history.sessions.filter(s => s.endedAt).map(s => new Date(s.endedAt)).sort((a, b) => b - a)[0];
    const content = !sessions.length
      ? `<div class="card panel empty"><h3>Nog geen sessies${S.period !== 'all' || S.group || S.type !== 'all' ? ' in dit filter' : ''}</h3><p class="muted">Rond een quiz af of verlaat hem halverwege; elke sessie met minstens één antwoord komt hier.</p></div>`
      : S.tab === 'week' ? tabWeek(sessions) : S.tab === 'continent' ? tabContinent(sessions) : tabAlgemeen(sessions);
    page.innerHTML = `
      <div class="stats-head">
        <div><h1>Statistieken</h1><p>Je sessies, wat je goed hebt en waar je nog op kunt oefenen.${lastEnd ? ` Laatst gespeeld ${lastEnd.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}.` : ''}</p></div>
        <button class="btn" data-act="log">Download log (JSON)</button>
      </div>
      <div class="toolbar">
        <div class="seg small" role="group" aria-label="Periode">${[['all', 'Alles'], ['week', 'Deze week'], ['7', '7 dagen'], ['30', '30 dagen']].map(([k, t]) => `<button data-period="${k}" aria-pressed="${S.period === k}">${t}</button>`).join('')}</div>
        <label class="visually-hidden" for="f-group">Week</label>
        <select class="select" id="f-group"><option value="">Alle weken</option>${ds.groups.map(g => `<option value="${g.id}" ${S.group === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}${us ? us.groups.map(g => `<option value="${g.id}" ${S.group === g.id ? 'selected' : ''}>VS · ${esc(g.title)}</option>`).join('') : ''}<option value="custom" ${S.group === 'custom' ? 'selected' : ''}>Mijn selectie</option></select>
        <label class="visually-hidden" for="f-type">Quizvorm</label>
        <select class="select" id="f-type"><option value="all">Alle quizvormen</option>${Object.entries(TYPE_LABEL).filter(([k]) => k !== 'exam').map(([k, t]) => `<option value="${k}" ${S.type === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <span style="flex:1"></span>
        <div class="seg small" role="tablist" aria-label="Weergave">${[['algemeen', 'Algemeen'], ['week', 'Per week'], ['continent', 'Per continent']].map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}" aria-pressed="${S.tab === k}">${t}</button>`).join('')}</div>
      </div>
      ${content}
      <div class="card danger-zone">
        <div><h3>Statistieken wissen</h3><p>Verwijdert al je sessies en voortgang uit deze browser. Dit kun je niet terugdraaien.</p></div>
        ${S.confirm
          ? `<div class="confirm"><span>Alles wissen?</span><button class="btn" data-act="no">Annuleren</button><button class="btn solid-danger" data-act="wipe">Ja, wis alles</button></div>`
          : `<button class="btn danger" data-act="ask">Wis statistieken…</button>`}
      </div>`;
    bindChart();
  }

  function bindChart() {
    const chart = document.getElementById('chart'); if (!chart) return;
    const tip = document.getElementById('tip');
    chart.querySelectorAll('g[data-tip]').forEach(g => {
      g.addEventListener('mouseenter', () => {
        const c = chart.getBoundingClientRect(), r = g.getBoundingClientRect(), bar = g.querySelector('path') || g.querySelector('rect'), br = bar.getBoundingClientRect();
        tip.textContent = g.dataset.tip;
        tip.style.left = `${r.left - c.left + r.width / 2}px`;
        tip.style.top = `${br.top - c.top + (g.querySelector('path') ? 0 : br.height)}px`;
        tip.style.opacity = 1;
      });
      g.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
    });
  }

  page.addEventListener('click', e => {
    const t = e.target;
    const p = t.closest('[data-period]'); if (p) { S.period = p.dataset.period; render(); return; }
    const tb = t.closest('[data-tab]'); if (tb) { S.tab = tb.dataset.tab; render(); return; }
    const a = t.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'log') QuizEngine.downloadLog(history);
    if (a.dataset.act === 'ask') { S.confirm = true; render(); }
    if (a.dataset.act === 'no') { S.confirm = false; render(); }
    if (a.dataset.act === 'wipe') { clearHistory(); history = loadHistory(); S.confirm = false; render(); }
  });
  page.addEventListener('change', e => {
    if (e.target.id === 'f-group') { S.group = e.target.value; render(); }
    if (e.target.id === 'f-type') { S.type = e.target.value; render(); }
  });
  render();
})();
