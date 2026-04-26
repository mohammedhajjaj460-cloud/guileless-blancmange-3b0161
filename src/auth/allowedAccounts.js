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

/** @type {ReadonlyArray<{ email: string; password: string }>} */
const INTERNAL_ACCOUNTS = Object.freeze([
  {
    email: 'mohammedhajjaj460@gmail.com',
    password: 'mohammed2003',
  },
])

/**
 * @returns {string | null} e-mail normalisé si la paire est valide, sinon null
 */
export function resolveAuthenticatedEmail(email, password) {
  const e = normalizeEmail(email)
  const p = normalizePassword(password)
  if (!e || !p) return null

  const row = INTERNAL_ACCOUNTS.find(
    (acc) => normalizeEmail(acc.email) === e && normalizePassword(acc.password) === p,
  )
  return row ? e : null
}
