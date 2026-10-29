// Archive of the daily games: every day since launch, with your result. Click a day to play it.
import { siteUrl } from '../core/data.js';
import { escapeHtml as esc } from '../core/text.js';
import { renderTopbar, I } from '../ui/shell.js';
import { DAILY_GAMES, archiveDates, results, today } from '../games/daily.js';

renderTopbar(document.getElementById('topbar'), { current: 'hub' });
const page = document.getElementById('page');
const param = new URLSearchParams(location.search).get('game');
let game = DAILY_GAMES.find(g => g.id === param) || DAILY_GAMES[0];

function statusOf(g, r) {
  if (!r || !r.done) return '<span class="st">Nog niet gespeeld</span>';
  const detail = g.id === 'geotrivia' ? `${r.score} punten`
    : g.id === 'grensroute' ? `${r.steps} stappen${r.perfect ? ' · perfect' : ''}`
    : `${r.guesses} ${r.guesses === 1 ? 'gok' : 'gokken'}`;
  return r.won
    ? `<span class="st won">${I.check} ${esc(detail)}</span>`
    : `<span class="st lost">× ${g.id === 'geotrivia' ? esc(detail) : 'Niet geraden'}</span>`;
}

function render() {
  const res = results(game.id);
  const days = archiveDates();
  const played = days.filter(d => res[d] && res[d].done).length;
  document.title = `Archief ${game.title} — Land Trainer`;
  history.replaceState(null, '', `?game=${game.id}`);
  page.innerHTML = `
    <div class="archive-head">
      <div><div class="eyebrow">Archief</div><h1>${esc(game.title)}</h1><p class="muted">${played} van ${days.length} ${days.length === 1 ? 'dag' : 'dagen'} gespeeld. Kies een dag om die alsnog te spelen.</p></div>
      <div class="seg small" role="group" aria-label="Spel">${DAILY_GAMES.map(g => `<button data-game="${g.id}" aria-pressed="${g.id === game.id}">${esc(g.title)}</button>`).join('')}</div>
    </div>
    <div class="archive-grid">
      ${days.map(d => {
        const [y, m, day] = d.split('-').map(Number);
        const date = new Date(y, m - 1, day);
        return `<a class="card arch-day ${d === today() ? 'today' : ''}" href="${siteUrl(`${game.href}${d === today() ? '' : `?date=${d}`}`)}">
          <span class="w">${d === today() ? 'Vandaag' : date.toLocaleDateString('nl-NL', { weekday: 'long' })}</span>
          <span class="d">${date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}</span>
          ${statusOf(game, res[d])}
        </a>`;
      }).join('')}
    </div>
    <p><a class="btn" href="${siteUrl(`${game.href}?mode=random`)}">Willekeurig spelen ${I.arrow}</a></p>`;
}

page.addEventListener('click', e => {
  const b = e.target.closest('[data-game]');
  if (b) { game = DAILY_GAMES.find(g => g.id === b.dataset.game); render(); }
});
render();
