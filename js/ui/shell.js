// Shared page chrome: theme (light/dark), top bar and icons.
import { siteUrl } from '../core/data.js';

const THEME_KEY = 'landjes_theme';

export function storedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; }
}
export function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
export function applyTheme() {
  const t = storedTheme();
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
}
function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* private mode */ }
  document.querySelectorAll('[data-theme-toggle]').forEach(b => { b.innerHTML = isDark() ? I.sun : I.moon; });
}
applyTheme();

export const I = {
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  arrow: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M11 5l5 5-5 5"/></svg>',
  back: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10H4M9 5l-5 5 5 5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  search: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l5 5 5-5"/></svg>',
  capital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M3 10l9-6 9 6z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>'
};

/**
 * Renders the sticky top bar into `el`.
 * @param {{current?: 'hub'|'oefenen'|'stats', dataset?: 'world'|'us'}} opts
 */
export function renderTopbar(el, { current = 'oefenen', dataset = 'world' } = {}) {
  const cur = k => (k === current ? ' aria-current="page"' : '');
  const ctx = current === 'hub' ? '' : (dataset === 'us'
    ? `<a class="ctx" href="${siteUrl('wereld.html?dataset=us')}">${I.flag} VS-staten</a>`
    : `<a class="ctx" href="${siteUrl('wereld.html')}">${I.globe} Wereld</a>`);
  el.className = 'topbar';
  el.innerHTML = `
    <a class="brand" href="${siteUrl('index.html')}" aria-label="Naar de hoofdpagina"><span class="globe"></span><span class="brand-name">Land Trainer</span></a>
    ${ctx}
    <nav class="nav" aria-label="Hoofdmenu">
      <a href="${siteUrl('index.html')}"${cur('hub')}>Spellen</a>
      <a href="${siteUrl('wereld.html' + (dataset === 'us' ? '?dataset=us' : ''))}"${cur('oefenen')}>Oefenen</a>
      <a class="opt-hide" href="${siteUrl('exam.html')}">Eindexamen</a>
      <a href="${siteUrl('stats.html')}"${cur('stats')}>Statistieken</a>
    </nav>
    <button class="icon-btn" type="button" data-theme-toggle aria-label="Wissel licht en donker">${isDark() ? I.sun : I.moon}</button>`;
  el.querySelector('[data-theme-toggle]').addEventListener('click', toggleTheme);
}

/** localStorage helpers that never throw (private mode, blocked storage). */
export const prefs = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (_) { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignore */ } }
};
