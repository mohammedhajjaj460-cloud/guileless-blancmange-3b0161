import {
  buildDispatchGasReadUrl,
  buildDispatchGasWriteRequest,
  gasErrorMessageFr,
  gasFetchText,
  gasParseJsonOrThrow,
  isValidGasExecUrl,
} from './gasWebAppClient'
import { gasUsesNetlifyRelay } from './gasProxyMode'

/**
 * Titres affichés ligne 1 dans Google Sheets (même ordre que les lignes de données).
 * Doit rester aligné avec DISPATCH_HEADERS dans WebAppFeuille1.gs / DispatchSync.gs.
 */
export const SHEET_HEADERS = [
  'Date',
  'id',
  'N° affaire',
  'Statut',
  'Type présence',
  'Gestionnaire absent (id)',
  'Durée absence',
  'Présence (libellé)',
  'Gestionnaire (tour)',
  'Absents (ids)',
]

/** Clé interne → variantes reconnues dans la ligne d’en-tête (technique ou FR). */
const DISPATCH_HEADER_ALIASES = /** @type {Record<string, string[]>} */ ({
  id: ['id'],
  dateEnregistrement: ['dateenregistrement', 'date'],
  numeroAffaire: ['numeroaffaire', 'n° affaire', 'n affaire', 'no affaire', 'numero affaire', 'numéro affaire'],
  statut: ['statut', 'status'],
  presenceType: ['presencetype', 'type présence', 'type presence'],
  gestionnaireAbsentId: [
    'gestionnaireabsentid',
    'gestionnaire absent (id)',
    'gestionnaire absent',
    'id absent',
  ],
  dureeAbsence: ['dureeabsence', 'durée absence', 'duree absence'],
  presenceLabel: [
    'presencelabel',
    'présence (libellé)',
    'presence (libelle)',
    'libellé présence',
    'libelle presence',
    'presence affichee',
  ],
  assignee: ['assignee', 'gestionnaire (tour)', 'gestionnaire tour', 'gestionnaire'],
  absentsIds: ['absentsids', 'absents (ids)', 'absents ids', 'absents json', 'absents'],
})

function normHeaderCell(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * @param {string[]} headers — première ligne feuille
 * @param {string} fieldKey — clé affaire (ex. dateEnregistrement)
 */
export function dispatchColumnIndex(headers, fieldKey) {
  const row = headers.map(normHeaderCell)
  const aliases = DISPATCH_HEADER_ALIASES[fieldKey]
  if (!aliases) return -1
  for (const a of aliases) {
    const i = row.indexOf(normHeaderCell(a))
    if (i >= 0) return i
  }
  return -1
}

/** ID du classeur (segment entre …/d/ et …/edit dans l’URL). Surcharge optionnelle : VITE_DISPATCH_SPREADSHEET_ID. */
const DEFAULT_DISPATCH_SPREADSHEET_ID = '17VY4nqpLIwJbbZSYOtaA5StsN8U9yJhEAZoC4T2KG2A'

const fromEnvSheetId = import.meta.env.VITE_DISPATCH_SPREADSHEET_ID
export const DISPATCH_SPREADSHEET_ID =
  fromEnvSheetId != null && String(fromEnvSheetId).trim() !== ''
    ? String(fromEnvSheetId).trim()
    : DEFAULT_DISPATCH_SPREADSHEET_ID

/** Lien pour ouvrir le classeur dans le navigateur (1er onglet, gid=0). */
export function getDispatchSpreadsheetEditUrl() {
  return `https://docs.google.com/spreadsheets/d/${DISPATCH_SPREADSHEET_ID}/edit?gid=0#gid=0`
}

const STORAGE_SHEET_CONFIG = 'sofac_dispatch_sheet_web_v1'

function envUrlRaw() {
  const v = import.meta.env.VITE_GAS_DISPATCH_URL
  return v != null && String(v).trim() !== '' ? String(v).trim().replace(/\/$/, '') : ''
}

function envTokenRaw() {
  const v = import.meta.env.VITE_GAS_DISPATCH_TOKEN
  return v != null && String(v).trim() !== '' ? String(v).trim() : ''
}

function usingEnvPair() {
  return Boolean(envUrlRaw() && envTokenRaw())
}

function readSavedConfig() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_SHEET_CONFIG)
    if (!raw) return null
    const j = JSON.parse(raw)
    const url = String(j.url ?? '').trim().replace(/\/$/, '')
    const token = String(j.token ?? '').trim()
    if (!url || !token) return null
    return { url, token }
  } catch {
    return null
  }
}

/** Enregistre URL Web App + jeton dans ce navigateur (si .env ne fonctionne pas). */
export function saveDispatchSheetConfig(url, tokenStr) {
  const u = String(url ?? '')
    .trim()
    .replace(/\/$/, '')
  const t = String(tokenStr ?? '').trim()
  localStorage.setItem(STORAGE_SHEET_CONFIG, JSON.stringify({ url: u, token: t }))
}

export function clearDispatchSheetConfig() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_SHEET_CONFIG)
  }
}

