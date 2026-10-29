// Player names: one unique, case-insensitive name per account (shown on the scoreboards).

export const normalizeName = s => String(s).trim().toLowerCase();

/** null when the name is fine, otherwise a message for the player. */
export function validateName(s) {
  const n = String(s).trim();
  if (n.length < 3) return 'Kies een naam van minstens 3 tekens.';
  if (n.length > 20) return 'Kies een naam van hoogstens 20 tekens.';
  if (!/^[A-Za-z0-9_-]+$/.test(n)) return 'Gebruik alleen letters, cijfers, _ en -.';
  return null;
}

/** Username logins use Firebase email/password with this address; it never receives mail. */
export const usernameEmail = name => `${normalizeName(name)}@users.landtrainer.invalid`;
