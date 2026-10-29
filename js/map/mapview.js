/**
 * MapView — één herbruikbare kaart voor de hele site (MapLibre GL + d3-geo).
 *
 * Vereist d3 v7 en maplibre-gl 4 (cdnjs, met maplibre-gl.css) vóór dit script.
 * Alleen MapView.loadGeo gebruiken (zonder kaart) kan ook zonder maplibre. Gebruik:
 *
 *   const map = new MapView(el, { geo: '../assets/maps/world.detail.json', style: 'sat', names });
 *   await map.ready;
 *   map.setGroup(ids); map.fitTo(ids);   // fitTo(ids, { padding, maxZoom, animate })
 *   map.on('click', iso => …); map.on('hover', iso => …);
 *   map.setTarget(iso);         // pulserend doel ("welk land is dit?")
 *   map.setHighlight(iso);      // zachte markering (bijv. hover in een lijst)
 *   map.flash(iso, true);       // kort groen (true) of rood (false)
 *   map.setDone(isos);          // al goed beantwoord
 *   map.setColors({iso: kleur}); // eigen vulkleur per land
 *   map.setVisible(isos);       // alleen deze landen tekenen (null = alle)
 *   map.setPoints([{id, ll}]);  // hoofdsteden als stipjes; map.setPointHighlight(id)
 *   map.setPins([{ll, ok}]);    // spelden (gok en antwoord) met een lijn ertussen
 *   map.on('clickpoint', ll => …) // elke klik, als [lon, lat]
 *   map.setProjection('globe');  // aardbol i.p.v. platte kaart (vereist maplibre-gl 5)
 *
 * De kaart tekent via WebGL (GPU): de grenzen worden één keer opgebouwd en
 * schuiven/zoomen kost daarna bijna niets. Kleuren lopen via feature-state,
 * zodat een hover alleen dat ene land bijwerkt.
 *
 * Kleine landen krijgen automatisch een klikbare stip zolang ze op het scherm
 * te klein zijn. De kaart herhaalt zich horizontaal, zodat Oceanië over de
 * datumgrens in één beeld past.
 */