/** true = paire URL+jeton lue depuis le navigateur, pas depuis Vite .env */
export function sheetConfigFromBrowser() {
  if (usingEnvPair()) return false
  return readSavedConfig() != null
}

export function sheetSyncConfigured() {
  if (gasUsesNetlifyRelay()) return true
  if (usingEnvPair()) return true
  return readSavedConfig() != null
}

/** URL active (env prioritaire si les deux variables sont définies). */
export function getDispatchSheetUrl() {
  return execBaseUrl()
}

/** URL Web App + jeton valides : lecture et écriture possibles. */
export function canPushToSheet() {
  if (gasUsesNetlifyRelay()) {
    // URL + secret sont dans GAS_* côté Netlify ; le navigateur n’a pas besoin de les avoir.
    return sheetSyncConfigured()
  }
  return sheetSyncConfigured() && sheetUrlLooksLikeWebApp(execBaseUrl())
}

function execBaseUrl() {
  if (usingEnvPair()) return envUrlRaw()
  const s = readSavedConfig()
  return s?.url ? String(s.url).trim().replace(/\/$/, '') : ''
}

function token() {
  if (usingEnvPair()) return envTokenRaw()
  const s = readSavedConfig()
  return s?.token ? String(s.token).trim() : ''
}

export function affairesToSheetRows(affaires) {
  return affaires.map((a) => [
    a.dateEnregistrement ?? '',
    a.id ?? '',
    a.numeroAffaire ?? '',
    a.statut ?? '',
    a.presenceType ?? 'tous',
    a.gestionnaireAbsentId ?? '',
    a.dureeAbsence ?? '',
    a.presenceLabel ?? '',
    a.assignee ?? '',
    JSON.stringify(Array.isArray(a.absentsIds) ? a.absentsIds : []),
  ])
}

/**
 * Vérifie que l’URL est une Web App Apps Script (/exec sur script.google.com/macros/s/…).
 */
export function sheetUrlLooksLikeWebApp(url) {
  return isValidGasExecUrl(url)
}

/** URL du navigateur du classeur (erreur fréquente dans le champ « Web App »). */
export function sheetUrlIsSpreadsheetWebView(url) {
  const u = String(url || '').trim().toLowerCase()
  return (
    u.includes('docs.google.com/spreadsheets/') ||
    u.includes('spreadsheets.google.com/') ||
    u.includes('docs.google.com/spreadsheets?')
  )
}

/**
 * @param {unknown[][]} values — première ligne = en-têtes
 * @returns {object[]}
 */
export function parseSheetValuesToAffaires(values) {
  if (!values || !Array.isArray(values) || values.length < 2) return []
  const headers = values[0].map((h) => String(h || '').trim())
  const col = (fieldKey) => dispatchColumnIndex(headers, fieldKey)

  const out = []
  for (let r = 1; r < values.length; r++) {
    const row = values[r]
    if (!row || row.every((c) => c === '' || c == null)) continue

    const get = (name, fallback = '') => {
      const i = col(name)
      if (i < 0) return fallback
      const v = row[i]
      if (v == null || v === '') return fallback
      if (v instanceof Date) return v.toISOString()
      if (typeof v === 'object' && v !== null && 'toISOString' in v) {
        try {
          return v.toISOString()
        } catch {
          return String(v)
        }
      }
      return String(v)
    }

    let absentsIds = []
    try {
      const raw = get('absentsIds', '')
      if (raw) absentsIds = JSON.parse(raw)
    } catch {
      absentsIds = []
    }
    if (!Array.isArray(absentsIds)) absentsIds = []

    const id = get('id', '')
    const numeroAffaire = get('numeroAffaire', '')
    if (!id && !numeroAffaire) continue

    out.push({
      id: id || `row_${r}`,
      dateEnregistrement: get('dateEnregistrement', ''),
      numeroAffaire,
      statut: get('statut', ''),
      presenceType: get('presenceType', 'tous') || 'tous',
      gestionnaireAbsentId: get('gestionnaireAbsentId', '') || null,
      dureeAbsence: get('dureeAbsence', '') || null,
      presenceLabel: get('presenceLabel', ''),
      assignee: get('assignee', ''),
      absentsIds,
    })
  }
  return out
}

