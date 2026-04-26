import { gasRelancesRelayPath, gasUsesNetlifyRelay, gasUsesSameOriginProxy } from '../services/gasProxyMode'

/**
 * Relances — enregistrement d’une relance dans Google Sheets (Web App Apps Script /exec).
 *
 * Variables :
 * - VITE_RELANCES_WEBAPP_URL (URL …/exec)
 * - VITE_RELANCES_WEBAPP_TOKEN (SECRET côté Apps Script)
 *
 * En développement (npm run dev), passer par le proxy Vite : /__gas-relances-proxy
 */
export const RELANCES_INVALID_WEBAPP_URL_MESSAGE =
  "L'URL doit être celle du déploiement Web App et se terminer par /exec (pas l'URL de l'éditeur)."

function trimEnv(name) {
  const v = import.meta.env[name]
  return v != null && String(v).trim() !== '' ? String(v).trim() : ''
}

export function getRelancesExecUrl() {
  const u = trimEnv('VITE_RELANCES_WEBAPP_URL')
  return u.replace(/\/$/, '')
}

export function getRelancesToken() {
  return trimEnv('VITE_RELANCES_WEBAPP_TOKEN')
}

export function relancesUrlInvalid() {
  if (gasUsesNetlifyRelay()) return false
  const url = getRelancesExecUrl()
  return Boolean(url && !url.includes('/exec'))
}

export function relancesConfigured() {
  if (gasUsesNetlifyRelay()) return true
  const url = getRelancesExecUrl()
  const token = getRelancesToken()
  return Boolean(url && url.includes('/exec') && token)
}

function requestUrlForPost() {
  const direct = getRelancesExecUrl()
  if (!direct && !gasUsesNetlifyRelay()) return ''
  if (gasUsesSameOriginProxy()) return gasRelancesRelayPath()
  return direct
}

/**
 * @param {{ date: string, manager: string, affaire: string, documentManquant: string }} payload
 * @returns {Promise<{ success: true, message?: string } & Record<string, unknown>>}
 */
export async function saveRelanceToSheet(payload) {
  const baseUrl = getRelancesExecUrl()
  const token = getRelancesToken()

  if (!gasUsesNetlifyRelay()) {
    if (!baseUrl) {
      throw new Error('URL Apps Script manquante : définissez VITE_RELANCES_WEBAPP_URL dans .env.local.')
    }
    if (!baseUrl.includes('/exec')) {
      throw new Error(RELANCES_INVALID_WEBAPP_URL_MESSAGE)
    }
    if (!token) {
      throw new Error('Jeton manquant : définissez VITE_RELANCES_WEBAPP_TOKEN dans .env.local.')
    }
  }

  const bodyObj = {
    action: 'relance_append',
    date: payload?.date != null ? String(payload.date) : '',
    manager: payload?.manager != null ? String(payload.manager) : '',
    affaire: payload?.affaire != null ? String(payload.affaire) : '',
    documentManquant: payload?.documentManquant != null ? String(payload.documentManquant) : '',
  }
  if (!gasUsesNetlifyRelay()) bodyObj.token = token
  if (gasUsesSameOriginProxy() && baseUrl && baseUrl.includes('/exec')) bodyObj._gasBase = baseUrl.replace(/\/$/, '')
  const body = JSON.stringify(bodyObj)

  const url = requestUrlForPost()
  const viaProxy = gasUsesSameOriginProxy()

  const response = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    credentials: viaProxy ? 'same-origin' : 'omit',
    body,
  })

  const text = await response.text()
  let result
  try {
    result = JSON.parse(text)
  } catch {
    throw new Error('Réponse invalide du script (non JSON) : ' + text.slice(0, 200).replace(/\s+/g, ' '))
  }

  if (!result.success) {
    const err = result.error || result.message || "Échec de l'enregistrement"
    throw new Error(String(err))
  }

  return result
}

export async function submitRelanceRow(fields) {
  try {
    const r = await saveRelanceToSheet(fields)
    return { ok: true, message: r.message || 'Relance enregistrée' }
  } catch (e) {
    return { ok: false, message: String(e?.message || e) }
  }
}

