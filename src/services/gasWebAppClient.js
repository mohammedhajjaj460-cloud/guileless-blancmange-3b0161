/**
 * Client HTTP réutilisable pour les Web Apps Google Apps Script (/exec).
 * Cause fréquente de « Failed to fetch » : CORS / réseau navigateur → script.google.com.
 * En `npm run dev`, utiliser les chemins proxy `/__gas-dispatch-proxy` (voir vite-plugin-gas-proxy.js).
 */

import { gasDispatchRelayPath, gasUsesNetlifyRelay, gasUsesSameOriginProxy } from './gasProxyMode'

export const GAS_FETCH_DEFAULT_TIMEOUT_MS = 45_000

/** Codes d’erreur structurés pour messages UI en français. */
export const GasErrorCode = {
  CONFIG_MANQUANTE: 'config_manquante',
  URL_MANQUANTE: 'url_manquante',
  URL_INVALIDE: 'url_invalide',
  URL_TABLEUR: 'url_tableur',
  RESEAU: 'reseau',
  TIMEOUT: 'timeout',
  ABORT: 'abort',
  REPONSE_NON_JSON: 'reponse_non_json',
  HTTP: 'http',
  APPS_SCRIPT: 'apps_script',
}

export class GasFetchError extends Error {
  /**
   * @param {string} code — valeur de GasErrorCode
   * @param {string} message — message utilisateur (FR)
   * @param {{ status?: number, bodySnippet?: string, cause?: unknown }} [meta]
   */
  constructor(code, message, meta = {}) {
    super(message)
    this.name = 'GasFetchError'
    this.code = code
    this.status = meta.status
    this.bodySnippet = meta.bodySnippet
    this.cause = meta.cause
  }
}

/** URL Web App attendue : https://script.google.com/macros/s/…/exec */
export function isValidGasExecUrl(url) {
  const u = String(url || '')
    .trim()
    .replace(/\/$/, '')
  if (!u.startsWith('https://script.google.com/macros/s/')) return false
  return /\/exec$/i.test(u)
}

export function redactSensitiveInUrl(url) {
  return String(url || '').replace(/([?&]token=)[^&]*/gi, '$1[REDACTÉ]')
}

/**
 * fetch avec délai max + journaux console (URL redacted, statut, extrait corps).
 * @param {{ url: string, method?: string, headers?: Record<string, string>, body?: BodyInit | null, logTag?: string, timeoutMs?: number }} opts
 * @returns {Promise<{ status: number, text: string }>}
 */
