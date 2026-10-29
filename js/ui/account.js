// Account button in the top bar and the sign-in dialog (Google or username + password, then a name).
import { onUser, signInGoogle, signUpPassword, signInPassword, claimName, signOut } from '../core/account.js';
import { flush } from '../core/sync.js';
import { escapeHtml as esc } from '../core/text.js';

const GOOGLE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.8 0-5.2-1.9-6.1-4.5H2.2v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.7-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.7 2.8C6.8 7.3 9.2 5.4 12 5.4z"/></svg>';
const USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';

function storageWorks() {
  try { localStorage.setItem('landjes__probe', '1'); localStorage.removeItem('landjes__probe'); return true; } catch (_) { return false; }
}

let dialog, signingUp = false;
function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.appendChild(dialog);
  return dialog;
}

/** step: 'login' | 'signup' | 'name' */
function openDialog(step, user) {
  const d = ensureDialog();
  const naming = step === 'name';
  d.innerHTML = `
    <form method="dialog" class="account-card" novalidate>
      <button class="icon-btn account-close" type="button" data-close aria-label="Sluiten"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg></button>
      ${naming ? `
        <h2>${user && user.name ? 'Naam wijzigen' : 'Kies je naam'}</h2>
        <p class="muted">Deze naam zien je vrienden op de scoreborden.</p>
        <label class="account-field"><span>Naam</span><input class="type-input" name="name" autocomplete="nickname" maxlength="20" value="${esc(user && user.name || '')}" required></label>
        <p class="account-error" aria-live="polite"></p>
        <button class="btn lg primary" type="submit">Opslaan</button>`
      : `
        <h2>${step === 'signup' ? 'Account maken' : 'Inloggen'}</h2>
        <p class="muted">Bewaar je voortgang en speel mee op de scoreborden.</p>
        ${storageWorks() ? `
        <button class="btn lg account-google" type="button" data-google>${GOOGLE} Inloggen met Google</button>
        <div class="account-or"><span>of</span></div>
        <div class="seg small" role="group" aria-label="Inloggen of account maken">
          <button type="button" data-step="login" aria-pressed="${step === 'login'}">Inloggen</button>
          <button type="button" data-step="signup" aria-pressed="${step === 'signup'}">Account maken</button>
        </div>
        <label class="account-field"><span>Gebruikersnaam</span><input class="type-input" name="name" autocomplete="username" maxlength="20" autocapitalize="off" spellcheck="false" required></label>
        <label class="account-field"><span>Wachtwoord</span><input class="type-input" name="password" type="password" autocomplete="${step === 'signup' ? 'new-password' : 'current-password'}" required></label>
        <p class="account-error" aria-live="polite"></p>
        <button class="btn lg primary" type="submit">${step === 'signup' ? 'Account maken' : 'Inloggen'}</button>`
        : '<p class="account-error">Inloggen werkt niet in deze browserinstelling.</p>'}`}
    </form>`;
  const form = d.querySelector('form'), err = d.querySelector('.account-error');
  const busy = on => d.querySelectorAll('button').forEach(b => { b.disabled = on; });
  const run = async fn => {
    if (err) err.textContent = '';
    busy(true);
    try { await fn(); return true; }
    catch (e) {
      if (err) err.textContent = e.message;
      const pw = form.querySelector('[name=password]'); if (pw) pw.value = '';
      return false;
    } finally { busy(false); }
  };
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  d.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => openDialog(b.dataset.step)));
  const g = d.querySelector('[data-google]');
  if (g) g.addEventListener('click', async () => { if (await run(signInGoogle)) d.close(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = form.querySelector('[name=name]').value;
    const pw = form.querySelector('[name=password]');
    signingUp = step === 'signup';
    const ok = await run(() => naming ? claimName(name) : signingUp ? signUpPassword(name, pw.value) : signInPassword(name, pw.value));
    signingUp = false;
    if (ok) d.close();
  });
  if (!d.open) d.showModal();
  const first = form.querySelector('input'); if (first) first.focus();
}

function menu(slot, user) {
  const m = document.createElement('div');
  m.className = 'account-menu card';
  m.innerHTML = `<button type="button" data-rename>Naam wijzigen</button><button type="button" data-out>Uitloggen</button>`;
  const close = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', close, true); } };
  m.querySelector('[data-rename]').addEventListener('click', () => { m.remove(); openDialog('name', user); });
  m.querySelector('[data-out]').addEventListener('click', async () => { m.remove(); await flush(); await signOut(); });
  slot.appendChild(m);
  setTimeout(() => document.addEventListener('click', close, true));
}

export function mountAccount(slot) {
  let state = 'idle';
  let user = null;
  let askedName = false;
  const paint = () => {
    if (!user) {
      slot.innerHTML = '<button class="btn account-btn" type="button" data-login>Inloggen</button>';
      slot.querySelector('[data-login]').addEventListener('click', () => openDialog('login'));
      return;
    }
    const label = user.name || 'Kies je naam';
    slot.innerHTML = `<button class="btn account-btn" type="button" data-me aria-haspopup="menu">${USER}<span class="account-name">${esc(label)}</span><i class="sync-dot ${state}" title="${state === 'error' ? 'Synchroniseren mislukt' : state === 'offline' ? 'Offline' : state === 'syncing' ? 'Bezig met synchroniseren' : 'Gesynchroniseerd'}"></i></button>`;
    slot.querySelector('[data-me]').addEventListener('click', () => user.name ? menu(slot, user) : openDialog('name', user));
  };
  window.addEventListener('landjes:sync', e => { state = e.detail.state; if (user) paint(); });
  onUser(u => {
    user = u;
    paint();
    if (u && !u.name && !askedName && !signingUp) { askedName = true; openDialog('name', u); }
  });
  paint();
}
