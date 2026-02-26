/**
 * Statistieken-pagina: filters, aggregatie, KPIs, per week, per continent.
 * Leest history uit App.loadHistory(), past filters toe en rendert alle panels.
 */
(function () {
  const HISTORY_KEY = 'landjes_history_v1';
  const MIN_SEEN_FOR_LISTS = 3;
  const ROLLING_K = 5;

  // Sterren: accuracy + seen_count (optioneel: straf voor extreem hoge responstijd)
  function starRating(accuracy, seenCount, avgResponseTimeMs, p80ResponseTimeMs) {
    if (seenCount < 1) return 0;
    let stars = 0;
    if (accuracy >= 0.90 && seenCount >= 5) stars = 5;
    else if (accuracy >= 0.80 && seenCount >= 4) stars = 4;
    else if (accuracy >= 0.65 && seenCount >= 3) stars = 3;
    else if (accuracy >= 0.45 && seenCount >= 2) stars = 2;
    else stars = 1;
    if (p80ResponseTimeMs != null && avgResponseTimeMs > p80ResponseTimeMs && stars > 1) stars -= 1;
    return stars;
  }

  function formatStars(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function getPeriodBounds(periodValue, customFrom, customTo) {
    const now = new Date();
    if (periodValue === 'all') return { from: null, to: null };
    if (periodValue === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    if (periodValue === '7') {
      const from = new Date(now); from.setDate(from.getDate() - 7);
      return { from, to: now };
    }
    if (periodValue === '30') {
      const from = new Date(now); from.setDate(from.getDate() - 30);
      return { from, to: now };
    }
    if (periodValue === 'this_week') {
      const day = now.getDay() || 7; // ma=1, zo=7
      const from = new Date(now); from.setDate(from.getDate() - day + 1); from.setHours(0,0,0,0);
      return { from, to: now };
    }
    return { from: null, to: null };
  }

  function filterSessions(sessions, opts) {
    const { periodFrom, periodTo, groupId, quizType } = opts;
    return sessions.filter(s => {
      if (!s.endedAt) return false;
      const end = new Date(s.endedAt);
      if (periodFrom && end < periodFrom) return false;
      if (periodTo && end > periodTo) return false;
      if (groupId && s.groupId !== groupId) return false;
      if (quizType && quizType !== 'all' && s.quizType !== quizType) return false;
      return true;
    });
  }

  /** Aggregate per-country stats over meerdere sessies (merge per iso). */
  function mergePerCountryStats(sessions) {
    const byIso = {};
    sessions.forEach(session => {
      if (!session.perCountryStats) return;
      Object.entries(session.perCountryStats).forEach(([iso, stat]) => {
        if (!byIso[iso]) {
          byIso[iso] = { iso, seen_count: 0, correct_count: 0, incorrect_count: 0, totalResponseTimeMs: 0, events: [] };
        }
        const t = byIso[iso];
        t.seen_count += stat.seen_count || 0;
        t.correct_count += stat.correct_count || 0;
        t.incorrect_count += (stat.incorrect_count || 0);
        if (stat.events && stat.events.length) {
          t.events = t.events.concat(stat.events.map(e => ({ ...e })));
        }
        stat.events?.forEach(e => { t.totalResponseTimeMs += e.responseTimeMs || 0; });
      });
    });
    Object.values(byIso).forEach(t => {
      const total = t.seen_count || 1;
      t.accuracy = t.correct_count / total;
      t.avgResponseTimeMs = t.totalResponseTimeMs / total;
    });
    return byIso;
  }

  /** Rolling accuracy (k=5) from events, ordered by timestamp. */
  function rollingAccuracyFromEvents(events, k) {
    const sorted = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const out = [];
    for (let i = 0; i < sorted.length; i++) {
      const slice = sorted.slice(Math.max(0, i - k + 1), i + 1);
      const correct = slice.filter(e => e.result === 'correct').length;
      out.push({ index: i + 1, value: slice.length ? correct / slice.length : 0, timestamp: sorted[i].timestamp });
    }
    return out;
  }

  function getCurrentFilters() {
    const periodVal = document.getElementById('filter-period')?.value || 'all';
    const customFrom = document.getElementById('filter-date-from')?.value;
    const customTo = document.getElementById('filter-date-to')?.value;
    const bounds = getPeriodBounds(periodVal, customFrom, customTo);
    return {
      periodFrom: bounds.from,
      periodTo: bounds.to,
      groupId: document.getElementById('filter-group')?.value || '',
      quizType: document.getElementById('filter-quiz-type')?.value || 'all'
    };
  }

  function renderLastUpdated(sessions) {
    const ended = sessions.filter(s => s.endedAt).map(s => new Date(s.endedAt));
    const el = document.getElementById('stats-last-updated');
    if (!el) return;
    if (ended.length === 0) { el.textContent = 'Laatste update: —'; return; }
    const last = new Date(Math.max(...ended));
    el.textContent = `Laatste update: ${last.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}`;
  }

  function renderKpis(filteredSessions) {
    const totalQuestions = filteredSessions.reduce((s, x) => s + (x.totals?.questions || 0), 0);
    const totalCorrect = filteredSessions.reduce((s, x) => s + (x.totals?.correct || 0), 0);
    const weightedAccuracy = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;
    const bestStreak = Math.max(0, ...filteredSessions.map(s => s.totals?.streakBest || 0));
    let totalStudyTimeMs = 0;
    filteredSessions.forEach(s => {
      if (s.startedAt && s.endedAt) totalStudyTimeMs += new Date(s.endedAt) - new Date(s.startedAt);
    });
    const totalResponseTimeMs = filteredSessions.reduce((s, x) => s + (x.totals?.totalResponseTimeMs || 0), 0);
    const avgResponseTimeMs = totalQuestions > 0 ? totalResponseTimeMs / totalQuestions : null;
    const totalRounds = filteredSessions.reduce((s, x) => s + (x.totals?.rounds || 0), 0);

    const completed = filteredSessions.filter(s => s.endedAt);
    const kpis = [
      { label: 'Sessies', value: String(completed.length) },
      { label: 'Vragen', value: String(totalQuestions) },
      { label: 'Rondes', value: String(totalRounds) },
      { label: 'Gem. nauwkeurigheid', value: totalQuestions ? `${Math.round(weightedAccuracy * 100)}%` : '—' },
      { label: 'Beste streak', value: String(bestStreak) },
      { label: 'Studietijd', value: formatDuration(totalStudyTimeMs) },
      { label: 'Gem. responstijd', value: avgResponseTimeMs != null ? `${Math.round(avgResponseTimeMs)} ms` : '—' }
    ];

    const wrap = document.getElementById('kpi-cards');
    if (!wrap) return;
    wrap.innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <span class="kpi-value">${k.value}</span>
        <span class="kpi-label">${k.label}</span>
      </div>
    `).join('');
  }

  function formatDuration(ms) {
    if (ms <= 0) return '—';
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}u ${m % 60}m`;
    if (m > 0) return `${m}m ${sec % 60}s`;
    return `${sec}s`;
  }

  function renderQuizTypeChart(filteredSessions) {
    const byType = { capital: 0, flag: 0, map: 0, mix: 0 };
    let totalCorrectByType = { capital: 0, flag: 0, map: 0, mix: 0 };
    filteredSessions.forEach(s => {
      const q = s.totals?.questions || 0;
      const t = s.quizType || 'mix';
      if (!byType[t]) byType[t] = 0;
      byType[t] += q;
      const correct = s.totals?.correct ?? 0;
      if (s.totals?.correctByType) {
        Object.entries(s.totals.correctByType).forEach(([typ, c]) => {
          totalCorrectByType[typ] = (totalCorrectByType[typ] || 0) + c;
        });
      }
    });
    const total = Object.values(byType).reduce((a, b) => a + b, 0);
    const labels = { capital: 'Hoofdstad', flag: 'Vlag', map: 'Kaart', mix: 'Mix' };
    const el = document.getElementById('chart-quiz-type');
    if (!el) return;
    if (total === 0) { el.innerHTML = '<p class="small">Geen data</p>'; return; }
    const items = Object.entries(byType).filter(([, v]) => v > 0).map(([type, count]) => ({
      type, count, label: labels[type] || type,
      accuracy: byType[type] ? (totalCorrectByType[type] || 0) / byType[type] : 0
    }));
    el.innerHTML = `
      <div class="bar-chart">
        ${items.map(({ label, count, accuracy }) => `
          <div class="bar-row">
            <span class="bar-label">${label}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${total ? (count / total) * 100 : 0}%"></div></div>
            <span class="bar-value">${count} <span class="bar-acc">${Math.round(accuracy * 100)}%</span></span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderBestWorstCountries(perCountry, countriesMap, p80ResponseTime) {
    const minSeen = MIN_SEEN_FOR_LISTS;
    const list = Object.values(perCountry).filter(c => c.seen_count >= minSeen);
    const withStars = list.map(c => ({
      ...c,
      stars: starRating(c.accuracy, c.seen_count, c.avgResponseTimeMs, p80ResponseTime)
    }));
    const best = [...withStars].sort((a, b) => b.accuracy - a.accuracy).slice(0, 10);
    const worst = [...withStars].sort((a, b) => a.accuracy - b.accuracy).slice(0, 10);

    const renderList = (arr, elId) => {
      const el = document.getElementById(elId);
      if (!el) return;
      el.innerHTML = arr.map(c => {
        const name = (countriesMap[c.iso]?.name_nl) || c.iso;
        return `<li class="country-stat-row">
          <span class="country-name">${name}</span>
          <span class="country-acc">${Math.round(c.accuracy * 100)}%</span>
          <span class="country-seen">${c.seen_count}×</span>
          <span class="country-time">${c.avgResponseTimeMs != null ? Math.round(c.avgResponseTimeMs) + ' ms' : '—'}</span>
          <span class="country-stars" title="Status op accuracy + aantal keer gezien (en eventueel snelheid)">${formatStars(c.stars)}</span>
        </li>`;
      }).join('') || '<li class="small">Geen landen met min. 3× gezien</li>';
    };
    renderList(best, 'list-best-countries');
    renderList(worst, 'list-worst-countries');
  }

  function renderExtraInsights(perCountry, countriesMap) {
    const minSeen = 2;
    const list = Object.values(perCountry).filter(c => c.seen_count >= minSeen);
    if (list.length === 0) {
      document.getElementById('insights-extra').innerHTML = '<p class="small">Niet genoeg data.</p>';
      return;
    }
    const bySeen = [...list].sort((a, b) => b.seen_count - a.seen_count).slice(0, 5);
    const responseTimes = list.map(c => c.avgResponseTimeMs).filter(Boolean);
    const p80 = responseTimes.length ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.8)] : null;
    const fastWrong = [...list].filter(c => c.accuracy < 0.5 && c.avgResponseTimeMs != null)
      .sort((a, b) => a.avgResponseTimeMs - b.avgResponseTimeMs).slice(0, 5);
    const slowGood = [...list].filter(c => c.accuracy >= 0.7 && c.avgResponseTimeMs != null)
      .sort((a, b) => b.avgResponseTimeMs - a.avgResponseTimeMs).slice(0, 5);

    const name = (iso, map) => (map[iso]?.name_nl) || iso;
    let html = '<div class="insight-block"><strong>Meest geoefend</strong><ul>';
    bySeen.forEach(c => { html += `<li>${name(c.iso, countriesMap)} (${c.seen_count}×)</li>`; });
    html += '</ul></div>';
    html += '<div class="insight-block"><strong>Snel maar fout</strong><ul>';
    fastWrong.forEach(c => { html += `<li>${name(c.iso, countriesMap)} — ${Math.round(c.accuracy * 100)}%, ${Math.round(c.avgResponseTimeMs)} ms</li>`; });
    html += '</ul></div>';
    html += '<div class="insight-block"><strong>Langzaam maar goed</strong><ul>';
    slowGood.forEach(c => { html += `<li>${name(c.iso, countriesMap)} — ${Math.round(c.accuracy * 100)}%, ${Math.round(c.avgResponseTimeMs)} ms</li>`; });
    html += '</ul></div>';
    const el = document.getElementById('insights-extra');
    if (el) el.innerHTML = html;
  }

  function renderPerGroupCards(filteredSessions, groupsMap, countriesMap, perCountryAll) {
    const byGroup = {};
    filteredSessions.forEach(s => {
      const g = s.groupId;
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(s);
    });
    const groupIds = Object.keys(byGroup).sort();
    const wrap = document.getElementById('per-group-cards');
    if (!wrap) return;
    wrap.innerHTML = groupIds.map(gid => {
      const sessions = byGroup[gid];
      const totalQ = sessions.reduce((a, s) => a + (s.totals?.questions || 0), 0);
      const totalC = sessions.reduce((a, s) => a + (s.totals?.correct || 0), 0);
      const totalR = sessions.reduce((a, s) => a + (s.totals?.rounds || 0), 0);
      const acc = totalQ ? totalC / totalQ : 0;
      const bestStreak = Math.max(0, ...sessions.map(s => s.totals?.streakBest || 0));
      const totalRt = sessions.reduce((a, s) => a + (s.totals?.totalResponseTimeMs || 0), 0);
      const avgRt = totalQ ? totalRt / totalQ : null;
      const merged = mergePerCountryStats(sessions);
      const weak = Object.values(merged).filter(c => c.seen_count >= 2)
        .sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
      const title = (groupsMap[gid]?.title) || gid;
      return `
        <div class="card group-stat-card">
          <h3>${title}</h3>
          <dl class="stats-list compact">
            <dt>Sessies</dt><dd>${sessions.length}</dd>
            <dt>Vragen</dt><dd>${totalQ}</dd>
            <dt>Rondes</dt><dd>${totalR}</dd>
            <dt>Nauwkeurigheid</dt><dd>${totalQ ? Math.round(acc * 100) + '%' : '—'}</dd>
            <dt>Beste streak</dt><dd>${bestStreak}</dd>
            <dt>Gem. responstijd</dt><dd>${avgRt != null ? Math.round(avgRt) + ' ms' : '—'}</dd>
          </dl>
          <p class="small"><strong>Top 3 zwakke landen:</strong> ${weak.map(c => (countriesMap[c.iso]?.name_nl) || c.iso).join(', ') || '—'}</p>
        </div>
      `;
    }).join('');
  }

  function renderRollingAccuracy(filteredSessions, groupIdFilter) {
    const sessions = groupIdFilter ? filteredSessions.filter(s => s.groupId === groupIdFilter) : filteredSessions;
    const allEventsByType = { capital: [], flag: [], map: [], mix: [] };
    sessions.forEach(s => {
      Object.values(s.perCountryStats || {}).forEach(stat => {
        (stat.events || []).forEach(e => {
          const t = e.quizType || 'mix';
          if (allEventsByType[t]) allEventsByType[t].push(e);
        });
      });
    });
    const wrap = document.getElementById('rolling-accuracy-charts');
    if (!wrap) return;
    const types = ['capital', 'flag', 'map', 'mix'];
    wrap.innerHTML = types.map(type => {
      const events = allEventsByType[type];
      const rolling = rollingAccuracyFromEvents(events, ROLLING_K);
      if (rolling.length === 0) return `<div class="rolling-chart"><h4>${type}</h4><p class="small">Geen events</p></div>`;
      const maxVal = 1;
      const points = rolling.map((r, i) => ({ x: i + 1, y: r.value }));
      const width = 400; const height = 120;
      const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x / Math.max(points.length, 1)) * width} ${height - (p.y / maxVal) * height}`).join(' ');
      return `
        <div class="rolling-chart">
          <h4>${type}</h4>
          <svg viewBox="0 0 ${width} ${height}" class="rolling-svg">
            <path d="${pathD}" fill="none" stroke="var(--color-primary)" stroke-width="2"/>
          </svg>
        </div>
      `;
    }).join('');
  }

  // Continent-namen voor weergave (NL)
  const CONTINENT_LABELS = {
    'Europe': 'Europa',
    'Asia': 'Azië',
    'Africa': 'Afrika',
    'Oceania': 'Oceanië',
    'North America': 'Noord-Amerika',
    'South America': 'Zuid-Amerika'
  };

  function renderContinentStats(filteredSessions, countriesMap, perCountry) {
    const isoToContinent = {};
    Object.values(countriesMap).forEach(c => { isoToContinent[c.iso] = c.continent; });
    const byContinent = {};
    Object.values(perCountry).forEach(c => {
      const cont = isoToContinent[c.iso] || 'Other';
      if (!byContinent[cont]) byContinent[cont] = { countries: [], totalQuestions: 0, totalCorrect: 0, totalResponseTimeMs: 0 };
      byContinent[cont].countries.push(c);
      byContinent[cont].totalQuestions += c.seen_count;
      byContinent[cont].totalCorrect += c.correct_count;
      byContinent[cont].totalResponseTimeMs += c.totalResponseTimeMs || 0;
    });
    const heatWrap = document.getElementById('continent-heatmap');
    const detailsWrap = document.getElementById('continent-details');
    if (!heatWrap || !detailsWrap) return;

    const contOrder = ['Europe', 'Asia', 'Africa', 'Oceania', 'North America', 'South America'];
    const cards = contOrder.filter(c => byContinent[c]).map(cont => {
      const d = byContinent[cont];
      const acc = d.totalQuestions ? d.totalCorrect / d.totalQuestions : 0;
      const avgRt = d.totalQuestions ? d.totalResponseTimeMs / d.totalQuestions : null;
      const unique = d.countries.length;
      const best = [...d.countries].sort((a, b) => b.accuracy - a.accuracy).filter(c => c.seen_count >= 2).slice(0, 5);
      const worst = [...d.countries].sort((a, b) => a.accuracy - b.accuracy).filter(c => c.seen_count >= 2).slice(0, 5);
      const byType = { capital: 0, flag: 0, map: 0, mix: 0 };
      filteredSessions.forEach(s => {
        Object.entries(s.perCountryStats || {}).forEach(([iso, stat]) => {
          if (isoToContinent[iso] !== cont) return;
          const t = s.quizType || 'mix';
          byType[t] = (byType[t] || 0) + (stat.seen_count || 0);
        });
      });
      return {
        cont,
        label: CONTINENT_LABELS[cont] || cont,
        accuracy: acc,
        totalQuestions: d.totalQuestions,
        uniqueCountries: unique,
        avgResponseTimeMs: avgRt,
        best,
        worst,
        byType
      };
    });

    heatWrap.innerHTML = `
      <div class="continent-cards">
        ${cards.map(c => `
          <div class="continent-card" style="--acc:${c.accuracy}" data-continent="${c.cont}">
            <span class="continent-name">${c.label}</span>
            <span class="continent-acc">${Math.round(c.accuracy * 100)}%</span>
            <span class="continent-meta">${c.uniqueCountries} landen · ${c.totalQuestions} vragen</span>
          </div>
        `).join('')}
      </div>
    `;

    detailsWrap.innerHTML = cards.map(c => `
      <div class="card continent-detail-card">
        <h3>${c.label}</h3>
        <p>Unieke landen: ${c.uniqueCountries} · Vragen: ${c.totalQuestions} · Gem. responstijd: ${c.avgResponseTimeMs != null ? Math.round(c.avgResponseTimeMs) + ' ms' : '—'}</p>
        <div class="continent-two-col">
          <div>
            <strong>Top 5 beste</strong>
            <ul>${c.best.map(x => `<li>${(countriesMap[x.iso]?.name_nl) || x.iso} (${Math.round(x.accuracy * 100)}%)</li>`).join('')}</ul>
          </div>
          <div>
            <strong>Top 5 slechtste</strong>
            <ul>${c.worst.map(x => `<li>${(countriesMap[x.iso]?.name_nl) || x.iso} (${Math.round(x.accuracy * 100)}%)</li>`).join('')}</ul>
          </div>
        </div>
        <div class="bar-chart small">
          ${Object.entries(c.byType).filter(([, v]) => v > 0).map(([type, count]) => `
            <div class="bar-row"><span class="bar-label">${type}</span><span class="bar-value">${count}</span></div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function showEmpty(show) {
    const el = document.getElementById('stats-empty');
    const panels = document.querySelectorAll('.stats-panel');
    if (el) el.classList.toggle('hidden', !show);
    panels.forEach(p => p.classList.toggle('hidden', show));
  }

  function refreshStats() {
    const history = window.App.loadHistory();
    const sessions = history.sessions || [];
    const filtered = filterSessions(sessions, getCurrentFilters());
    const hasData = filtered.length > 0;

    renderLastUpdated(sessions);
    showEmpty(!hasData);
    if (!hasData) return;

    const perCountry = mergePerCountryStats(filtered);
    const responseTimes = Object.values(perCountry).map(c => c.avgResponseTimeMs).filter(Boolean);
    const p80ResponseTime = responseTimes.length ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.8)] : null;

    renderKpis(filtered);
    renderQuizTypeChart(filtered);
    renderBestWorstCountries(perCountry, window.statsCountriesMap || {}, p80ResponseTime);
    renderExtraInsights(perCountry, window.statsCountriesMap || {});

    renderPerGroupCards(filtered, window.statsGroupsMap || {}, window.statsCountriesMap || {}, perCountry);
    renderRollingAccuracy(filtered, getCurrentFilters().groupId || null);
    renderContinentStats(filtered, window.statsCountriesMap || {}, perCountry);
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.stats-tab');
    const panels = document.querySelectorAll('.stats-panel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const id = tab.getAttribute('aria-controls');
        tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        panels.forEach(p => { p.classList.add('hidden'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const panel = document.getElementById(id);
        if (panel) { panel.classList.remove('hidden'); }
      });
    });
  }

  function initFilters() {
    const periodSelect = document.getElementById('filter-period');
    const customWrap = document.getElementById('wrap-custom-range');
    if (periodSelect) {
      periodSelect.addEventListener('change', () => {
        customWrap.hidden = periodSelect.value !== 'custom';
        refreshStats();
      });
    }
    ['filter-group', 'filter-quiz-type', 'filter-date-from', 'filter-date-to'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', refreshStats);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const [groups, countriesArr] = await Promise.all([
        window.App.loadGroupsFromPages(),
        window.App.loadCountries()
      ]);
      const countriesMap = {};
      countriesArr.forEach(c => { countriesMap[c.iso] = c; });
      const groupsMap = {};
      groups.forEach(g => { groupsMap[g.id] = g; });
      window.statsCountriesMap = countriesMap;
      window.statsGroupsMap = groupsMap;

      const groupSelect = document.getElementById('filter-group');
      if (groupSelect) {
        groupSelect.innerHTML = '<option value="">Alle groepen</option>' +
          groups.map(g => `<option value="${g.id}">${g.title}</option>`).join('');
      }

      initTabs();
      initFilters();
      refreshStats();
    } catch (e) {
      console.error('Stats init:', e);
      document.getElementById('stats-empty').classList.remove('hidden');
      document.querySelectorAll('.stats-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById('stats-empty').innerHTML = '<p>Kon data niet laden. Start een lokale server (bijv. <code>python -m http.server</code>).</p>';
    }
  });
})();
