/** Durée de session : 24 heures à partir de la connexion */
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

export const AUTH_STORAGE_KEY = 'sofac_auth_session'

function randomToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sofac_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`
}

/**
 * @param {string} email
 * @returns {{ token: string; email: string; expiresAt: number }}
 */
export function createSessionPayload(email) {
  const expiresAt = Date.now() + SESSION_DURATION_MS
  return {
    token: randomToken(),
    email,
    expiresAt,
  }
}

/**
 * @param {string | null} raw JSON depuis localStorage
 * @returns {{ token: string; email: string; expiresAt: number } | null}
 */
export function parseValidSession(raw) {
  if (!raw || typeof raw !== 'string') return null
  try {
    const data = JSON.parse(raw)
    if (!data || typeof data.token !== 'string' || typeof data.email !== 'string') return null
    if (typeof data.expiresAt !== 'number' || Number.isNaN(data.expiresAt)) return null
    if (Date.now() > data.expiresAt) return null
    return data
  } catch {
    return null
  }
}
