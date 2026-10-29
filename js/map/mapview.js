/**
 * MapView — één herbruikbare kaart voor de hele site (canvas + d3-geo).
 *
 * Vereist d3 v7 (cdnjs) vóór dit script. Gebruik:
 *
 *   const map = new MapView(el, { geo: '../assets/maps/world.detail.json', style: 'sat', names });
 *   await map.ready;
 *   map.setGroup(ids); map.fitTo(ids);
 *   map.on('click', iso => …); map.on('hover', iso => …);
 *   map.setTarget(iso);         // pulserend doel ("welk land is dit?")
 *   map.setHighlight(iso);      // zachte markering (bijv. hover in een lijst)
 *   map.flash(iso, true);       // kort groen (true) of rood (false)
 *   map.setDone(isos);          // al goed beantwoord
 *   map.setPoints([{id, ll}]);  // hoofdsteden als stipjes; map.setPointHighlight(id)
 *   map.setPins([{ll, ok}]);    // spelden (gok en antwoord) met een lijn ertussen
 *   map.on('clickpoint', ll => …) // elke klik, als [lon, lat]
 *
 * Kleine landen krijgen automatisch een klikbare stip zolang ze op het scherm
 * te klein zijn. De kaart herhaalt zich horizontaal, zodat Oceanië over de
 * datumgrens in één beeld past.
 */
