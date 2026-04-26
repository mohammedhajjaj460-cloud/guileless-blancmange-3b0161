import { useEffect, useState } from 'react'
import {
  DOSSIER_GAS_INVALID_WEBAPP_URL_MESSAGE,
  dossierGasConfigured,
  dossierGasUrlInvalid,
  hasDedicatedDossierWebAppUrl,
  pingDispatchDeploySupportsTraitement,
  readTraitementSheetValues,
  submitDossierRow,
  submitDossierSampleRow,
} from '../api/googleSheet'
import { GESTIONNAIRES } from '../utils/repartitionDossiers'
import { nomGestionnaire } from '../utils/affairesAssignation'
import {
  AFFAIRE_TYPES,
  GESTIONNAIRE_TRAITEMENT_ORDER,
  choisirGestionnaireTraitementAvecCompteurs,
  labelAffaireType,
  poolEligiblePourType,
} from '../utils/traitementDispatchAssignation'
import styles from './DossierSheetForm.module.css'

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function emptyCounts() {
  return Object.fromEntries(GESTIONNAIRES.map((g) => [g.id, 0]))
}

function normHeaderCell(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function looksLikeTraitementHeaders(headers) {
  const row = (headers || []).map(normHeaderCell)
  // Attendu dans Feuille 2 (Traitement)
  const expected = ['date', 'n° dossier', 'client', 'agence', 'type', 'statut', 'gestionnaire', 'commentaire'].map(
    normHeaderCell,
  )
  return expected.every((h) => row.includes(h))
}

function looksLikeRelancesHeaders(headers) {
  const row = (headers || []).map(normHeaderCell)
  const expected = ['date', 'gestionnaire', 'affaire', 'document manquant'].map(normHeaderCell)
  return expected.every((h) => row.includes(h))
}

export function DossierSheetForm() {
  const [absentManagerId, setAbsentManagerId] = useState('')
  const [date, setDate] = useState(todayISO)
  const [dossierNumber, setDossierNumber] = useState('')
  const [typeId, setTypeId] = useState('cimr')
  const [comment, setComment] = useState('')
  const [countsById, setCountsById] = useState(emptyCounts)
  const [lastAssigneeId, setLastAssigneeId] = useState(null)
  const [assignedManagerId, setAssignedManagerId] = useState('')
  const [historyLoadError, setHistoryLoadError] = useState('')
  const [historyValues, setHistoryValues] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState({ type: null, text: '' })
  /** null = non testé ; true = déploiement dispatch trop ancien pour le POST Traitement sans URL dédiée */
  const [dispatchTraitementStale, setDispatchTraitementStale] = useState(null)

  const absentsIds = absentManagerId ? [absentManagerId] : []

  useEffect(() => {
    const abs = absentManagerId ? [absentManagerId] : []
    const next =
      choisirGestionnaireTraitementAvecCompteurs(typeId, countsById, lastAssigneeId, abs) || ''
    setAssignedManagerId(next)
  }, [absentManagerId])

  useEffect(() => {
    let cancelled = false
    if (!dossierGasConfigured() || hasDedicatedDossierWebAppUrl()) {
      setDispatchTraitementStale(false)
      return
    }
    pingDispatchDeploySupportsTraitement().then((r) => {
      if (cancelled) return
      if (!r.checked) {
        setDispatchTraitementStale(false)
        return
      }
      setDispatchTraitementStale(r.traitementFeuille2 !== true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!dossierGasConfigured()) return
    setHistoryLoading(true)
    readTraitementSheetValues().then((r) => {
      if (cancelled) return
      setHistoryLoading(false)
      if (!r.ok) {
        setHistoryLoadError(String(r.message || ''))
        setHistoryValues(null)
        return
      }
      setHistoryLoadError('')

      const values = r.values || []
      setHistoryValues(values)
      if (!Array.isArray(values) || values.length < 2) {
        return
      }

      const headerRow = Array.isArray(values[0]) ? values[0] : []
      if (!looksLikeTraitementHeaders(headerRow) && looksLikeRelancesHeaders(headerRow)) {
        setHistoryLoadError(
          "La lecture 'Traitement' renvoie la table Relances (colonnes Affaire / Document manquant). Vérifiez que la Web App déployée pointe bien sur l’onglet 'Feuille 2' pour action=read_traitement, puis redéployez en 'Nouvelle version'.",
        )
        return
      }
      const headers = values[0].map((h) => String(h || '').trim().toLowerCase())
      const idxManager = headers.findIndex((h) => h.includes('gestionnaire'))
      const idxDate = headers.findIndex((h) => h === 'date')
      const idxNum = headers.findIndex((h) => h.includes('n° dossier') || h.includes('n°') || h.includes('dossier'))
      const idxType = headers.findIndex((h) => h === 'type')
      const idxComment = headers.findIndex((h) => h.includes('commentaire'))

      const nameToId = new Map(GESTIONNAIRES.map((g) => [g.nom.trim().toLowerCase(), g.id]))
      const counts = emptyCounts()
      let lastId = null

      for (let i = 1; i < values.length; i++) {
        const row = values[i] || []
        const managerName = idxManager >= 0 ? String(row[idxManager] || '').trim() : ''
        const mid = managerName ? nameToId.get(managerName.toLowerCase()) || null : null
        if (mid) {
          counts[mid] = Number(counts[mid] || 0) + 1
          lastId = mid
        }
      }

      setCountsById(counts)
      setLastAssigneeId(lastId)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function reloadHistory() {
    if (!dossierGasConfigured()) return
    setHistoryLoading(true)
    const r = await readTraitementSheetValues()
    setHistoryLoading(false)
    if (!r.ok) {
      setHistoryLoadError(String(r.message || ''))
      setHistoryValues(null)
      return
    }
    setHistoryLoadError('')
    const values = r.values || []
    setHistoryValues(values)
    if (Array.isArray(values) && values.length > 0) {
      const headerRow = Array.isArray(values[0]) ? values[0] : []
      if (!looksLikeTraitementHeaders(headerRow) && looksLikeRelancesHeaders(headerRow)) {
        setHistoryLoadError(
          "La lecture 'Traitement' renvoie la table Relances (colonnes Affaire / Document manquant). Vérifiez la Web App déployée et l’onglet cible 'Feuille 2', puis redéployez en 'Nouvelle version'.",
        )
      }
    }
  }

  useEffect(() => {
    const abs = absentManagerId ? [absentManagerId] : []
    const next =
      choisirGestionnaireTraitementAvecCompteurs(typeId, countsById, lastAssigneeId, abs) || ''
    setAssignedManagerId(next)
  }, [typeId, countsById, lastAssigneeId, absentManagerId])

  function tourLabel() {
    return GESTIONNAIRE_TRAITEMENT_ORDER.map((id) => nomGestionnaire(id)).join(' → ')
  }

  async function handleSubmitOne(e) {
    e.preventDefault()
    setFeedback({ type: null, text: '' })

    if (!dossierGasConfigured()) {
      setFeedback({
        type: 'error',
        text: dossierGasUrlInvalid()
          ? `${DOSSIER_GAS_INVALID_WEBAPP_URL_MESSAGE} Corrigez VITE_GAS_DISPATCH_URL dans .env.local puis redémarrez le serveur.`
          : 'Configurez VITE_GAS_DISPATCH_URL et VITE_GAS_DISPATCH_TOKEN dans .env.local (ou VITE_DOSSIER_WEBAPP_URL pour le Traitement uniquement), puis redémarrez npm run dev.',
      })
      return
    }

    const dn = String(dossierNumber || '').trim()
    if (!dn) {
      setFeedback({ type: 'error', text: 'Renseignez le numéro de dossier.' })
      return
    }

    if (!assignedManagerId) {
      setFeedback({ type: 'error', text: 'Aucune attribution possible (type + absence).' })
      return
    }
    const okPool = poolEligiblePourType(typeId, absentsIds)
    if (!okPool.includes(assignedManagerId)) {
      setFeedback({
        type: 'error',
        text: 'Incohérence d’attribution — rechargez la page ou changez le type.',
      })
      return
    }

    setSaving(true)
    const result = await submitDossierRow({
      date,
      dossierNumber: dn,
      clientName: '',
      agency: '',
      type: labelAffaireType(typeId),
      status: '',
      manager: nomGestionnaire(assignedManagerId),
      comment,
    })
    setSaving(false)

    if (result.ok) {
      setCountsById((prev) => ({
        ...prev,
        [assignedManagerId]: Number(prev?.[assignedManagerId] || 0) + 1,
      }))
      setLastAssigneeId(assignedManagerId)
      setFeedback({
        type: 'ok',
        text: `Enregistré : ${dn} → ${nomGestionnaire(assignedManagerId)} (${labelAffaireType(typeId)})`,
      })
      setDossierNumber('')
      setComment('')
      return
    }
    setFeedback({ type: 'error', text: result.message || 'Échec' })
  }

  async function handleTestSample() {
    setFeedback({ type: null, text: '' })
    if (!dossierGasConfigured()) {
      setFeedback({
        type: 'error',
        text: 'Configuration manquante : URL /exec + jeton dans .env.local (VITE_GAS_DISPATCH_* ou VITE_DOSSIER_WEBAPP_* pour le Traitement).',
      })
      return
    }
    setSaving(true)
    const result = await submitDossierSampleRow()
    setSaving(false)
    if (result.ok) {
      setFeedback({ type: 'ok', text: result.message || 'Exemple enregistré' })
    } else {
      setFeedback({ type: 'error', text: result.message || 'Échec envoi exemple.' })
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <header className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Répartition</h2>
          <p className={styles.panelMeta}>
            Attribution automatique et équilibrée · Badiaa : hors Bancaire & Gérants société · Soukaina : hors Gérants société
          </p>
        </header>

        {dossierGasUrlInvalid() ? (
          <p className={styles.configWarn} role="status">
            <strong>URL incorrecte :</strong> {DOSSIER_GAS_INVALID_WEBAPP_URL_MESSAGE}
          </p>
        ) : !dossierGasConfigured() ? (
          <p className={styles.configWarn} role="status">
            <strong>Configuration requise :</strong> <code>VITE_GAS_DISPATCH_URL</code> (…/exec) et{' '}
            <code>VITE_GAS_DISPATCH_TOKEN</code> dans <code>.env.local</code>. Si le Traitement échoue alors que
            les Dossiers fonctionnent, ajoutez <code>VITE_DOSSIER_WEBAPP_URL</code> (2e déploiement à jour).
            Redémarrer le serveur après changement.
          </p>
        ) : null}

        {dossierGasConfigured() && dispatchTraitementStale ? (
          <p className={styles.configWarn} role="status">
            <strong>Web App dispatch trop ancienne pour le Traitement :</strong> l’URL{' '}
            <code>VITE_GAS_DISPATCH_URL</code> ne répond pas au test <code>ping</code> avec{' '}
            <code>traitementSur2eFeuille</code> (script sans enregistrement 2e feuille). À faire au choix :{' '}
            <strong>(1)</strong> Dans Apps Script lié au classeur : coller <code>DispatchSync.gs</code>, puis{' '}
            <strong>Déployer → Gérer les déploiements → Modifier → Nouvelle version</strong> sur{' '}
            <strong>le même</strong> déploiement que cette URL. <strong>(2)</strong> Ou dans <code>.env.local</code>{' '}
            : ligne <code>VITE_DOSSIER_WEBAPP_URL=</code> (décommentée) = URL <code>/exec</code> d’un projet neuf
            avec <code>TraitementFeuille2Only.gs</code>, même jeton ou <code>VITE_DOSSIER_WEBAPP_TOKEN</code>, puis
            redémarrer <code>npm run dev</code>.
          </p>
        ) : null}

        {dossierGasConfigured() && historyLoadError ? (
          <p className={styles.configWarn} role="status">
            <strong>Historique non chargé :</strong> {historyLoadError}
          </p>
        ) : null}

        {feedback.type === 'ok' ? (
          <p className={styles.msgOk} role="status">
            {feedback.text}
          </p>
        ) : null}
        {feedback.type === 'error' ? (
          <p className={styles.msgErr} role="alert">
            {feedback.text}
          </p>
        ) : null}

        <form className={styles.formTable} onSubmit={handleSubmitOne}>
          <div className={styles.absenceBar}>
            <label className={styles.absenceField}>
              <span className={styles.fieldLabel}>Absence (exclue du dispatch)</span>
              <select
                className={styles.selectPro}
                value={absentManagerId}
                onChange={(e) => setAbsentManagerId(e.target.value)}
              >
                <option value="">Aucune</option>
                {GESTIONNAIRES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.tourInfo} role="status">
              <div className={styles.tourLine}>
                <span className={styles.fieldLabel}>Tour</span>
                <span className={styles.tourValue}>{tourLabel()}</span>
              </div>
              <div className={styles.tourLine}>
                <span className={styles.fieldLabel}>Gestionnaire attribué</span>
                {assignedManagerId ? (
                  <span className={styles.managerAssigned}>{nomGestionnaire(assignedManagerId)}</span>
                ) : (
                  <span className={styles.managerUnavailable}>Non attribuable</span>
                )}
              </div>
            </div>
          </div>

          <div className={styles.singleGrid}>
            <label className={styles.singleField}>
              <span className={styles.fieldLabel}>Date</span>
              <input
                className={styles.inputPro}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className={styles.singleField}>
              <span className={styles.fieldLabel}>N° dossier</span>
              <input
                className={styles.inputPro}
                type="text"
                value={dossierNumber}
                onChange={(e) => setDossierNumber(e.target.value)}
                placeholder="Numéro requis"
                autoComplete="off"
              />
            </label>
            <label className={styles.singleField}>
              <span className={styles.fieldLabel}>Type d’affaire</span>
              <select className={styles.selectPro} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {AFFAIRE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.singleFieldWide}>
              <span className={styles.fieldLabel}>Commentaire</span>
              <input
                className={styles.inputPro}
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="—"
                autoComplete="off"
              />
            </label>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Gestionnaire</th>
                  <th scope="col">Dossiers attribués</th>
                  <th scope="col">Éligible (type)</th>
                </tr>
              </thead>
              <tbody>
                {GESTIONNAIRES.map((g) => {
                  const eligible = poolEligiblePourType(typeId, absentsIds).includes(g.id)
                  const absent = absentsIds.includes(g.id)
                  return (
                    <tr key={g.id}>
                      <td>{g.nom}</td>
                      <td>{Number(countsById?.[g.id] || 0)}</td>
                      <td>{absent ? 'Absent' : eligible ? 'Oui' : 'Non'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <section className={styles.historyBlock} aria-label="Historique Traitement (Feuille 2)">
            <header className={styles.historyHeader}>
              <div>
                <h3 className={styles.historyTitle}>Historique (Feuille 2)</h3>
                <p className={styles.historyMeta}>
                  {Array.isArray(historyValues) ? Math.max(0, historyValues.length - 1) : '—'} ligne(s) · affichage
                  identique à Google Sheets
                </p>
              </div>
              <button
                type="button"
                className={styles.btnReload}
                onClick={reloadHistory}
                disabled={historyLoading || !dossierGasConfigured()}
              >
                {historyLoading ? 'Chargement…' : 'Recharger'}
              </button>
            </header>

            {historyLoadError ? (
              <p className={styles.historyHint} role="status">
                <strong>Erreur :</strong> {historyLoadError}
              </p>
            ) : null}

            {Array.isArray(historyValues) && historyValues.length > 0 ? (
              <div className={styles.historyScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {(historyValues[0] || []).map((h, i) => (
                        <th key={i} scope="col">
                          {String(h || '').trim() || `Col ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyValues.slice(1, 501).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {(row || []).map((cell, cIdx) => (
                          <td key={cIdx}>{String(cell ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.historyHint} role="status">
                {historyLoading ? 'Chargement de la feuille…' : 'Aucune donnée à afficher.'}
              </p>
            )}

            {Array.isArray(historyValues) && historyValues.length > 501 ? (
              <p className={styles.historyHint} role="status">
                Affichage limité à 500 lignes pour la performance.
              </p>
            ) : null}
          </section>

          <footer className={styles.toolbar}>
            <button type="submit" className={styles.submitPro} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer dans la feuille'}
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={handleTestSample}
              disabled={saving || !dossierGasConfigured()}
            >
              Test technique
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
