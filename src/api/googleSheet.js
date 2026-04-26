import {
  gasDispatchRelayPath,
  gasDossierRelayPath,
  gasUsesNetlifyRelay,
  gasUsesSameOriginProxy,
} from '../services/gasProxyMode'

/**
 * Client Web App Google Apps Script — enregistrement dossier → Sheets.
 *
 * Important : ne pas envoyer Content-Type: application/json (fetch sans en-tête Content-Type,
 * corps = JSON.stringify uniquement) — meilleure compatibilité avec Apps Script.
 *
 * Variables : VITE_GAS_DISPATCH_URL + VITE_GAS_DISPATCH_TOKEN (fallback VITE_DOSSIER_WEBAPP_*).
 * Traitement (2e feuille) : par défaut même URL que le dispatch. Si ce déploiement est encore ancien
 * (erreur unknown_action), définir VITE_DOSSIER_WEBAPP_URL = URL /exec d’un 2e déploiement à jour
 * (DispatchSync.gs ou DossierAppend.gs) ; jeton optionnel VITE_DOSSIER_WEBAPP_TOKEN si différent.
 */

export const DOSSIER_GAS_INVALID_WEBAPP_URL_MESSAGE =
  "L'URL doit être celle du déploiement Web App et se terminer par /exec (pas l'URL de l'éditeur)."

function trimEnv(name) {
  const v = import.meta.env[name]
  return v != null && String(v).trim() !== '' ? String(v).trim() : ''
}

/** URL /exec : priorité aux variables « dispatch » comme dans .env.local habituel. */
export function getGasScriptExecUrl() {
  const u = trimEnv('VITE_GAS_DISPATCH_URL') || trimEnv('VITE_DOSSIER_WEBAPP_URL')
  return u.replace(/\/$/, '')
}

export function getGasScriptToken() {
  return trimEnv('VITE_GAS_DISPATCH_TOKEN') || trimEnv('VITE_DOSSIER_WEBAPP_TOKEN')
}

/** Indique si une URL Web App séparée sert aux POST Traitement (2e feuille). */
export function hasDedicatedDossierWebAppUrl() {
  return Boolean(trimEnv('VITE_DOSSIER_WEBAPP_URL'))
}

/**
 * GET ping sur VITE_GAS_DISPATCH_URL : le JSON contient-il traitementSur2eFeuille (DispatchSync récent) ?
 * @returns {Promise<{ checked: boolean, traitementFeuille2?: boolean, deployTag?: string }>}
 */
export async function pingDispatchDeploySupportsTraitement() {
  const execUrl = trimEnv('VITE_GAS_DISPATCH_URL')
  const token = getGasScriptToken()
  if (!gasUsesNetlifyRelay() && (!execUrl || !execUrl.includes('/exec') || !token)) {
    return { checked: false }
  }

  const viaProxy = gasUsesSameOriginProxy()
  const qs = new URLSearchParams({ action: 'ping' })
  if (!gasUsesNetlifyRelay() && token) qs.set('token', token)
  if (viaProxy && execUrl && execUrl.includes('/exec')) qs.set('_gasBase', execUrl.replace(/\/$/, ''))
  const url = viaProxy
    ? `${gasDispatchRelayPath()}?${qs.toString()}`
    : `${execUrl.replace(/\/$/, '')}?${qs.toString()}`

  try {
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
      return { checked: false }
    }

    if (
      data.error === 'gas_html_response' ||
      data.error === 'proxy_target_missing' ||
      data.error === 'proxy_upstream' ||
      data.error === 'relay_target_missing'
    ) {
      return { checked: false }
    }

    // Script “merged” : ping ne renvoie pas traitementSur2eFeuille, mais supporte le POST Traitement.
    if (typeof data.ping === 'string' && String(data.ping).includes('MergedDispatchTraitementRelances')) {
      return { checked: true, traitementFeuille2: true, deployTag: data.deployTag }
    }

    if (data.traitementSur2eFeuille === true) {
      return { checked: true, traitementFeuille2: true, deployTag: data.deployTag }
    }

    if (data.ok === true) {
      return { checked: true, traitementFeuille2: false, deployTag: data.deployTag }
    }

    return { checked: false }
  } catch {
    return { checked: false }
  }
}

/**
 * URL utilisée uniquement pour le POST Traitement dispatch (2e feuille).
 * Si VITE_DOSSIER_WEBAPP_URL est renseignée, elle prime sur VITE_GAS_DISPATCH_URL (feuille 1 inchangée).
 */