(function () {
  const TILE = 256;
  const DOT_PX = 140;
  const MAX_TILE_Z = 8;
  const TILE_URL = (z, y, x) =>
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-01-01/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;
  // Ankerpunten voor landen die niet in het kaartbestand staan.
  const EXTRA_ANCHORS = { MDV: [73.5, 3.2] };

  const STYLES = {
    sat: {
      tiles: true, sea: '#0a1322', other: null, group: 'rgba(255,255,255,.10)',
      border: 'rgba(6,10,22,.8)', halo: 'rgba(2,6,23,.3)', borderW: 1.3,
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
        const byId = new Map(), path2d = new Map(), area = new Map(), bounds = new Map(), anchor = new Map(), main = new Map();
        const borders = new Path2D();
        for (const f of geo.features) {
          // Enkele ringen in de bron draaien verkeerd om en zouden de hele wereld bedekken.
          if (d3.geoArea(f) > 2 * Math.PI) f.geometry.coordinates.forEach(poly => poly.forEach(r => r.reverse()));
          byId.set(f.id, f);
          const p = new Path2D(); d3.geoPath(merc, p)(f); path2d.set(f.id, p);
          d3.geoPath(merc, borders)(f);
          const mp = mainPart(f); main.set(f.id, mp);
          area.set(f.id, mpath.area(f));
          bounds.set(f.id, d3.geoBounds(f));
          const pr = f.properties || {};
          anchor.set(f.id, pr.lx != null ? [pr.lx, pr.ly] : d3.geoCentroid(mp));
        }
        for (const [iso, ll] of Object.entries(EXTRA_ANCHORS)) if (!anchor.has(iso)) anchor.set(iso, ll);
        return { features: geo.features, byId, path2d, area, bounds, anchor, main, borders };
      }));
    }
    return geoCache.get(url);
  }

  // Tegels worden ook gedeeld tussen kaarten op dezelfde pagina.
  const tileCache = new Map();
  function getTile(z, y, x, onload) {
    const key = `${z}/${y}/${x}`;
    let t = tileCache.get(key);
    if (!t) {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      t = { im, ready: false, waiters: new Set() };
      im.onload = () => { t.ready = true; t.waiters.forEach(fn => fn()); t.waiters.clear(); };
      im.src = TILE_URL(z, y, x);
      tileCache.set(key, t);
    }
    if (!t.ready && onload) t.waiters.add(onload);
    return t;
  }

  class MapView {
    constructor(el, opts = {}) {
      this.el = el;
      this.opts = opts;
      this.styleName = opts.style || 'sat';
      this.names = opts.names || null;          // {iso: naam}: alleen deze landen krijgen stippen/klik
      this.dotsFor = opts.dotsFor || 'group';   // 'group' | 'all'
      this.group = new Set(opts.group || []);
      this.done = new Set();
      this.hover = null; this.highlight = null; this.target = null; this.flashState = null;
      this.listeners = { click: [], hover: [], clickpoint: [] };
      this.points = []; this.pointHighlight = null; this.pins = [];
      this.T = d3.zoomIdentity;
      this.tileVersion = 0;
      this.baseKey = '';
      this.pulse0 = performance.now();

      el.classList.add('mapview');
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
      this.canvas.setAttribute('aria-label', opts.label || 'Kaart');
      el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.base = document.createElement('canvas');

      this.zoom = d3.zoom().scaleExtent([1, 4000])
        .filter(e => (!e.ctrlKey || e.type === 'wheel') && !e.button)
        .on('zoom', e => { this.T = e.transform; this._schedule(); });
      this.sel = d3.select(this.canvas).call(this.zoom).on('dblclick.zoom', null);

      this.canvas.addEventListener('pointermove', e => this._onMove(e));
      this.canvas.addEventListener('pointerleave', () => this._setHover(null));
      this.canvas.addEventListener('click', e => {
        const iso = this._hitAt(e);
        if (iso) this.listeners.click.forEach(fn => fn(iso, e));
        if (this.listeners.clickpoint.length) {
          const ll = this._lonLatAt(e);
          if (ll) this.listeners.clickpoint.forEach(fn => fn(ll, e));
        }
      });
      this.ro = new ResizeObserver(() => this._resize());
      this.ro.observe(el);

      this.ready = loadGeo(opts.geo).then(g => { this.geo = g; this._resize(); return this; });
    }

    /* ---------- Publieke API ---------- */
    on(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); return this; }
    setStyle(name) { this.styleName = STYLES[name] ? name : 'sat'; this._schedule(); }
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
    setPoints(points) { this.points = points || []; this._schedule(); }
    setPointHighlight(id) { this.pointHighlight = id || null; this._schedule(); }
    setPins(pins) { this.pins = pins || []; this._schedule(); }
    /** Great-circle distance in km. */
    static distanceKm(a, b) { return d3.geoDistance(a, b) * 6371; }
    zoomBy(f) { this.sel.transition().duration(300).call(this.zoom.scaleBy, f); }
    has(iso) { return !!this.geo && (this.geo.byId.has(iso) || this.geo.anchor.has(iso)); }

    fitTo(ids, { animate = true, padding = .86 } = {}) {
      if (!this.geo) return this.ready.then(() => this.fitTo(ids, { animate, padding }));
      const g = this.geo;
      const parts = (ids || []).map(id => g.main.get(id) ||
        (g.anchor.has(id) ? { type: 'Feature', geometry: { type: 'Point', coordinates: g.anchor.get(id) } } : null)).filter(Boolean);
      if (!parts.length) return;
      let boxes = parts.map(p => mpath.bounds(p));
      // Een set die over de datumgrens loopt (Oceanië) schuift één wereld op.
      const cx = boxes.map(b => (b[0][0] + b[1][0]) / 2);
      if (Math.max(...cx) - Math.min(...cx) > TILE / 2 && parts.length < 60) {
        boxes = boxes.map((b, i) => cx[i] < TILE / 2 ? [[b[0][0] + TILE, b[0][1]], [b[1][0] + TILE, b[1][1]]] : b);
      }
      const x0 = d3.min(boxes, b => b[0][0]), y0 = d3.min(boxes, b => b[0][1]);
      const x1 = d3.max(boxes, b => b[1][0]), y1 = d3.max(boxes, b => b[1][1]);
      const k = Math.min(4000, Math.max(1, padding * Math.min(this.W / Math.max(.02, x1 - x0), this.H / Math.max(.02, y1 - y0))));
      const t = d3.zoomIdentity.translate(this.W / 2 - k * (x0 + x1) / 2, this.H / 2 - k * (y0 + y1) / 2).scale(k);
      (animate ? this.sel.transition().duration(850).ease(d3.easeCubicInOut) : this.sel).call(this.zoom.transform, t);
    }

    destroy() { this.ro.disconnect(); this.canvas.remove(); this.destroyed = true; }

    /* ---------- Intern ---------- */
    _resize() {
      const r = this.el.getBoundingClientRect();
      this.DPR = Math.min(2, window.devicePixelRatio || 1);
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
      this.canvas.width = Math.round(this.W * this.DPR); this.canvas.height = Math.round(this.H * this.DPR);
      this.zoom.extent([[0, 0], [this.W, this.H]]);
      this.baseKey = '';
      this._schedule();
    }

    _schedule() {
      if (this.queued || this.destroyed) return;
      this.queued = true;
      requestAnimationFrame(now => this._draw(now));
    }

    _copies() {
      const out = [], T = this.T;
      for (let o = -2; o <= 2; o++) {
        const l = T.x + o * TILE * T.k;
        if (l < this.W && l + TILE * T.k > 0) out.push(o * TILE);
      }
      return out;
    }

    _eligible(iso) { return !this.names || iso in this.names; }

    _isDot(iso) {
      if (!this._eligible(iso)) return false;
      if (!this.geo.byId.has(iso)) return true;
      return this.geo.area.get(iso) * this.T.k * this.T.k < DOT_PX;
    }

    _dots() {
      const out = [];
      for (const iso of this.geo.anchor.keys()) {
        if (this.dotsFor === 'none' && iso !== this.target) continue;
        if ((this.dotsFor === 'all' || this.group.has(iso) || iso === this.target) && this._isDot(iso)) out.push(iso);
      }
      return out;
    }

    _dotPositions(iso) {
      const ll = this.geo.anchor.get(iso); if (!ll) return [];
      const p = merc(ll), T = this.T;
      return this._copies().map(o => [(p[0] + o) * T.k + T.x, p[1] * T.k + T.y]);
    }

    _lonLatAt(e) {
      const r = this.canvas.getBoundingClientRect();
      let wx = (e.clientX - r.left - this.T.x) / this.T.k;
      wx = ((wx % TILE) + TILE) % TILE;
      return merc.invert([wx, (e.clientY - r.top - this.T.y) / this.T.k]);
    }

    _screen(ll) {
      const p = merc(ll), T = this.T;
      return this._copies().map(o => [(p[0] + o) * T.k + T.x, p[1] * T.k + T.y]);
    }

    _hitAt(e) {
      if (!this.geo) return null;
      const r = this.canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      for (const iso of this._dots()) {
        for (const p of this._dotPositions(iso)) if (Math.hypot(p[0] - px, p[1] - py) < 11) return iso;
      }
      let wx = (px - this.T.x) / this.T.k;
      wx = ((wx % TILE) + TILE) % TILE;
      const ll = merc.invert([wx, (py - this.T.y) / this.T.k]);
      for (const f of this.geo.features) {
        const [[a, b], [c, d]] = this.geo.bounds.get(f.id);
        if (ll[1] < b || ll[1] > d) continue;
        if (a <= c && (ll[0] < a || ll[0] > c)) continue;
        if (d3.geoContains(f, ll)) return this._eligible(f.id) ? f.id : null;
      }
      return null;
    }

    _onMove(e) {
      const iso = this._hitAt(e);
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
      if (this.done.has(iso)) return st.done;
      if (iso === this.highlight || (iso === this.hover && this.opts.hoverHighlight !== false)) return st.hover;
      if (this.group.has(iso)) return st.group;
      return st.other;
    }

    _grad(ctx, st, iso) {
      const [[x0, y0], [x1, y1]] = mpath.bounds(this.geo.main.get(iso));
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, st.target[0]); g.addColorStop(1, st.target[1]);
      return g;
    }

    _draw(now) {
      this.queued = false;
      if (!this.geo || this.destroyed) return;
      const st = STYLES[this.styleName], ctx = this.ctx, T = this.T;
      const key = [this.styleName, T.x, T.y, T.k, this.W, this.H, this.hover, this.highlight, this.target,
        this.done.size, this.flashState && this.flashState.iso, this.flashState && this.flashState.ok,
        this.group.size, this.tileVersion].join('|');
      if (key !== this.baseKey) { this._renderBase(st); this.baseKey = key; }

      ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      ctx.drawImage(this.base, 0, 0, this.W, this.H);

      const pulse = ((now - this.pulse0) % 1400) / 1400;
      if (this.target && this.geo.byId.has(this.target) && !this._isDot(this.target)) {
        const p = this.geo.path2d.get(this.target), lw = 1 / T.k;
        for (const o of this._copies()) {
          ctx.save(); ctx.translate(T.x + o * T.k, T.y); ctx.scale(T.k, T.k);
          ctx.strokeStyle = st.ring; ctx.lineWidth = 2.2 * lw; ctx.stroke(p);
          ctx.globalAlpha = (1 - pulse) * .55; ctx.lineWidth = (2 + pulse * 10) * lw; ctx.stroke(p);
          ctx.restore();
        }
      }

      for (const iso of this._dots()) {
        let fill = this._fill(iso, st);
        const isT = fill === 'TARGET';
        if (!fill || fill === st.group || fill === st.other) fill = this.group.has(iso) ? st.dotGroup : st.dot;
        for (const p of this._dotPositions(iso)) {
          ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 2 * Math.PI);
          ctx.fillStyle = isT ? st.target[0] : fill; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = st.dotLine; ctx.stroke();
          if (isT) {
            ctx.beginPath(); ctx.arc(p[0], p[1], 7 + pulse * 14, 0, 2 * Math.PI);
            ctx.globalAlpha = 1 - pulse; ctx.strokeStyle = st.ring; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
      }

      // Capital points
      for (const pt of this.points) {
        const hi = pt.id === this.pointHighlight;
        for (const p of this._screen(pt.ll)) {
          ctx.beginPath(); ctx.arc(p[0], p[1], hi ? 5 : 3.2, 0, 2 * Math.PI);
          ctx.fillStyle = hi ? '#facc15' : '#ffffff'; ctx.fill();
          ctx.lineWidth = hi ? 2 : 1.3; ctx.strokeStyle = 'rgba(15,23,42,.85)'; ctx.stroke();
        }
      }
      // Pins (guess / answer) with a dashed line between the first two
      if (this.pins.length) {
        if (this.pins.length > 1) {
          const a = this._screen(this.pins[0].ll), b = this._screen(this.pins[1].ll);
          const best = a.flatMap(p => b.map(q => [p, q])).sort((u, v) => Math.hypot(u[0][0] - u[1][0], u[0][1] - u[1][1]) - Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]))[0];
          ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.9)';
          ctx.beginPath(); ctx.moveTo(best[0][0], best[0][1]); ctx.lineTo(best[1][0], best[1][1]); ctx.stroke(); ctx.restore();
        }
        for (const pin of this.pins) {
          for (const p of this._screen(pin.ll)) {
            ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 2 * Math.PI);
            ctx.fillStyle = pin.ok ? st.ok : st.bad; ctx.fill();
            ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
          }
        }
      }

      if (this.target || this.flashState) this._schedule();
    }

    // Alles wat stilstaat (zee, tegels, vlakken, grenzen) wordt alleen opnieuw getekend als er iets verandert.
    _renderBase(st) {
      const T = this.T, g = this.geo;
      this.base.width = this.canvas.width; this.base.height = this.canvas.height;
      const ctx = this.base.getContext('2d');
      ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      if (Array.isArray(st.sea)) {
        const gr = ctx.createLinearGradient(0, 0, 0, this.H);
        gr.addColorStop(0, st.sea[0]); gr.addColorStop(1, st.sea[1]); ctx.fillStyle = gr;
      } else ctx.fillStyle = st.sea;
      ctx.fillRect(0, 0, this.W, this.H);
      const lw = 1 / T.k;
      for (const o of this._copies()) {
        ctx.save();
        ctx.translate(T.x + o * T.k, T.y); ctx.scale(T.k, T.k);
        if (st.tiles) this._drawTiles(ctx, o);
        if (st.grat) { ctx.beginPath(); d3.geoPath(merc, ctx)(d3.geoGraticule10()); ctx.strokeStyle = st.grat; ctx.lineWidth = lw; ctx.stroke(); }
        for (const f of g.features) {
          const fill = this._fill(f.id, st);
          if (!fill) continue;
          ctx.fillStyle = fill === 'TARGET' ? this._grad(ctx, st, f.id) : fill;
          ctx.fill(g.path2d.get(f.id));
        }
        ctx.lineJoin = 'round';
        if (st.halo) { ctx.strokeStyle = st.halo; ctx.lineWidth = 3.5 * lw; ctx.stroke(g.borders); }
        ctx.strokeStyle = st.border; ctx.lineWidth = st.borderW * lw; ctx.stroke(g.borders);
        ctx.restore();
      }
    }

    // Tekent de zichtbare satelliettegels; zolang een scherpe tegel laadt, vult een grovere het gat.
    _drawTiles(ctx, offset) {
      const T = this.T;
      const z = Math.max(1, Math.min(MAX_TILE_Z, Math.ceil(Math.log2(T.k * this.DPR))));
      const n = 1 << z, ts = TILE / n;
      const wx0 = (-T.x) / T.k - offset, wx1 = (this.W - T.x) / T.k - offset;
      const wy0 = (-T.y) / T.k, wy1 = (this.H - T.y) / T.k;
      const xa = Math.max(0, Math.floor(wx0 / ts)), xb = Math.min(n - 1, Math.floor(wx1 / ts));
      const ya = Math.max(0, Math.floor(wy0 / ts)), yb = Math.min(n - 1, Math.floor(wy1 / ts));
      const bump = () => { this.tileVersion++; this._schedule(); };
      const seam = .5 / T.k;
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          const t = getTile(z, y, x, bump);
          if (t.ready) { ctx.drawImage(t.im, x * ts, y * ts, ts + seam, ts + seam); continue; }
          for (let pz = z - 1; pz >= 1; pz--) {
            const s = z - pz, px = x >> s, py = y >> s, pt = getTile(pz, py, px, bump);
            if (!pt.ready) continue;
            const sub = 1 << s, sw = TILE / sub;
            ctx.drawImage(pt.im, (x - (px << s)) * sw, (y - (py << s)) * sw, sw, sw, x * ts, y * ts, ts + seam, ts + seam);
            break;
          }
        }
      }
    }
  }

  MapView.STYLES = STYLES;
  window.MapView = MapView;
})();