(function () {
  const TILE = 256;
  const DOT_PX = 140;
  const MAX_K = 4000;          // verste inzoom van fitTo
  const MAX_ZOOM = 15;         // handmatig inzoomen mag verder: Esri is tot op straatniveau scherp
  const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const SAT_ATTR = 'Beelden © Esri, Maxar, Earthstar Geographics';
  // Ankerpunten voor landen die niet in het kaartbestand staan.
  const EXTRA_ANCHORS = { MDV: [73.5, 3.2] };
  const NONE = 'rgba(0,0,0,0)';

  const STYLES = {
    sat: {
      // Gedeelde grenzen worden per land getekend (dus dubbel): daarom lichtere lijnen.
      tiles: true, sea: '#0a1322', other: null, group: 'rgba(255,255,255,.10)',
      border: 'rgba(6,10,22,.5)', halo: 'rgba(2,6,23,.14)', borderW: 1,
      hover: 'rgba(255,255,255,.32)', target: ['rgba(255,255,255,.92)', 'rgba(255,255,255,.92)'], ring: '#ffffff',
      done: 'rgba(16,185,129,.42)', ok: 'rgba(16,185,129,.8)', bad: 'rgba(239,68,68,.8)',
      dot: 'rgba(255,255,255,.6)', dotGroup: 'rgba(255,255,255,.95)', dotLine: 'rgba(15,23,42,.65)'
    },
    light: {
      sea: ['#dbeafe', '#cfe3fb'], other: '#eef2f7', group: '#ffffff', border: '#b9c7da', borderW: .8,
      hover: '#dbe7ff', target: ['#2563eb', '#06b6d4'], ring: '#2563eb',
      done: '#bbf7d0', ok: '#10b981', bad: '#ef4444', grat: 'rgba(37,99,235,.08)',
      dot: '#e2e8f0', dotGroup: '#ffffff', dotLine: '#8aa0bd'
    },
    dark: {
      sea: ['#0a1322', '#070d19'], other: '#131d31', group: '#1f2e4c', border: '#33486f', borderW: .8,
      hover: '#2a3f66', target: ['#60a5fa', '#22d3ee'], ring: '#7dd3fc',
      done: '#14532d', ok: '#34d399', bad: '#f87171', grat: 'rgba(148,163,184,.07)',
      dot: '#22314d', dotGroup: '#3b5a8f', dotLine: '#5b7bb0'
    },
    // Geen satelliet, alleen omtrekken (bijv. Grensroute), voor licht en donker thema.
    outline: {
      sea: '#f4f7fb', other: null, group: 'rgba(37,99,235,.08)', border: '#334155', borderW: 1.2,
      hover: '#dbe7ff', target: ['#2563eb', '#2563eb'], ring: '#2563eb',
      done: '#bbf7d0', ok: '#10b981', bad: '#ef4444',
      dot: '#e2e8f0', dotGroup: '#ffffff', dotLine: '#475569'
    },
    outlineDark: {
      sea: '#0b1220', other: null, group: 'rgba(96,165,250,.12)', border: '#94a3b8', borderW: 1.2,
      hover: '#1e3a5f', target: ['#60a5fa', '#60a5fa'], ring: '#7dd3fc',
      done: '#14532d', ok: '#34d399', bad: '#f87171',
      dot: '#22314d', dotGroup: '#3b5a8f', dotLine: '#94a3b8'
    }
  };

  // Gedeelde cache: elk geo-bestand wordt maar één keer geladen en voorbewerkt.
  const geoCache = new Map();
  const merc = d3.geoMercator().scale(TILE / (2 * Math.PI)).translate([TILE / 2, TILE / 2]);
  const mpath = d3.geoPath(merc);

  function mainPart(f) {
    if (f.geometry.type !== 'MultiPolygon') return f;
    let best = null, bestA = -1;
    for (const c of f.geometry.coordinates) {
      const g = { type: 'Polygon', coordinates: c }, a = d3.geoArea(g);
      if (a > bestA) { bestA = a; best = g; }
    }
    return { type: 'Feature', geometry: best };
  }

  function loadGeo(url) {
    if (!geoCache.has(url)) {
      geoCache.set(url, fetch(url).then(r => {
        if (!r.ok) throw new Error(`Kaart laden mislukt (${r.status})`);
        return r.json();
      }).then(geo => {
        const byId = new Map(), area = new Map(), anchor = new Map(), main = new Map();
        for (const f of geo.features) {
          // Enkele ringen in de bron draaien verkeerd om en zouden de hele wereld bedekken.
          if (d3.geoArea(f) > 2 * Math.PI) f.geometry.coordinates.forEach(poly => poly.forEach(r => r.reverse()));
          f.properties = Object.assign({}, f.properties, { iso: f.id });
          byId.set(f.id, f);
          const mp = mainPart(f); main.set(f.id, mp);
          area.set(f.id, mpath.area(f));
          const pr = f.properties;
          anchor.set(f.id, pr.lx != null ? [pr.lx, pr.ly] : d3.geoCentroid(mp));
        }
        for (const [iso, ll] of Object.entries(EXTRA_ANCHORS)) if (!anchor.has(iso)) anchor.set(iso, ll);
        return { geojson: geo, features: geo.features, byId, area, anchor, main };
      }));
    }
    return geoCache.get(url);
  }

  const fc = features => ({ type: 'FeatureCollection', features });
  const pt = (ll, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: ll } });
  // MapLibre-zoom z ↔ schaal k (wereld = 256·k px = 512·2^z px).
  const kOf = z => Math.pow(2, z + 1);
  const zOf = k => Math.log2(k) - 1;

  class MapView {
    constructor(el, opts = {}) {
      this.el = el;
      this.opts = opts;
      this.styleName = opts.style || 'sat';
      this.projection = opts.projection || 'mercator';
      this.names = opts.names || null;          // {iso: naam}: alleen deze landen krijgen stippen/klik
      this.dotsFor = opts.dotsFor || 'group';   // 'group' | 'all' | 'none'
      this.group = new Set(opts.group || []);
      this.done = new Set();
      this.hover = null; this.highlight = null; this.target = null; this.flashState = null;
      this.listeners = { click: [], hover: [], clickpoint: [] };
      this.points = []; this.pointHighlight = null; this.pins = []; this.colors = {};
      this.visible = null;      // Set van landen die getekend worden, of null voor alle
      this.fills = new Map();   // iso → laatst gezette vulkleur (feature-state)
      this.keys = {};           // laatst geschreven bronnen, om dubbel werk te vermijden
      this.pulse0 = performance.now();

      el.classList.add('mapview');
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      this.box = document.createElement('div');
      this.box.style.cssText = 'position:absolute;inset:0';
      el.appendChild(this.box);

      this.map = new maplibregl.Map({
        container: this.box,
        style: this._baseStyle(),
        center: [10, 20], zoom: 0, minZoom: -1, maxZoom: MAX_ZOOM,
        renderWorldCopies: true,
        dragRotate: false, pitchWithRotate: false, touchPitch: false, doubleClickZoom: false,
        attributionControl: { compact: true },
        fadeDuration: 0
      });
      this.map.touchZoomRotate.disableRotation();
      this.map.keyboard.disableRotation();
      this.canvas = this.map.getCanvas();
      this.canvas.setAttribute('aria-label', opts.label || 'Kaart');

      this.map.on('click', e => {
        const iso = this._hitAt(e.point);
        if (iso) this.listeners.click.forEach(fn => fn(iso, e.originalEvent));
        if (this.listeners.clickpoint.length) {
          const ll = e.lngLat.wrap();
          this.listeners.clickpoint.forEach(fn => fn([ll.lng, ll.lat], e.originalEvent));
        }
      });
      this.map.on('mousemove', e => {
        this._movePt = e.point;
        if (this._moveQueued) return;
        this._moveQueued = true;
        requestAnimationFrame(() => { this._moveQueued = false; if (!this.destroyed) this._onMove(this._movePt); });
      });
      this.canvas.addEventListener('pointerleave', () => this._setHover(null));
      this.map.on('move', () => this._schedule());

      this.ro = new ResizeObserver(() => { if (!this.destroyed) this.map.resize(); });
      this.ro.observe(el);

      const loaded = new Promise(res => this.map.once('load', res)).then(() => {
        // Bronvermelding ingeklapt tot het i-knopje.
        const a = this.box.querySelector('.maplibregl-ctrl-attrib');
        if (a) a.classList.remove('maplibregl-compact-show');
      });
      this.ready = Promise.all([loadGeo(opts.geo), loaded]).then(([g]) => {
        this.map.getSource('countries').setData(g.geojson);
        this.geo = g;
        this._sync();
        return this;
      });
    }

    /* ---------- Publieke API ---------- */
    on(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); return this; }
    setStyle(name) {
      this.styleName = STYLES[name] ? name : 'sat';
      if (this.map.isStyleLoaded()) this._applyStyle();
      this._schedule();
    }
    setGroup(ids) { this.group = new Set(ids || []); this._schedule(); }
    setDone(ids) { this.done = new Set(ids || []); this._schedule(); }
    setHighlight(iso) { this.highlight = iso || null; this._schedule(); }
    setTarget(iso) { this.target = iso || null; this.pulse0 = performance.now(); this._schedule(); }
    flash(iso, ok, ms = 700) {
      clearTimeout(this._flashTimer);
      this.flashState = { iso, ok };
      this._schedule();
      this._flashTimer = setTimeout(() => { this.flashState = null; this._schedule(); }, ms);
    }
    /** Custom fill per country, e.g. heat colours: {iso: '#ff0000'}. */
    setColors(colors) { this.colors = colors || {}; this._schedule(); }
    setProjection(name) {
      this.projection = name === 'globe' ? 'globe' : 'mercator';
      if (this.map.setProjection && this.map.isStyleLoaded()) this.map.setProjection({ type: this.projection });
      this._schedule();
    }
    setVisible(ids) { this.visible = ids ? new Set(ids) : null; this._schedule(); }
    setPoints(points) { this.points = points || []; this._schedule(); }
    setPointHighlight(id) { this.pointHighlight = id || null; this._schedule(); }
    setPins(pins) { this.pins = pins || []; this._schedule(); }
    /** Great-circle distance in km. */
    static distanceKm(a, b) { return d3.geoDistance(a, b) * 6371; }
    zoomBy(f) { this.map.easeTo({ zoom: this.map.getZoom() + Math.log2(f), duration: 300 }); }
    has(iso) { return !!this.geo && (this.geo.byId.has(iso) || this.geo.anchor.has(iso)); }

    fitTo(ids, { animate = true, padding = .86, maxZoom = zOf(MAX_K) } = {}) {
      if (!this.geo) return this.ready.then(() => this.fitTo(ids, { animate, padding, maxZoom }));
      const g = this.geo;
      const point = id => { const a = merc(g.anchor.get(id)); return [a, a]; };
      // Een land dat zelf over de datumgrens loopt (Rusland, Fiji) telt met zijn ankerpunt mee.
      let boxes = (ids || []).filter(id => g.main.has(id) || g.anchor.has(id)).map(id => {
        if (!g.main.has(id)) return point(id);
        const b = mpath.bounds(g.main.get(id));
        return b[1][0] - b[0][0] < TILE / 2 ? b : point(id);
      });
      if (!boxes.length) return;
      if (this.projection === 'globe') return this._fitGlobe(ids, padding, animate, k => Math.min(MAX_K, kOf(maxZoom), k));
      // Een set die over de datumgrens loopt (Oceanië) schuift één wereld op.
      const cx = boxes.map(b => (b[0][0] + b[1][0]) / 2);
      if (Math.max(...cx) - Math.min(...cx) > TILE / 2 && boxes.length < 60) {
        boxes = boxes.map((b, i) => cx[i] < TILE / 2 ? [[b[0][0] + TILE, b[0][1]], [b[1][0] + TILE, b[1][1]]] : b);
      }
      const x0 = d3.min(boxes, b => b[0][0]), y0 = d3.min(boxes, b => b[0][1]);
      const x1 = d3.max(boxes, b => b[1][0]), y1 = d3.max(boxes, b => b[1][1]);
      const W = Math.max(1, this.box.clientWidth), H = Math.max(1, this.box.clientHeight);
      const k = Math.min(MAX_K, kOf(maxZoom), Math.max(1, padding * Math.min(W / Math.max(.02, x1 - x0), H / Math.max(.02, y1 - y0))));
      const [lon, lat] = merc.invert([(((x0 + x1) / 2) % TILE + TILE) % TILE, (y0 + y1) / 2]);
      const cam = { center: [lon, lat], zoom: zOf(k) };
      if (animate) this.map.easeTo({ ...cam, duration: 850, easing: d3.easeCubicInOut });
      else this.map.jumpTo(cam);
    }

    // Globe: midden op het zwaartepunt, en zo ver uitzoomen dat het verste punt nog op de bol in beeld staat.
    _fitGlobe(ids, padding, animate, clamp) {
      const g = this.geo, pts = [];
      for (const id of ids) {
        if (g.anchor.has(id)) pts.push(g.anchor.get(id));
        if (g.main.has(id)) { const [[x0, y0], [x1, y1]] = d3.geoBounds(g.main.get(id)); if (x1 - x0 < 180) pts.push([x0, y0], [x1, y0], [x0, y1], [x1, y1]); }
      }
      if (!pts.length) return;
      const c = d3.geoCentroid({ type: 'MultiPoint', coordinates: pts });
      const far = Math.min(Math.PI / 2, Math.max(.002, ...pts.map(p => d3.geoDistance(c, p))));
      const W = Math.max(1, this.box.clientWidth), H = Math.max(1, this.box.clientHeight);
      // Straal van de bol in px = 512·2^z / (2π·cos φ) in MapLibre 5; wereld = 256·k px.
      const R = padding * Math.min(W, H) / 2 / Math.sin(far);
      const k = clamp(Math.max(1, R * 2 * Math.PI * Math.cos(c[1] * Math.PI / 180) / TILE));
      const cam = { center: c, zoom: zOf(k) };
      if (animate) this.map.easeTo({ ...cam, duration: 850, easing: d3.easeCubicInOut });
      else this.map.jumpTo(cam);
    }

    destroy() {
      this.destroyed = true;
      this.ro.disconnect();
      clearTimeout(this._flashTimer);
      this.map.remove();
      this.box.remove();
    }

    /* ---------- Intern ---------- */
    _baseStyle() {
      const st = STYLES[this.styleName];
      const sea = Array.isArray(st.sea) ? st.sea[0] : st.sea;
      const empty = fc([]);
      const fill = ['to-color', ['coalesce', ['feature-state', 'fill'], NONE]];
      return {
        version: 8,
        ...(this.projection === 'globe' ? { projection: { type: 'globe' } } : {}),
        sources: {
          sat: { type: 'raster', tiles: [SAT_URL], tileSize: 256, maxzoom: 19, attribution: SAT_ATTR },
          // Brondata blijft volledig; MapLibre rondt per zoomniveau alleen onder-pixel af.
          countries: { type: 'geojson', data: empty, promoteId: 'iso', tolerance: .2, maxzoom: 12 },
          dots: { type: 'geojson', data: empty },
          points: { type: 'geojson', data: empty },
          pins: { type: 'geojson', data: empty },
          pinline: { type: 'geojson', data: empty }
        },
        layers: [
          { id: 'sea', type: 'background', paint: { 'background-color': sea } },
          { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: st.tiles ? 'visible' : 'none' } },
          { id: 'fill', type: 'fill', source: 'countries', paint: { 'fill-color': fill, 'fill-antialias': false } },
          { id: 'halo', type: 'line', source: 'countries', layout: { 'line-join': 'round', visibility: st.halo ? 'visible' : 'none' },
            paint: { 'line-color': st.halo || NONE, 'line-width': 3.5 } },
          { id: 'border', type: 'line', source: 'countries', layout: { 'line-join': 'round' },
            paint: { 'line-color': st.border, 'line-width': st.borderW } },
          { id: 'ring', type: 'line', source: 'countries', filter: ['==', ['get', 'iso'], ''], layout: { 'line-join': 'round' },
            paint: { 'line-color': st.ring, 'line-width': 2.2 } },
          { id: 'ring-pulse', type: 'line', source: 'countries', filter: ['==', ['get', 'iso'], ''], layout: { 'line-join': 'round' },
            paint: { 'line-color': st.ring, 'line-width': 2, 'line-opacity': .55 } },
          { id: 'dots', type: 'circle', source: 'dots',
            paint: { 'circle-radius': 6, 'circle-color': ['get', 'c'], 'circle-stroke-width': 1.5, 'circle-stroke-color': st.dotLine } },
          { id: 'dot-pulse', type: 'circle', source: 'dots', filter: ['==', ['get', 't'], true],
            paint: { 'circle-radius': 7, 'circle-color': NONE, 'circle-stroke-width': 2, 'circle-stroke-color': st.ring, 'circle-stroke-opacity': 1 } },
          { id: 'points', type: 'circle', source: 'points',
            paint: { 'circle-radius': ['case', ['get', 'hi'], 5, 3.2], 'circle-color': ['case', ['get', 'hi'], '#facc15', '#ffffff'],
              'circle-stroke-width': ['case', ['get', 'hi'], 2, 1.3], 'circle-stroke-color': 'rgba(15,23,42,.85)' } },
          { id: 'pinline', type: 'line', source: 'pinline',
            paint: { 'line-color': 'rgba(255,255,255,.9)', 'line-width': 2, 'line-dasharray': [3, 2.5] } },
          { id: 'pins', type: 'circle', source: 'pins',
            paint: { 'circle-radius': 7, 'circle-color': ['get', 'c'], 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' } }
        ]
      };
    }

    _applyStyle() {
      const st = STYLES[this.styleName], m = this.map;
      m.setPaintProperty('sea', 'background-color', Array.isArray(st.sea) ? st.sea[0] : st.sea);
      m.setLayoutProperty('sat', 'visibility', st.tiles ? 'visible' : 'none');
      m.setLayoutProperty('halo', 'visibility', st.halo ? 'visible' : 'none');
      if (st.halo) m.setPaintProperty('halo', 'line-color', st.halo);
      m.setPaintProperty('border', 'line-color', st.border);
      m.setPaintProperty('border', 'line-width', st.borderW);
      m.setPaintProperty('ring', 'line-color', st.ring);
      m.setPaintProperty('ring-pulse', 'line-color', st.ring);
      m.setPaintProperty('dots', 'circle-stroke-color', st.dotLine);
      m.setPaintProperty('dot-pulse', 'circle-stroke-color', st.ring);
      this.keys = {};
    }

    _schedule() {
      if (this.queued || this.destroyed) return;
      this.queued = true;
      requestAnimationFrame(now => { this.queued = false; this._sync(now); });
    }

    _k() { return kOf(this.map.getZoom()); }

    _eligible(iso) { return (!this.names || iso in this.names) && (!this.visible || this.visible.has(iso)); }

    _isDot(iso, k = this._k()) {
      if (!this._eligible(iso)) return false;
      if (!this.geo.byId.has(iso)) return true;
      return this.geo.area.get(iso) * k * k < DOT_PX;
    }

    _dots() {
      const out = [], k = this._k();
      // Op de globe: geen stippen (en dus ook geen klikken) op de achterkant.
      const c = this.projection === 'globe' && this.map.getCenter();
      for (const iso of this.geo.anchor.keys()) {
        if (this.dotsFor === 'none' && iso !== this.target) continue;
        if (c && d3.geoDistance(this.geo.anchor.get(iso), [c.lng, c.lat]) > 1.45) continue;
        if ((this.dotsFor === 'all' || this.group.has(iso) || iso === this.target) && this._isDot(iso, k)) out.push(iso);
      }
      return out;
    }

    // Schermposities van een punt in alle kopieën van de wereld.
    _screen(ll) {
      const p = this.map.project(ll), w = TILE * this._k(), out = [];
      for (let o = -2; o <= 2; o++) out.push([p.x + o * w, p.y]);
      return out;
    }

    _hitAt(pt) {
      if (!this.geo) return null;
      for (const iso of this._dots()) {
        for (const p of this._screen(this.geo.anchor.get(iso))) if (Math.hypot(p[0] - pt.x, p[1] - pt.y) < 11) return iso;
      }
      const f = this.map.queryRenderedFeatures([pt.x, pt.y], { layers: ['fill'] })[0];
      const iso = f && f.properties.iso;
      return iso && this._eligible(iso) ? iso : null;
    }

    _onMove(pt) {
      const iso = this._hitAt(pt);
      this.canvas.style.cursor = iso && this.listeners.click.length ? 'pointer' : '';
      this._setHover(iso);
    }

    _setHover(iso) {
      if (iso === this.hover) return;
      this.hover = iso;
      this.listeners.hover.forEach(fn => fn(iso));
      this._schedule();
    }

    _fill(iso, st) {
      if (this.flashState && this.flashState.iso === iso) return this.flashState.ok ? st.ok : st.bad;
      if (iso === this.target) return 'TARGET';
      if (this.colors[iso]) return this.colors[iso];
      if (this.done.has(iso)) return st.done;
      if (iso === this.highlight || (iso === this.hover && this.opts.hoverHighlight !== false)) return st.hover;
      if (this.group.has(iso)) return st.group;
      return st.other;
    }

    _setData(id, key, data) {
      if (this.keys[id] === key) return;
      this.keys[id] = key;
      this.map.getSource(id).setData(data);
    }

    // Zet de staat (kleuren, stippen, spelden, doel) over naar de kaart; alleen wat veranderd is.
    _sync(now = performance.now()) {
      if (!this.geo || this.destroyed) return;
      const st = STYLES[this.styleName], m = this.map, k = this._k();

      for (const f of this.geo.features) {
        let c = this._fill(f.id, st);
        if (c === 'TARGET') c = st.target[0];
        c = c || NONE;
        if (this.fills.get(f.id) !== c) { this.fills.set(f.id, c); m.setFeatureState({ source: 'countries', id: f.id }, { fill: c }); }
      }

      const visKey = this.visible ? [...this.visible].sort().join(',') : '*';
      if (this.keys.visible !== visKey) {
        this.keys.visible = visKey;
        const f = this.visible ? ['in', ['get', 'iso'], ['literal', [...this.visible]]] : null;
        ['fill', 'halo', 'border'].forEach(l => m.setFilter(l, f));
      }

      const ringIso = this.target && this.geo.byId.has(this.target) && !this._isDot(this.target, k) ? this.target : '';
      if (this.keys.ring !== ringIso) {
        this.keys.ring = ringIso;
        m.setFilter('ring', ['==', ['get', 'iso'], ringIso]);
        m.setFilter('ring-pulse', ['==', ['get', 'iso'], ringIso]);
      }

      const dots = this._dots().map(iso => {
        let c = this._fill(iso, st);
        const t = c === 'TARGET';
        if (!c || c === st.group || c === st.other) c = this.group.has(iso) ? st.dotGroup : st.dot;
        return pt(this.geo.anchor.get(iso), { iso, c: t ? st.target[0] : c, t });
      });
      this._setData('dots', dots.map(d => d.properties.iso + d.properties.c).join('|'), fc(dots));

      const pts = this.points.map(p => pt(p.ll, { hi: p.id === this.pointHighlight }));
      this._setData('points', this.points.map(p => p.id + p.ll).join('|') + '#' + this.pointHighlight, fc(pts));

      const pinKey = this.pins.map(p => p.ll + ':' + p.ok).join('|') + st.ok + st.bad;
      this._setData('pins', pinKey, fc(this.pins.map(p => pt(p.ll, { c: p.ok ? st.ok : st.bad }))));
      let line = [];
      if (this.pins.length > 1) {
        // Kortste weg: gaat de lijn over de datumgrens, schuif het tweede punt één wereld op.
        const a = this.pins[0].ll, b = this.pins[1].ll.slice();
        if (b[0] - a[0] > 180) b[0] -= 360; else if (a[0] - b[0] > 180) b[0] += 360;
        line = [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a, b] } }];
      }
      this._setData('pinline', pinKey, fc(line));

      // Pulserend doel: alleen de pulslaag verandert per frame.
      if (this.target) {
        const pulse = (Math.max(0, now - this.pulse0) % 1400) / 1400;
        if (ringIso) {
          m.setPaintProperty('ring-pulse', 'line-opacity', (1 - pulse) * .55);
          m.setPaintProperty('ring-pulse', 'line-width', 2 + pulse * 10);
        } else {
          m.setPaintProperty('dot-pulse', 'circle-radius', 7 + pulse * 14);
          m.setPaintProperty('dot-pulse', 'circle-stroke-opacity', 1 - pulse);
        }
        this._schedule();
      }
    }
  }

  MapView.STYLES = STYLES;
  MapView.loadGeo = loadGeo;
  window.MapView = MapView;
})();