export function getDossierPostExecUrl() {
  const dedicated = trimEnv('VITE_DOSSIER_WEBAPP_URL')
  if (dedicated) return dedicated.replace(/\/$/, '')
  return getGasScriptExecUrl()
}

function getDossierPostToken() {
  const d = trimEnv('VITE_DOSSIER_WEBAPP_TOKEN')
  if (d) return d
  return getGasScriptToken()
}

export function dossierGasUrlInvalid() {
  if (gasUsesNetlifyRelay()) return false
  const url = getDossierPostExecUrl()
  return Boolean(url && !url.includes('/exec'))
}

export function dossierGasConfigured() {
  if (gasUsesNetlifyRelay()) return true
  const url = getDossierPostExecUrl()
  const token = getDossierPostToken()
  return Boolean(url && url.includes('/exec') && token)
}

function requestUrlForPost() {
  const direct = getDossierPostExecUrl()
  if (!direct && !gasUsesNetlifyRelay()) return ''
  if (gasUsesSameOriginProxy()) return gasDossierRelayPath()
  return direct
}

/**
 * POST vers la Web App — pas d’en-tête Content-Type (corps JSON.stringify uniquement).
 * @param {object} payload — champs formulaire (sans token ; token ajouté depuis l’env)
 * @returns {Promise<{ success: true, message?: string } & Record<string, unknown>>}
 */
export async function saveDossierToSheet(payload) {
  const baseUrl = getDossierPostExecUrl()
  const token = getDossierPostToken()

  if (!gasUsesNetlifyRelay()) {
    if (!baseUrl) {
      throw new Error(
        'URL Apps Script manquante : définissez VITE_GAS_DISPATCH_URL ou VITE_DOSSIER_WEBAPP_URL dans .env.local.',
      )
    }
    if (!baseUrl.includes('/exec')) {
      throw new Error(DOSSIER_GAS_INVALID_WEBAPP_URL_MESSAGE)
    }
    if (!token) {
      throw new Error(
        'Jeton manquant : définissez VITE_GAS_DISPATCH_TOKEN ou VITE_DOSSIER_WEBAPP_TOKEN dans .env.local.',
      )
    }
  }

  const bodyObj = {
    /** Routage côté GAS : pas « write » (réservé à la grille dispatch feuille 1). */
    action: 'dossier_append',
    date: payload?.date != null ? String(payload.date) : '',
    dossierNumber: payload?.dossierNumber ?? '',
    clientName: payload?.clientName ?? '',
    agency: payload?.agency ?? '',
    type: payload?.type ?? '',
    status: payload?.status ?? '',
    manager: payload?.manager ?? '',
    comment: payload?.comment ?? '',
  }
  if (!gasUsesNetlifyRelay()) bodyObj.token = token
  if (gasUsesSameOriginProxy() && baseUrl && baseUrl.includes('/exec')) bodyObj._gasBase = baseUrl.replace(/\/$/, '')
  const body = JSON.stringify(bodyObj)

  const url = requestUrlForPost()
  const viaProxy = gasUsesSameOriginProxy()

  if (viaProxy) {
    console.info('[googleSheet] POST via proxy Vite →', baseUrl.slice(0, 60) + '…')
  }

  const response = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    credentials: viaProxy ? 'same-origin' : 'omit',
    body,
  })

  const text = await response.text()
  console.info('[googleSheet] réponse brute HTTP', response.status, ':', text.slice(0, 800))

  let result
  try {
    result = JSON.parse(text)
  } catch {
    throw new Error(
      'Réponse invalide du script (non JSON) : ' + text.slice(0, 280).replace(/\s+/g, ' '),
    )
  }

  if (result.error === 'gas_html_response') {
    throw new Error(String(result.detail || 'La Web App a renvoyé une erreur HTML au lieu de JSON.'))
  }
  if (
    result.error === 'proxy_target_missing' ||
    result.error === 'proxy_upstream' ||
    result.error === 'relay_target_missing'
  ) {
    throw new Error(String(result.detail || 'Échec du relais (proxy / fonction Netlify).'))
  }

  if (!result.success) {
    const err =
      result.error === 'unauthorized'
        ? gasUsesNetlifyRelay()
          ? 'Jeton refusé : vérifiez `GAS_DOSSIER_SECRET` / `GAS_DISPATCH_SECRET` dans Netlify (doit être identique au SECRET Apps Script).'
          : 'Jeton refusé : VITE_GAS_DISPATCH_TOKEN (.env.local) doit être identique au SECRET de la Web App (propriété du script SECRET si elle est définie dans Apps Script).'
        : result.error === 'unknown_action'
          ? 'Le POST Traitement part encore vers l’ancienne Web App : dans .env.local, définissez VITE_DOSSIER_WEBAPP_URL avec l’URL /exec du fichier google-apps-script/TraitementFeuille2Only.gs (nouveau déploiement), même jeton que SECRET ou VITE_DOSSIER_WEBAPP_TOKEN, puis redémarrez npm run dev. Alternative : republication de DispatchSync.gs sur le déploiement actuel (Modifier → Nouvelle version).'
          : result.error || result.message || "Échec de l'enregistrement"
    throw new Error(String(err))
  }

  return result
}