/** Lit toutes les lignes de la feuille (GET). */
export async function fetchAffairesFromSheet() {
  const base = execBaseUrl()
  const t = token()
  if (!gasUsesNetlifyRelay() && (!base || !t)) {
    throw new Error(
      'Configuration manquante : définissez VITE_GAS_DISPATCH_URL et VITE_GAS_DISPATCH_TOKEN dans .env.local, ou enregistrez l’URL Web App (…/exec) et le jeton dans le formulaire « Feuille Google ».',
    )
  }
  if (!gasUsesNetlifyRelay() && base && sheetUrlIsSpreadsheetWebView(base)) {
    throw new Error(
      'URL incorrecte : vous avez enregistré l’adresse du tableur Google Sheets. Il faut l’URL du déploiement Application Web (https://script.google.com/macros/s/…/exec), copiée depuis Apps Script.',
    )
  }
  if (!gasUsesNetlifyRelay() && base && !isValidGasExecUrl(base)) {
    throw new Error(
      'URL Web App invalide : elle doit commencer par https://script.google.com/macros/s/ et se terminer par /exec (pas l’URL de l’éditeur ni celle du classeur).',
    )
  }

  const readUrl = buildDispatchGasReadUrl(base, t)

  const { status, text } = await gasFetchText({
    url: readUrl,
    method: 'GET',
    logTag: 'dispatch-read',
  })

  let data
  try {
    data = gasParseJsonOrThrow(text, status, 'dispatch-read')
  } catch (e) {
    throw new Error(gasErrorMessageFr(e))
  }

  if (data.error === 'gas_html_response') {
    throw new Error(String(data.detail || 'La Web App a renvoyé du HTML au lieu du JSON (voir console proxy).'))
  }

  if (data.error === 'proxy_target_missing' || data.error === 'proxy_upstream' || data.error === 'relay_target_missing') {
    throw new Error(
      String(
        data.detail ||
          'Le proxy de développement n’a pas pu joindre Google. Vérifiez .env.local et redémarrez `npm run dev`.',
      ),
    )
  }

  if (data.error) {
    const hint =
      data.error === 'unauthorized'
        ? ' Jeton refusé : dans .env.local, VITE_GAS_DISPATCH_TOKEN doit être identique au SECRET attendu par la Web App (sans guillemets ni espace en trop ; redémarrer npm run dev). Dans Apps Script, si une propriété du script « SECRET » existe, c’est elle qui compte (pas le texte dans le fichier .gs).'
        : ''
    throw new Error(String(data.error) + (data.detail ? ` — ${data.detail}` : '') + hint)
  }
  if (!Array.isArray(data.values)) {
    throw new Error('Lecture feuille : réponse inattendue (champ « values » absent ou invalide).')
  }
  return parseSheetValuesToAffaires(data.values)
}

/** Remplace la feuille par l’état actuel de l’app (POST). Suppressions incluses. */
export async function pushAffairesToSheet(affaires) {
  const base = execBaseUrl()
  const t = token()
  if (!gasUsesNetlifyRelay() && (!base || !t)) {
    throw new Error(
      'Configuration manquante : définissez VITE_GAS_DISPATCH_URL et VITE_GAS_DISPATCH_TOKEN dans .env.local, ou le formulaire « Feuille Google ».',
    )
  }
  if (!gasUsesNetlifyRelay() && base && sheetUrlIsSpreadsheetWebView(base)) {
    throw new Error(
      'URL incorrecte : adresse de tableur détectée. Utilisez l’URL Web App https://script.google.com/macros/s/…/exec.',
    )
  }
  if (!gasUsesNetlifyRelay() && base && !isValidGasExecUrl(base)) {
    throw new Error(
      'URL Web App invalide : https://script.google.com/macros/s/…/exec uniquement.',
    )
  }

  const rows = affairesToSheetRows(affaires)
  const inner = {
    action: 'write',
    rows,
  }
  if (!gasUsesNetlifyRelay()) inner.token = t

  const { url, body, headers } = buildDispatchGasWriteRequest(base, inner)

  const { status, text } = await gasFetchText({
    url,
    method: 'POST',
    headers,
    body,
    logTag: 'dispatch-write',
  })

  let data
  try {
    data = gasParseJsonOrThrow(text, status, 'dispatch-write')
  } catch (e) {
    throw new Error(gasErrorMessageFr(e))
  }

  if (data.error === 'gas_html_response') {
    throw new Error(String(data.detail || 'La Web App a renvoyé du HTML au lieu du JSON.'))
  }

  if (data.error === 'proxy_target_missing' || data.error === 'proxy_upstream' || data.error === 'relay_target_missing') {
    throw new Error(
      String(
        data.detail ||
          'Le proxy de développement n’a pas pu envoyer les données vers Google. Redémarrez `npm run dev` après .env.local.',
      ),
    )
  }

  if (data.error) {
    const hint =
      data.error === 'unauthorized'
        ? gasUsesNetlifyRelay()
          ? ' — Jeton refusé : vérifiez `GAS_DISPATCH_SECRET` dans Netlify (doit être identique au SECRET Apps Script).'
          : ' — Jeton refusé : dans .env.local, `VITE_GAS_DISPATCH_TOKEN` doit être **exactement** le même secret que celui utilisé par la Web App. Dans Apps Script : si la propriété du projet « SECRET » est renseignée (Paramètres → Propriétés du script), **c’est elle** qui vaut, pas le texte dans `getSecret_()`. Corrigez l’un ou l’autre pour qu’ils correspondent, puis redémarrez `npm run dev`.'
        : ''
    throw new Error(String(data.error) + (data.detail ? ` — ${data.detail}` : '') + hint)
  }
  if (status >= 400) {
    throw new Error(data?.message || `HTTP ${status} : ${JSON.stringify(data)}`)
  }
  if (data.ok !== true) {
    throw new Error(
      `Réponse Web App inattendue (ok absent ou false). Reçu : ${JSON.stringify(data).slice(0, 240)}`,
    )
  }
  const written = typeof data.written === 'number' ? data.written : -1
  return { written, ok: true }
}
