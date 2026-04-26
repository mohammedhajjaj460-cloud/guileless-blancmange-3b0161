import { GESTIONNAIRES } from './repartitionDossiers'

/** Ordre fixe du tour — Badiaa ne reçoit jamais d’affaires (télétravail). */
export const POOL_DISPATCH_IDS = ['zineb', 'siham', 'soukaina', 'anas']

/** Deux statuts injection : injecté / pour injection. */
export const STATUTS_AFFAIRE = ['Injecté', 'Pour injection']

const STATUT_INJECTE_CANON = 'Injecté'
const STATUT_POUR_INJECTION_CANON = 'Pour injection'

function normStatutComparable(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Ramène le libellé feuille / saisie vers « Injecté » ou « Pour injection » quand c’est reconnaissable.
 * Utilisé pour l’affichage cohérent et pour {@link poidsAffaire} (tour = charge pondérée).
 */
export function canonicalStatut(statut) {
  if (statut == null || String(statut).trim() === '') return ''
  const raw = String(statut).trim()
  const legacyExact = {
    'À injecter': STATUT_POUR_INJECTION_CANON,
    Injectée: STATUT_INJECTE_CANON,
    'injectée': STATUT_INJECTE_CANON,
    'à injecter': STATUT_POUR_INJECTION_CANON,
  }
  if (legacyExact[raw]) return legacyExact[raw]

  const n = normStatutComparable(raw)

  if (
    n.includes('pour injection') ||
    n === 'a injecter' ||
    n === 'injection' ||
    n === 'pi' ||
    n === 'p.i.' ||
    n === 'p.i'
  ) {
    return STATUT_POUR_INJECTION_CANON
  }

  if (n === 'injecte' || n === 'injectee') return STATUT_INJECTE_CANON

  return raw
}

export const DUREES_ABSENCE = [
  'Demi-journée',
  '1 jour',
  '2 jours',
  '3 jours',
  '1 semaine',
  '2 semaines',
]

export function nomGestionnaire(id) {
  const g = GESTIONNAIRES.find((x) => x.id === id)
  return g ? g.nom : id
}

/** « Pour injection » = 2 pour le tour et la charge ; « Injecté » (et tout autre statut) = 1. */
export function poidsAffaire(affaire) {
  return canonicalStatut(affaire?.statut) === STATUT_POUR_INJECTION_CANON ? 2 : 1
}

/**
 * Choisit le gestionnaire pour la prochaine affaire : d’abord celui qui a la charge pondérée la plus faible,
 * puis tour à tour parmi les ex æquo (ordre Zineb → Siham → Soukaina → Anas).
 */
export function choisirGestionnaire(affaires, absentsIds, lastAssigneeId) {
  const abs = new Set(absentsIds || [])
  const pool = POOL_DISPATCH_IDS.filter((id) => !abs.has(id))
  if (pool.length === 0) return null

  const counts = Object.fromEntries(pool.map((id) => [id, 0]))
  for (const a of affaires) {
    if (a.assignee && counts[a.assignee] !== undefined) {
      counts[a.assignee] += poidsAffaire(a)
    }
  }

  const min = Math.min(...pool.map((id) => counts[id]))
  const candidates = pool.filter((id) => counts[id] === min)

  if (candidates.length === 1) return candidates[0]

  const start = lastAssigneeId ? POOL_DISPATCH_IDS.indexOf(lastAssigneeId) : -1
  for (let step = 1; step <= POOL_DISPATCH_IDS.length; step++) {
    const idx = (start + step) % POOL_DISPATCH_IDS.length
    const id = POOL_DISPATCH_IDS[idx]
    if (candidates.includes(id)) return id
  }
  return candidates[0]
}

export const STORAGE_AFFAIRES = 'sofac_affaires_dispatch_v1'

/** Affaires plus anciennes que cette fenêtre (jours calendaires, fuseau local) sont retirées du stockage navigateur. */
export const AFFAIRES_RETENTION_DAYS = 31

function dayKeyFromIsoLocal(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Première date locale conservée (incluse) : aujourd’hui − `days`. */
export function cutoffDayKeyLocal(days = AFFAIRES_RETENTION_DAYS) {
  const c = new Date()
  c.setHours(0, 0, 0, 0)
  c.setDate(c.getDate() - days)
  return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`
}

export function affaireDansFenetreConservation(affaire, days = AFFAIRES_RETENTION_DAYS) {
  const key = affaire?.dateEnregistrement ? dayKeyFromIsoLocal(affaire.dateEnregistrement) : null
  if (!key) return false
  return key >= cutoffDayKeyLocal(days)
}

export function filtrerAffairesConservation(affaires, days = AFFAIRES_RETENTION_DAYS) {
  return affaires.filter((a) => affaireDansFenetreConservation(a, days))
}
