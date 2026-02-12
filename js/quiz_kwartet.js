/**
 * Kwartet-quiz: match kaart, landnaam, hoofdstad en vlag voor één land.
 * Quiz kiest een random land; gebruiker selecteert in elke kolom de bijbehorende optie en klikt Opslaan.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const groupId = window.App.getQueryParam('id');
  const titleEl = document.getElementById('quiz-title');
  const subtitleEl = document.getElementById('quiz-subtitle');
  const deckStatusEl = document.getElementById('deck-status');
  const hintContentEl = document.getElementById('kwartet-hint-content');
  const colLandEl = document.getElementById('kwartet-col-land');
  const colCapitalEl = document.getElementById('kwartet-col-capital');
  const colFlagEl = document.getElementById('kwartet-col-flag');
  const listLandEl = document.getElementById('kwartet-list-land');
  const listCapitalEl = document.getElementById('kwartet-list-capital');
  const listFlagEls = [
    document.getElementById('kwartet-list-flag-1'),
    document.getElementById('kwartet-list-flag-2'),
    document.getElementById('kwartet-list-flag-3')
  ];
  const btnOpslaan = document.getElementById('kwartet-opslaan');
  const statusEl = document.getElementById('kwartet-status');

  if (!groupId) {
    statusEl.textContent = 'Geen deel geselecteerd. Ga terug en kies een deel.';
    statusEl.className = 'status-label bad';
    return;
  }

  let group;
  let countriesMap;
  let countryList = []; // { iso, name_nl, capitals_nl }
  const completed = new Set(); // ISO codes die goed zijn gemaakt
  let targetIso = null; // Huidig te vinden land
  let hintType = null; // 'capital' | 'land' | 'flag' — welk gegeven wordt getoond
  const selection = { map: null, land: null, capital: null, flag: null };
  let satelliteMapInitialized = false;

  const HINT_TYPES = ['capital', 'land', 'flag'];

  function getIsoFromMapFeature(feature) {
    if (!feature || !feature.properties) return null;
    const iso = window.SatelliteMap && window.SatelliteMap.getIsoFromProperties
      ? window.SatelliteMap.getIsoFromProperties(feature.properties)
      : (feature.properties.iso_a3 || feature.properties.ISO_A3 || feature.properties.adm0_a3 || feature.properties.iso_a2);
    return iso ? window.App.normalizeCountryIso(String(iso).trim().toUpperCase()) : null;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function updateDeckStatus() {
    deckStatusEl.textContent = `${completed.size} / ${group.countries.length} kwartetten`;
  }

  function pickNextTarget() {
    const remaining = group.countries.filter(iso => !completed.has(iso));
    if (remaining.length === 0) return null;
    return remaining[Math.floor(Math.random() * remaining.length)];
  }

  function clearSelection() {
    selection.map = null;
    selection.land = null;
    selection.capital = null;
    selection.flag = null;
    document.querySelectorAll('.kwartet-option.selected').forEach(el => el.classList.remove('selected'));
    if (window.SatelliteMap) window.SatelliteMap.highlightCountry(null);
    updateOpslaanButton();
  }

  function getRequiredSelections() {
    if (!hintType) return [];
    const all = ['map', 'land', 'capital', 'flag'];
    return all.filter(col => col !== hintType);
  }

  function hasAllSelections() {
    const required = getRequiredSelections();
    return required.every(col => (col === 'map' ? selection.map : selection[col]));
  }

  function updateOpslaanButton() {
    btnOpslaan.disabled = !hasAllSelections();
  }

  function setTarget(iso) {
    targetIso = iso;
    const c = countriesMap[iso];
    if (!c) return;
    hintType = HINT_TYPES[Math.floor(Math.random() * HINT_TYPES.length)];
    clearSelection();

    // Toon het gegeven (random: hoofdstad, landnaam of vlag)
    if (hintType === 'capital') {
      hintContentEl.innerHTML = `<strong>${c.capitals_nl.join(', ')}</strong> <span class="kwartet-hint-type">(hoofdstad)</span>`;
    } else if (hintType === 'land') {
      hintContentEl.innerHTML = `<strong>${c.name_nl}</strong> <span class="kwartet-hint-type">(land)</span>`;
    } else {
      hintContentEl.innerHTML = `<img src="../assets/flags/${window.App.getFlagFilename(c.iso)}" alt="" class="kwartet-hint-flag"> <span class="kwartet-hint-type">(vlag)</span>`;
    }

    // Toon alleen de 3 kolommen waar de speler uit kiest (verberg de gegeven kolom)
    colLandEl.style.display = hintType === 'land' ? 'none' : '';
    colCapitalEl.style.display = hintType === 'capital' ? 'none' : '';
    colFlagEl.style.display = hintType === 'flag' ? 'none' : '';
  }

  function markCompletedInLists(iso) {
    listLandEl.querySelectorAll(`[data-iso="${iso}"]`).forEach(el => {
      el.classList.add('kwartet-completed');
      el.setAttribute('aria-disabled', 'true');
    });
    listCapitalEl.querySelectorAll(`[data-iso="${iso}"]`).forEach(el => {
      el.classList.add('kwartet-completed');
      el.setAttribute('aria-disabled', 'true');
    });
    listFlagEls.forEach(list => {
      if (list) list.querySelectorAll(`[data-iso="${iso}"]`).forEach(el => {
        el.classList.add('kwartet-completed');
        el.setAttribute('aria-disabled', 'true');
      });
    });
  }

  function flashRed() {
    const els = [];
    if (hintType !== 'land' && selection.land) els.push(listLandEl.querySelector(`[data-iso="${selection.land}"]`));
    if (hintType !== 'capital' && selection.capital) els.push(listCapitalEl.querySelector(`[data-iso="${selection.capital}"]`));
    if (hintType !== 'flag' && selection.flag) {
      listFlagEls.forEach(list => {
        const el = list && list.querySelector(`[data-iso="${selection.flag}"]`);
        if (el) els.push(el);
      });
    }
    els.filter(Boolean).forEach(el => el.classList.add('kwartet-flash'));
    const mapEl = document.querySelector('.kwartet-map-wrapper');
    if (mapEl && selection.map) mapEl.classList.add('kwartet-flash');
    setTimeout(() => {
      els.filter(Boolean).forEach(el => el.classList.remove('kwartet-flash'));
      if (mapEl) mapEl.classList.remove('kwartet-flash');
      clearSelection();
    }, 400);
  }

  function checkAnswer() {
    if (!targetIso || !hasAllSelections()) return;
    const required = getRequiredSelections();
    const correct = required.every(col =>
      (col === 'map' ? selection.map : selection[col]) === targetIso
    );

    if (correct) {
      completed.add(targetIso);
      markCompletedInLists(targetIso);
      if (window.SatelliteMap && window.SatelliteMap.setCompletedCountries) {
        window.SatelliteMap.setCompletedCountries(Array.from(completed));
      }
      updateDeckStatus();
      const next = pickNextTarget();
      if (next) {
        setTarget(next);
        statusEl.textContent = 'Goed! Volgende kwartet.';
        statusEl.className = 'status-label ok';
      } else {
        statusEl.textContent = 'Alles goed! Je hebt alle kwartetten gemaakt.';
        statusEl.className = 'status-label ok';
        hintContentEl.textContent = '';
        btnOpslaan.disabled = true;
        clearSelection();
      }
    } else {
      statusEl.textContent = 'Niet goed. Probeer opnieuw.';
      statusEl.className = 'status-label bad';
      flashRed();
    }
  }

  function renderLists() {
    const shuffledCountries = shuffle(countryList);
    listLandEl.innerHTML = shuffledCountries.map(c => `
      <li class="kwartet-option" data-iso="${c.iso}" role="button" tabindex="0">${c.name_nl}</li>
    `).join('');
    listCapitalEl.innerHTML = shuffle(countryList).map(c => `
      <li class="kwartet-option" data-iso="${c.iso}" role="button" tabindex="0">${c.capitals_nl.join(', ')}</li>
    `).join('');

    const shuffledFlags = shuffle(countryList);
    const n = listFlagEls.length;
    const chunkSize = Math.ceil(shuffledFlags.length / n);
    listFlagEls.forEach((list, i) => {
      if (!list) return;
      const chunk = shuffledFlags.slice(i * chunkSize, (i + 1) * chunkSize);
      list.innerHTML = chunk.map(c => `
        <li class="kwartet-option" data-iso="${c.iso}" role="button" tabindex="0">
          <img src="../assets/flags/${window.App.getFlagFilename(c.iso)}" alt="" class="kwartet-flag-img">
        </li>
      `).join('');
    });

    function bindList(list, col) {
      if (!list) return;
      list.querySelectorAll('.kwartet-option').forEach(opt => {
        opt.addEventListener('click', function () {
          if (this.classList.contains('kwartet-completed')) return;
          const iso = this.getAttribute('data-iso');
          if (col === 'flag') {
            listFlagEls.forEach(l => l && l.querySelectorAll('.kwartet-option.selected').forEach(o => o.classList.remove('selected')));
          } else {
            list.querySelectorAll('.kwartet-option.selected').forEach(o => o.classList.remove('selected'));
          }
          if (selection[col] === iso) {
            selection[col] = null;
          } else {
            selection[col] = iso;
            this.classList.add('selected');
          }
          updateOpslaanButton();
          if (hasAllSelections()) checkAnswer();
        });
        opt.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.click();
          }
        });
      });
    }
    bindList(listLandEl, 'land');
    bindList(listCapitalEl, 'capital');
    listFlagEls.forEach(list => bindList(list, 'flag'));
  }

  try {
    group = await window.App.loadGroupById(groupId);
    countriesMap = await window.App.loadCountriesMap();
    countryList = group.countries.map(iso => {
      const c = countriesMap[iso];
      return c ? { iso: c.iso, name_nl: c.name_nl, capitals_nl: c.capitals_nl || [] } : { iso, name_nl: iso, capitals_nl: [] };
    }).filter(c => c.capitals_nl.length);

    document.title = `Kwartet – ${group.title}`;
    titleEl.textContent = `Kwartet – ${group.title}`;
    subtitleEl.textContent = `${group.title} · Match kaart, land, hoofdstad en vlag.`;

    renderLists();

    if (window.SatelliteMap) {
      await window.SatelliteMap.init('kwartet-map-container', '../assets/maps/high_res_usa.json');
      satelliteMapInitialized = true;
      if (window.SatelliteMap.setCompletedCountries) {
        window.SatelliteMap.setCompletedCountries([]);
      }
      if (group.countries && group.countries.length > 0) {
        window.SatelliteMap.fitToRegion(group.countries, { padding: { top: 40, bottom: 40, left: 40, right: 40 }, maxZoom: 4, duration: 0 });
      }
      const map = window.SatelliteMap.getMap();
      if (map) {
        map.on('click', (e) => {
          const features = map.queryRenderedFeatures(e.point).filter(f => f.source === 'countries' && f.layer.id && f.layer.id.startsWith('countries'));
          if (features.length === 0) return;
          const feature = features[0];
          const iso = getIsoFromMapFeature(feature);
          if (!iso || completed.has(iso)) return;
          selection.map = selection.map === iso ? null : iso;
          if (selection.map) {
            window.SatelliteMap.highlightCountry(selection.map);
          } else {
            window.SatelliteMap.highlightCountry(null);
          }
          updateOpslaanButton();
          if (hasAllSelections()) checkAnswer();
        });
        map.getCanvas().style.cursor = 'pointer';
      }
    }

    btnOpslaan.addEventListener('click', checkAnswer);
    setTarget(pickNextTarget());
    updateDeckStatus();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Kon gegevens niet laden.';
    statusEl.className = 'status-label bad';
  }

  window.addEventListener('beforeunload', () => {
    if (window.SatelliteMap) window.SatelliteMap.destroy();
  });
});