/** @returns {Promise<{ ok: boolean, message?: string }>} — pour le formulaire existant */
export async function submitDossierRow(fields) {
  try {
    const r = await saveDossierToSheet(fields)
    return { ok: true, message: r.message || 'Enregistrement réussi' }
  } catch (e) {
    return { ok: false, message: String(e?.message || e) }
  }
}

/**
 * Lit l’onglet Traitement (feuille 2) pour afficher l’historique et recalculer l’équilibrage.
 * @returns {Promise<{ ok: true, values: unknown[][] } | { ok: false, message: string }>}
 */
export async function readTraitementSheetValues() {
  const baseUrl = getDossierPostExecUrl()
  // Priorité au jeton dossier ; sinon le jeton dispatch.
  const token = trimEnv('VITE_DOSSIER_WEBAPP_TOKEN') || trimEnv('VITE_GAS_DISPATCH_TOKEN')
  if (!gasUsesNetlifyRelay() && (!baseUrl || !baseUrl.includes('/exec') || !token)) {
    return { ok: false, message: 'Configuration manquante (URL /exec + jeton).' }
  }

  const viaProxy = gasUsesSameOriginProxy()
  const qs = new URLSearchParams({ action: 'read_traitement' })
  if (!gasUsesNetlifyRelay() && token) qs.set('token', token)
  if (viaProxy && baseUrl && baseUrl.includes('/exec')) qs.set('_gasBase', baseUrl.replace(/\/$/, ''))
  const url = viaProxy ? `${gasDossierRelayPath()}?${qs.toString()}` : `${baseUrl.replace(/\/$/, '')}?${qs.toString()}`

  try {
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
      return { ok: false, message: 'Réponse non JSON du script.' }
    }
    if (data?.success === true && Array.isArray(data.values)) {
      return { ok: true, values: data.values }
    }
    // Réponse “hint” = script déployé trop ancien (ne connaît pas action=read_traitement).
    if (data?.ok === true && data?.hint && !data?.success) {
      return {
        ok: false,
        message:
          "La Web App ne supporte pas encore la lecture de l’historique (action=read_traitement). Dans Apps Script : Déployer → Gérer les déploiements → Modifier → Nouvelle version.",
      }
    }
    if (
      data?.error === 'gas_html_response' ||
      data?.error === 'proxy_upstream' ||
      data?.error === 'relay_target_missing'
    ) {
      return { ok: false, message: String(data.detail || data.error) }
    }
    return { ok: false, message: String(data?.error || data?.message || "Échec lecture de l'historique") }
  } catch (e) {
    return { ok: false, message: String(e?.message || e) }
  }
}

function sampleDateISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getDossierSamplePayload() {
  return {
    date: sampleDateISO(),
    dossierNumber: `TEST-${Date.now()}`,
    clientName: '',
    agency: '',
    type: 'CIMR',
    status: '',
    manager: 'Zineb',
    comment: 'Ligne « Tester (exemple) » — Traitement dispatch.',
  }
}

/** Envoie des données d’exemple et log le résultat (console). */
export async function submitDossierSampleRow() {
  const sample = getDossierSamplePayload()
  console.info('[googleSheet] test exemple', sample)
  try {
    const r = await saveDossierToSheet(sample)
    console.info('[googleSheet] test OK', r)
    return { ok: true, message: r.message || 'Exemple enregistré' }
  } catch (e) {
    console.error('[googleSheet] test échec', e)
    return { ok: false, message: String(e?.message || e) }
  }
}
