/*
 * Intro "SaaS-launch" — standalone light-mode intro voor het Grote Eindexamen.
 * Volledig additief: exam.js roept window.LandIntroSaas.play(...) aan en valt
 * automatisch terug op de klassieke intro wanneer dit bestand niet geladen is.
 */
(function () {
  'use strict';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function pickRandom(list, n) {
    const copy = [...list];
    const out = [];
    while (out.length < n && copy.length) {
      out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
  }

  /** Splitst een regel in woorden die elk met eigen delay omhoog faden. */
  function addWords(lineEl, text, delay, step) {
    text.split(' ').forEach(word => {
      const span = el('span', 'saas-word', word);
      span.style.animationDelay = delay.toFixed(2) + 's';
      delay += step;
      lineEl.appendChild(span);
      lineEl.appendChild(document.createTextNode(' '));
    });
    return delay;
  }

  function buildChip(extraCls, emoji, delaySec) {
    const chip = el('div', 'saas-chip ' + extraCls);
    chip.style.setProperty('--d', delaySec + 's');
    chip.appendChild(el('span', 'saas-chip-emoji', emoji));
    return chip;
  }

  function buildOverlay(opts) {
    const countries = opts.countries || [];
    const flagSrc = typeof opts.flagSrc === 'function' ? opts.flagSrc : null;

    const overlay = el('div');
    overlay.id = 'intro-saas';
    overlay.hidden = true;

    // Achtergrond: dot-grid + zwevende pastel-blobs
    const bg = el('div', 'saas-bg');
    bg.appendChild(el('div', 'saas-grid'));
    ['blob-a', 'blob-b', 'blob-c'].forEach(c => bg.appendChild(el('i', 'saas-blob ' + c)));
    overlay.appendChild(bg);

    // Topbar: mini-wordmark + overslaan
    const top = el('header', 'saas-top');
    const logo = el('div', 'saas-logo');
    logo.appendChild(el('span', 'saas-logo-mark', '🌍'));
    logo.appendChild(el('span', null, 'Land Trainer'));
    logo.appendChild(el('span', 'saas-logo-tag', 'Eindexamen'));
    top.appendChild(logo);
    const skip = el('button', 'saas-skip', 'Overslaan (Esc)');
    skip.type = 'button';
    top.appendChild(skip);
    overlay.appendChild(top);

    // Hero
    const hero = el('main', 'saas-hero');

    const pill = el('div', 'saas-pill');
    pill.appendChild(el('span', 'saas-pill-badge', 'NIEUW'));
    pill.appendChild(el('span', 'saas-pill-txt', 'Het Grote Eindexamen is live'));
    pill.appendChild(el('span', 'saas-pill-arrow', '→'));
    hero.appendChild(pill);

    const title = el('h1', 'saas-title');
    title.setAttribute('aria-label', 'Word een échte topografie-legende');
    const line1 = el('span', 'saas-title-line');
    const line2 = el('span', 'saas-title-line saas-title-accent');
    const d = addWords(line1, 'Word een échte', 0.45, 0.09);
    addWords(line2, 'topografie-legende.', d, 0.09);
    title.appendChild(line1);
    title.appendChild(line2);
    hero.appendChild(title);

    hero.appendChild(el('p', 'saas-sub',
      'Hoofdsteden typen, vlaggen herkennen en landen spotten op de satellietkaart — je voortgang wordt automatisch opgeslagen.'));

    // Globe-podium met orbit-ringen en feature-chips
    const stageWrap = el('div', 'saas-stage-wrap');
    const stage = el('div', 'saas-stage');
    stage.appendChild(el('div', 'saas-orbit'));
    const orbit2 = el('div', 'saas-orbit2');
    orbit2.appendChild(el('span', 'saas-sat', '🛰️'));
    stage.appendChild(orbit2);
    const globe = el('div', 'saas-globe');
    globe.setAttribute('aria-hidden', 'true');
    globe.appendChild(el('span', 'globe-fallback', '🌍'));
    globe.appendChild(el('span', 'globe-tex'));
    stage.appendChild(globe);
    stageWrap.appendChild(stage);

    const chips = el('div', 'saas-chips');
    const chip1 = buildChip('chip-1', '🌍', 1.9);
    chip1.appendChild(el('span', null, countries.length ? countries.length + ' landen' : 'Alle landen'));
    const chip2 = buildChip('chip-2', '❓', 2.05);
    chip2.appendChild(el('b', 'saas-count', '0'));
    chip2.appendChild(el('span', null, ' vragen'));
    const chip3 = buildChip('chip-3', '🛰️', 2.2);
    chip3.appendChild(el('span', null, '3 vraagtypen'));
    const chip4 = buildChip('chip-4', '💾', 2.35);
    chip4.appendChild(el('span', null, 'Autosave'));
    [chip1, chip2, chip3, chip4].forEach(c => chips.appendChild(c));
    stageWrap.appendChild(chips);
    hero.appendChild(stageWrap);

    // CTA
    const ctaWrap = el('div', 'saas-cta-wrap');
    const cta = el('button', 'saas-cta');
    cta.type = 'button';
    cta.appendChild(el('span', null, 'Aan de slag'));
    cta.appendChild(el('span', 'saas-cta-arrow', '→'));
    ctaWrap.appendChild(cta);
    hero.appendChild(ctaWrap);

    overlay.appendChild(hero);

    // Vlaggen-"logowall" onderin
    if (flagSrc && countries.length) {
      const marquee = el('footer', 'saas-marquee');
      const inner = el('div', 'saas-marquee-inner');
      const isos = pickRandom(countries, 26).map(c => c.iso);
      for (let rep = 0; rep < 2; rep++) {
        isos.forEach(iso => {
          const img = el('img');
          img.src = flagSrc(iso);
          img.alt = '';
          img.loading = 'eager';
          inner.appendChild(img);
        });
      }
      marquee.appendChild(inner);
      overlay.appendChild(marquee);
    }

    return overlay;
  }

  /** Confetti-burst vanuit de CTA-knop (Web Animations API). */
  function confettiBurst(overlay, fromEl) {
    if (!Element.prototype.animate) return;
    const rect = fromEl.getBoundingClientRect();
    const wrap = el('div', 'saas-confetti');
    wrap.style.left = (rect.left + rect.width / 2) + 'px';
    wrap.style.top = (rect.top + rect.height / 2) + 'px';
    overlay.appendChild(wrap);
    const colors = ['#2563eb', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];
    for (let i = 0; i < 26; i++) {
      const p = el('i');
      p.style.background = colors[i % colors.length];
      const ang = (i / 26) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 55 + Math.random() * 95;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist - 30;
      wrap.appendChild(p);
      p.animate([
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + Math.round(Math.random() * 540 - 270) + 'deg) scale(.5)', opacity: 0 }
      ], { duration: 550 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    }
    setTimeout(() => wrap.remove(), 1100);
  }

  function play(opts) {
    opts = opts || {};
    const onDone = typeof opts.onDone === 'function' ? opts.onDone : function () {};
    const markSeen = typeof opts.markSeen === 'function' ? opts.markSeen : function () {};

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { markSeen(); onDone(); return; }

    let overlay = document.getElementById('intro-saas');
    if (!overlay) {
      overlay = buildOverlay(opts);
      document.body.appendChild(overlay);
    }

    // Zelfde NASA Blue Marble-globe als de rest van het examen
    if (typeof opts.initGlobe === 'function') {
      opts.initGlobe(overlay.querySelector('.saas-globe'));
    }

    overlay.hidden = false;
    overlay.classList.remove('playing', 'leaving');
    void overlay.offsetWidth; // reflow zodat CSS-animaties bij replay opnieuw starten
    overlay.classList.add('playing');

    // Count-up in de vragen-chip
    const countEl = overlay.querySelector('.saas-count');
    const total = opts.total || 0;
    if (countEl) countEl.textContent = '0';
    let rafId = null;
    const t0 = performance.now();
    const COUNT_START = 1900;
    const COUNT_DUR = 1300;
    function tick(now) {
      const elapsed = now - t0;
      if (elapsed >= COUNT_START && countEl) {
        const p = Math.min(1, (elapsed - COUNT_START) / COUNT_DUR);
        const eased = 1 - Math.pow(1 - p, 3);
        countEl.textContent = String(Math.round(eased * total));
      }
      if (elapsed < COUNT_START + COUNT_DUR) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    let done = false;
    function finish() {
      if (done) return;
      done = true;
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', onKey);
      markSeen();
      overlay.classList.add('leaving');
      setTimeout(() => {
        overlay.hidden = true;
        overlay.classList.remove('playing', 'leaving');
        onDone();
      }, 550);
    }

    function onKey(e) {
      if (e.key === 'Escape') finish();
    }
    document.addEventListener('keydown', onKey);

    overlay.querySelector('.saas-skip').onclick = finish;
    const cta = overlay.querySelector('.saas-cta');
    cta.onclick = () => {
      confettiBurst(overlay, cta);
      setTimeout(finish, 330);
    };
  }

  window.LandIntroSaas = { play };
})();
