/**
 * Règles métier (démo) :
 * - 5 gestionnaires : Zineb, Siham, Soukaina, Anas, Badiaa.
 * - Badiaa est en télétravail : elle ne reçoit jamais de dossiers du dispatch.
 * - Les dossiers « de Badiaa » sont répartis uniquement entre les 4 autres (hors absents).
 * - Les autres dossiers injectés suivent la même piste de réception (jamais Badiaa).
 * - Répartition équitable : n dossiers, m gestionnaires éligibles → chacun reçoit floor(n/m) ou +1 pour les premiers restes.
 */

export const GESTIONNAIRES = [
  { id: 'zineb', nom: 'Zineb' },
  { id: 'siham', nom: 'Siham' },
  { id: 'soukaina', nom: 'Soukaina' },
  { id: 'anas', nom: 'Anas' },
  { id: 'badiaa', nom: 'Badiaa', horsPoolDispatch: true },
]

/**
 * Gestionsnaires qui peuvent recevoir des dossiers (jamais Badiaa), non absents.
 * @param {Record<string, boolean>} absents id → true si absent
 */
export function poolReception(absents) {
  return GESTIONNAIRES.filter((g) => !g.horsPoolDispatch && !absents[g.id])
}

/**
 * Répartit n dossiers (entier ≥ 0) entre la liste ordonnée de gestionnaires éligibles.
 * @returns {{ id: string; nom: string; nombre: number }[]}
 */
export function repartir(n, gestionnairesOrdonnes) {
  const m = gestionnairesOrdonnes.length
  if (n === 0 || m === 0) {
    return gestionnairesOrdonnes.map((g) => ({ id: g.id, nom: g.nom, nombre: 0 }))
  }
  const base = Math.floor(n / m)
  const reste = n % m
  return gestionnairesOrdonnes.map((g, i) => ({
    id: g.id,
    nom: g.nom,
    nombre: base + (i < reste ? 1 : 0),
  }))
}

/**
 * @param {number} dossiersBadiaa dossiers à réinjecter issus du portefeuille Badiaa
 * @param {number} dossiersAutres autres dossiers injectés
 * @param {Record<string, boolean>} absents
 */
export function calculerRepartition(dossiersBadiaa, dossiersAutres, absents) {
  const pool = poolReception(absents)
  const nBad = Math.max(0, Math.floor(Number(dossiersBadiaa) || 0))
  const nAut = Math.max(0, Math.floor(Number(dossiersAutres) || 0))

  const repBadiaa = repartir(nBad, pool)
  const repAutres = repartir(nAut, pool)

  const byId = new Map(pool.map((g) => [g.id, { id: g.id, nom: g.nom, badiaa: 0, autres: 0, total: 0 }]))
  for (const r of repBadiaa) {
    const row = byId.get(r.id)
    if (row) {
      row.badiaa = r.nombre
      row.total += r.nombre
    }
  }
  for (const r of repAutres) {
    const row = byId.get(r.id)
    if (row) {
      row.autres = r.nombre
      row.total += r.nombre
    }
  }

  return {
    pool,
    poolVide: pool.length === 0,
    lignes: pool.map((g) => byId.get(g.id)),
    detail: {
      dossiersBadiaa: nBad,
      dossiersAutres: nAut,
      repartitionBadiaa: repBadiaa,
      repartitionAutres: repAutres,
    },
  }
}
