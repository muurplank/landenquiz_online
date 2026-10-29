// Accounts: Firebase Auth (Google or username + password) and the player's public name.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, deleteUser, signOut as fbSignOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { normalizeName, validateName, usernameEmail } from './names.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const MESSAGES = {
  'auth/invalid-credential': 'Naam of wachtwoord klopt niet.',
  'auth/wrong-password': 'Naam of wachtwoord klopt niet.',
  'auth/user-not-found': 'Naam of wachtwoord klopt niet.',
  'auth/invalid-email': 'Naam of wachtwoord klopt niet.',
  'auth/email-already-in-use': 'Die naam is al bezet.',
  'auth/weak-password': 'Kies een wachtwoord van minstens 6 tekens.',
  'auth/missing-password': 'Vul een wachtwoord in.',
  'auth/network-request-failed': 'Geen verbinding. Probeer het zo opnieuw.',
  'auth/too-many-requests': 'Te veel pogingen. Wacht even en probeer het opnieuw.',
  'auth/popup-closed-by-user': 'Inloggen afgebroken.',
  'auth/cancelled-popup-request': 'Inloggen afgebroken.',
  'auth/unauthorized-domain': 'Inloggen werkt nog niet op dit adres.',
  'unavailable': 'Geen verbinding. Probeer het zo opnieuw.'
};
/** Error with a Dutch message for the player; keeps the original code. */
function dutch(e) {
  if (e && e.dutch) return e;
  const err = new Error(MESSAGES[e && e.code] || 'Er ging iets mis. Probeer het opnieuw.');
  err.code = e && e.code; err.dutch = true;
  return err;
}
const fail = msg => Object.assign(new Error(msg), { dutch: true });

let current = null, ready = false;
const listeners = new Set();
const emit = () => listeners.forEach(cb => cb(current));

async function describe(user) {
  if (!user) return null;
  const google = user.providerData.some(p => p.providerId === 'google.com');
  let name;   // undefined = unknown (offline), null = no name chosen yet
  try { const snap = await getDoc(doc(db, 'users', user.uid)); name = snap.exists() ? snap.data().name : null; } catch (_) { /* offline */ }
  return { uid: user.uid, name, provider: google ? 'google' : 'password' };
}

onAuthStateChanged(auth, async user => {
  const d = await describe(user);
  // A name claimed meanwhile (sign-up) wins over a profile read that started before it.
  if (d && current && current.uid === d.uid && current.name && !d.name) return;
  current = d; ready = true; emit();
});
getRedirectResult(auth).catch(e => {
  window.dispatchEvent(new CustomEvent('landjes:autherror', { detail: { message: dutch(e).message } }));
});

/** Calls cb with the signed-in player ({uid, name, provider}) or null, now and on every change. */
export function onUser(cb) {
  listeners.add(cb);
  if (ready) cb(current);
  return () => listeners.delete(cb);
}

export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, provider);
    throw dutch(e);
  }
}

export async function signUpPassword(name, password) {
  const bad = validateName(name);
  if (bad) throw fail(bad);
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, usernameEmail(name), password);
  } catch (e) { throw dutch(e); }
  try { await claimName(name); }
  catch (e) { await deleteUser(cred.user).catch(() => {}); throw dutch(e); }
}

export async function signInPassword(name, password) {
  try { await signInWithEmailAndPassword(auth, usernameEmail(name), password); }
  catch (e) { throw dutch(e); }
}

/** Claims `name` for the signed-in player (and releases the old one) in one transaction. */
export async function claimName(name) {
  const bad = validateName(name);
  if (bad) throw fail(bad);
  const user = auth.currentUser;
  if (!user) throw fail('Log eerst in.');
  const clean = String(name).trim(), key = normalizeName(clean);
  try {
    await runTransaction(db, async tx => {
      const nameRef = doc(db, 'names', key), userRef = doc(db, 'users', user.uid);
      const [taken, me] = await Promise.all([tx.get(nameRef), tx.get(userRef)]);
      if (taken.exists() && taken.data().uid !== user.uid) throw fail('Die naam is al bezet.');
      const old = me.exists() ? me.data().nameKey : null;
      if (!taken.exists()) tx.set(nameRef, { uid: user.uid });
      if (old && old !== key) tx.delete(doc(db, 'names', old));
      tx.set(userRef, { name: clean, nameKey: key, createdAt: me.exists() ? me.data().createdAt : serverTimestamp() });
    });
  } catch (e) {
    // A rule rejection on the name document means someone claimed it in the meantime.
    throw e.code === 'permission-denied' ? fail('Die naam is al bezet.') : dutch(e);
  }
  current = { ...(current || {}), uid: user.uid, name: clean, provider: current ? current.provider : 'password' };
  emit();
}

export async function signOut() {
  await fbSignOut(auth);
}
