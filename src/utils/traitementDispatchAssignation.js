/**
 * Traitement dispatch — équilibrage des dossiers par type d’affaire.
 * Règles :
 * - Badiaa ne reçoit pas : bancaire, gérants société.
 * - Soukaina ne reçoit pas « gérants société ».
 * - Les gestionnaires absents sont exclus du pool.
 */

/** Ordre fixe pour le tour en cas d’ex æquo (équité). */
export const GESTIONNAIRE_TRAITEMENT_ORDER = ['zineb', 'siham', 'soukaina', 'anas', 'badiaa']

export const AFFAIRE_TYPES = [
  { id: 'cimr', label: 'CIMR' },
  { id: 'bancaire', label: 'Bancaire' },
  { id: 'gerants_societe', label: 'Gérants société' },
  { id: 'cmr', label: 'CMR' },
  { id: 'cnt', label: 'CNT' },
]

export function labelAffaireType(typeId) {
  const t = AFFAIRE_TYPES.find((x) => x.id === typeId)
  return t ? t.label : String(typeId || '')
}

/**
 * @param {string} gestionnaireId
 * @param {string} typeId — id dans AFFAIRE_TYPES
 */
export function gestionnaireEligiblePourType(gestionnaireId, typeId) {
  if (!gestionnaireId || !typeId) return false
  if (gestionnaireId === 'badiaa') {
    if (typeId === 'bancaire' || typeId === 'gerants_societe') {
      return false
    }
  }
  if (gestionnaireId === 'soukaina' && typeId === 'gerants_societe') return false
  return true
}

/**
 * Gestionnaires pouvant recevoir ce type (hors absents).
 * @param {string} typeId
 * @param {string[]} absentsIds
 * @returns {string[]}
 */
export function poolEligiblePourType(typeId, absentsIds) {
  const abs = new Set(absentsIds || [])
  return GESTIONNAIRE_TRAITEMENT_ORDER.filter(
    (id) => !abs.has(id) && gestionnaireEligiblePourType(id, typeId),
  )
}

/**
 * Choisit le gestionnaire pour une ligne : charge la plus faible parmi les éligibles, puis tour.
 * @param {string} typeId
 * @param {{ managerId?: string }[]} rows — toutes les lignes du tableau
 * @param {number} rowIndex — index de la ligne à pourvoir (ignorée dans les comptes)
 * @param {string[]} absentsIds
 * @returns {string | null}
 */
export function choisirGestionnaireTraitement(typeId, rows, rowIndex, absentsIds) {
  const pool = poolEligiblePourType(typeId, absentsIds)
  if (pool.length === 0) return null

  const counts = Object.fromEntries(pool.map((id) => [id, 0]))
  for (let i = 0; i < rows.length; i++) {
    if (i === rowIndex) continue
    const mid = rows[i]?.managerId
    if (mid && counts[mid] !== undefined) counts[mid] += 1
  }

  const min = Math.min(...pool.map((id) => counts[id]))
  const candidates = pool.filter((id) => counts[id] === min)

  if (candidates.length === 1) return candidates[0]

  let lastAssigneeId = null
  for (let i = rowIndex - 1; i >= 0; i--) {
    if (rows[i]?.managerId) {
      lastAssigneeId = rows[i].managerId
      break
    }
  }

  const start = lastAssigneeId ? GESTIONNAIRE_TRAITEMENT_ORDER.indexOf(lastAssigneeId) : -1
  for (let step = 1; step <= GESTIONNAIRE_TRAITEMENT_ORDER.length; step++) {
    const idx = (start + step) % GESTIONNAIRE_TRAITEMENT_ORDER.length
    const id = GESTIONNAIRE_TRAITEMENT_ORDER[idx]
    if (candidates.includes(id)) return id
  }
  return candidates[0]
}

/**
 * Variante “dispatch en continu” : choisit selon un compteur cumulatif (sur la session UI),
 * puis départage au tour après le dernier gestionnaire attribué.
 * @param {string} typeId
 * @param {Record<string, number>} countsById
 * @param {string | null} lastAssigneeId
 * @param {string[]} absentsIds
 * @returns {string | null}
 */
export function choisirGestionnaireTraitementAvecCompteurs(
  typeId,
  countsById,
  lastAssigneeId,
  absentsIds,
) {
  const pool = poolEligiblePourType(typeId, absentsIds)
  if (pool.length === 0) return null

  const counts = Object.fromEntries(pool.map((id) => [id, Number(countsById?.[id] || 0)]))
  const min = Math.min(...pool.map((id) => counts[id]))
  const candidates = pool.filter((id) => counts[id] === min)
  if (candidates.length === 1) return candidates[0]

  const start = lastAssigneeId ? GESTIONNAIRE_TRAITEMENT_ORDER.indexOf(lastAssigneeId) : -1
  for (let step = 1; step <= GESTIONNAIRE_TRAITEMENT_ORDER.length; step++) {
    const idx = (start + step) % GESTIONNAIRE_TRAITEMENT_ORDER.length
    const id = GESTIONNAIRE_TRAITEMENT_ORDER[idx]
    if (candidates.includes(id)) return id
  }
  return candidates[0]
}
