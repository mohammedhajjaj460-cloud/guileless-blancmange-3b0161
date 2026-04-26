/**
 * Annuaire interne des comptes autorisés (démonstration front-end uniquement).
 * Non affiché dans l’interface.
 */

/** Supprime espaces fins / caractères invisibles souvent collés depuis la messagerie */
function stripInvisible(s) {
  return String(s ?? '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
}

function normalizeEmail(value) {
  return stripInvisible(value).trim().toLowerCase().normalize('NFC')
}

function normalizePassword(value) {
  return stripInvisible(value).trim()
}

/**
 * Mot de passe de connexion démo (page d’accueil). Défini par VITE_DEMO_APP_PASSWORD
 * (.env.local, variables de build Netlify). Ne doit jamais être identique à GAS_DISPATCH_SECRET
 * (sinon le secrets scanning Netlify fait échouer le build).
 */
function demoPasswordFromEnv() {
  return normalizePassword(import.meta.env.VITE_DEMO_APP_PASSWORD ?? '')
}

/** @type {ReadonlyArray<{ email: string; password: string }>} */
function internalAccounts() {
  const p = demoPasswordFromEnv()
  if (!p) return []
  /** Les deux orthographes (mohamed / mohammed) — même mot de passe. */
  const emails = ['mohammedhajjaj460@gmail.com', 'mohamedhajjaj460@gmail.com']
  return emails.map((email) => ({ email, password: p }))
}

/**
 * @returns {string | null} e-mail normalisé si la paire est valide, sinon null
 */
export function resolveAuthenticatedEmail(email, password) {
  const e = normalizeEmail(email)
  const p = normalizePassword(password)
  if (!e || !p) return null

  const row = internalAccounts().find(
    (acc) => normalizeEmail(acc.email) === e && normalizePassword(acc.password) === p,
  )
  return row ? e : null
}