export async function gasFetchText({
  url,
  method = 'GET',
  headers = {},
  body = undefined,
  logTag = 'gas',
  timeoutMs = GAS_FETCH_DEFAULT_TIMEOUT_MS,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()

  const safeUrlLog = url.startsWith('/') ? url : redactSensitiveInUrl(url)
  const bodyLog =
    typeof body === 'string'
      ? body
          .replace(/"token"\s*:\s*"[^"]*"/g, '"token":"[REDACTÉ]"')
          .replace(/token=[^&]+/gi, 'token=[REDACTÉ]')
      : body instanceof URLSearchParams
        ? body.toString().replace(/token=[^&]+/gi, 'token=[REDACTÉ]').replace(/payload=[^&]*/i, 'payload=[…]')
        : '[corps non texte]'

  console.info(`[${logTag}] → ${method} ${safeUrlLog}`)
  if (body !== undefined && body !== null) {
    console.info(`[${logTag}] corps (extrait) :`, String(bodyLog).slice(0, 400))
  }

  try {
    const res = await fetch(url, {
      method,
      mode: 'cors',
      credentials: url.startsWith('/') ? 'same-origin' : 'omit',
      headers,
      body,
      signal: controller.signal,
    })

    const text = await res.text()
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const ms = t1 - t0

    console.info(
      `[${logTag}] ← HTTP ${res.status} en ${Math.round(ms)} ms ; extrait réponse :`,
      text.slice(0, 500).replace(/\s+/g, ' '),
    )

    return { status: res.status, text }
  } catch (e) {
    const name = e?.name || ''
    const msg = String(e?.message || e)

    console.error(`[${logTag}] échec fetch :`, name, msg, e)

    if (name === 'AbortError') {
      throw new GasFetchError(
        GasErrorCode.TIMEOUT,
        `Délai dépassé (${Math.round(timeoutMs / 1000)} s) lors de l’appel à la Web App Google.`,
        { cause: e },
      )
    }

    if (e instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(msg)) {
      throw new GasFetchError(
        GasErrorCode.RESEAU,
        gasUsesSameOriginProxy()
          ? gasUsesNetlifyRelay()
            ? 'Réseau : impossible de joindre les fonctions Netlify `/.netlify/functions/gas-*`. Vérifiez le déploiement Netlify (Functions activées) et les variables `GAS_*` côté Netlify.'
            : import.meta.env.DEV
              ? 'Réseau : impossible de joindre le relais `/__gas-*-proxy` (serveur Vite). Vérifiez `npm run dev` et le terminal du serveur.'
              : 'Réseau : impossible de joindre le relais same-origin (proxy Vite preview, ou Netlify Functions). En local : `npm run build && npm run start`. Sur Netlify : vérifiez `netlify.toml` + variables `GAS_*`.'
          : 'Réseau : le navigateur n’a pas pu joindre script.google.com (souvent CORS ou pare-feu). Par défaut l’app utilise un relais same-origin ; si vous avez forcé `VITE_GAS_DIRECT=true`, retirez-le ou ajoutez un proxy HTTPS.',
        { cause: e },
      )
    }

    throw new GasFetchError(GasErrorCode.RESEAU, msg || 'Erreur réseau inconnue.', { cause: e })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Parse JSON Apps Script ; si échec, lève GasFetchError avec extrait texte.
 * @param {string} text
 * @param {number} httpStatus
 * @param {string} logTag
 */
export function gasParseJsonOrThrow(text, httpStatus, logTag = 'gas') {
  const trimmed = String(text || '').trim()
  if (trimmed.startsWith('<')) {
    const titleMatch = trimmed.match(/<title>([^<]*)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''
    console.error(`[${logTag}] réponse HTML (titre « ${title || '?'} »), pas du JSON.`)
    throw new GasFetchError(
      GasErrorCode.APPS_SCRIPT,
      `Page HTML « ${title || 'Erreur'} » (HTTP ${httpStatus}) : le script Web App n’a pas répondu en JSON. ` +
        'Contrôlez .env.local (URL /exec = celle qui marche dans le navigateur), redémarrez npm run dev, autorisations Apps Script, déploiement « Tout le monde », nouvelle version. ' +
        'La page Dossiers exige DispatchSync.gs sur cette URL ; un script dossier seul → utiliser Traitement dispatch (/saisie-dossier) ou ajouter DispatchSync au projet.',
      { status: httpStatus, bodySnippet: trimmed.slice(0, 400) },
    )
  }
  try {
    return JSON.parse(trimmed)
  } catch (parseErr) {
    console.error(`[${logTag}] JSON.parse échoué :`, parseErr)
    throw new GasFetchError(
      GasErrorCode.REPONSE_NON_JSON,
      `Réponse non JSON (HTTP ${httpStatus}). Début : ${trimmed.slice(0, 200).replace(/\s+/g, ' ')}`,
      { status: httpStatus, bodySnippet: trimmed.slice(0, 400), cause: parseErr },
    )
  }
}

/** URL lecture Dispatch (GET) — en dev : proxy + `_gasBase` pour cible si pas d’URL dans .env côté serveur. */
export function buildDispatchGasReadUrl(execBase, token) {
  const params = new URLSearchParams({ action: 'read' })
  if (!gasUsesNetlifyRelay() && token) params.set('token', token)
  if (gasUsesSameOriginProxy()) {
    if (execBase) params.set('_gasBase', execBase)
    return `${gasDispatchRelayPath()}?${params.toString()}`
  }
  if (!token) {
    throw new GasFetchError(GasErrorCode.CONFIG_MANQUANTE, 'Jeton manquant pour la lecture Dispatch (mode direct).')
  }
  params.set('token', token)
  return `${execBase}?${params.toString()}`
}

/**
 * POST Dispatch — corps JSON `{ token, action: "write", rows }`.
 * (L’ancien format `application/x-www-form-urlencoded` + `payload=` faisait échouer les scripts qui font seulement `JSON.parse(e.postData.contents)`.)
 */
export function buildDispatchGasWriteRequest(execBase, innerPayloadObject) {
  const base = { ...innerPayloadObject }
  if (gasUsesNetlifyRelay()) {
    delete base.token
    if (execBase) base._gasBase = execBase
  } else if (gasUsesSameOriginProxy()) {
    if (execBase) base._gasBase = execBase
  }
  const payloadObj = base
  const body = JSON.stringify(payloadObj)
  const url = gasUsesSameOriginProxy() ? gasDispatchRelayPath() : execBase
  return {
    url,
    body,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  }
}

/**
 * @param {unknown} err
 * @returns {string} message français pour l’UI
 */
export function gasErrorMessageFr(err) {
  if (err instanceof GasFetchError) return err.message
  return String(err?.message || err || 'Erreur inconnue.')
}