export async function validateRelancesInSheet(items) {
  const baseUrl = getRelancesExecUrl()
  const token = getRelancesToken()
  if (!gasUsesNetlifyRelay() && (!baseUrl || !baseUrl.includes('/exec') || !token)) {
    return { ok: false, message: 'Configuration manquante (URL /exec + jeton).' }
  }

  const bodyObj = {
    action: 'relance_validate',
    items: Array.isArray(items) ? items : [],
  }
  if (!gasUsesNetlifyRelay()) bodyObj.token = token
  if (gasUsesSameOriginProxy() && baseUrl && baseUrl.includes('/exec')) bodyObj._gasBase = baseUrl.replace(/\/$/, '')
  const body = JSON.stringify(bodyObj)

  const url = gasUsesSameOriginProxy() ? gasRelancesRelayPath() : baseUrl
  try {
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      credentials: gasUsesSameOriginProxy() ? 'same-origin' : 'omit',
      body,
    })
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return { ok: false, message: 'Réponse non JSON du script.' }
    }
    if (data?.success === true) {
      return { ok: true, validated: Number(data.validated || 0) }
    }
    return { ok: false, message: String(data?.error || data?.message || 'Échec validation') }
  } catch (e) {
    return { ok: false, message: String(e?.message || e) }
  }
}

export async function deleteRelancesFromSheet(items) {
  const baseUrl = getRelancesExecUrl()
  const token = getRelancesToken()
  if (!gasUsesNetlifyRelay() && (!baseUrl || !baseUrl.includes('/exec') || !token)) {
    return { ok: false, message: 'Configuration manquante (URL /exec + jeton).' }
  }

  const bodyObj = {
    action: 'relance_delete',
    items: Array.isArray(items) ? items : [],
  }
  if (!gasUsesNetlifyRelay()) bodyObj.token = token
  if (gasUsesSameOriginProxy() && baseUrl && baseUrl.includes('/exec')) bodyObj._gasBase = baseUrl.replace(/\/$/, '')
  const body = JSON.stringify(bodyObj)

  const url = gasUsesSameOriginProxy() ? gasRelancesRelayPath() : baseUrl
  try {
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      credentials: gasUsesSameOriginProxy() ? 'same-origin' : 'omit',
      body,
    })
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return { ok: false, message: 'Réponse non JSON du script.' }
    }
    if (data?.success === true) {
      return { ok: true, deleted: Number(data.deleted || 0) }
    }
    return { ok: false, message: String(data?.error || data?.message || 'Échec suppression') }
  } catch (e) {
    return { ok: false, message: String(e?.message || e) }
  }
}

/**
 * Lecture des relances (historique) depuis la feuille.
 * @returns {Promise<{ ok: true, values: unknown[][] } | { ok: false, message: string }>}
 */
export async function readRelancesValues() {
  const baseUrl = getRelancesExecUrl()
  const token = getRelancesToken()
  if (!gasUsesNetlifyRelay() && (!baseUrl || !baseUrl.includes('/exec') || !token)) {
    return { ok: false, message: 'Configuration manquante (URL /exec + jeton).' }
  }

  const viaProxy = gasUsesSameOriginProxy()
  const base = viaProxy ? gasRelancesRelayPath() : baseUrl.replace(/\/$/, '')

  // Web App “merged” : action=read_relances ; script dédié : action=read
  const urls = [
    `${base}?action=read_relances${!gasUsesNetlifyRelay() && token ? `&token=${encodeURIComponent(token)}` : ''}${
      viaProxy && baseUrl && baseUrl.includes('/exec')
        ? `&_gasBase=${encodeURIComponent(baseUrl.replace(/\/$/, ''))}`
        : ''
    }`,
    `${base}?action=read${!gasUsesNetlifyRelay() && token ? `&token=${encodeURIComponent(token)}` : ''}${
      viaProxy && baseUrl && baseUrl.includes('/exec')
        ? `&_gasBase=${encodeURIComponent(baseUrl.replace(/\/$/, ''))}`
        : ''
    }`,
  ]

  try {
    for (const url of urls) {
      const res = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: viaProxy ? 'same-origin' : 'omit',
      })
      const text = await res.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        continue
      }
      if (data?.success === true && Array.isArray(data.values)) {
        return { ok: true, values: data.values }
      }
    }

    return { ok: false, message: "Échec lecture des relances" }
  } catch (e) {
    return { ok: false, message: String(e?.message || e) }
  }
}

