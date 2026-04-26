import { useEffect, useMemo, useState } from 'react'
import { GESTIONNAIRES } from '../utils/repartitionDossiers'
import {
  deleteRelancesFromSheet,
  RELANCES_INVALID_WEBAPP_URL_MESSAGE,
  readRelancesValues,
  relancesConfigured,
  relancesUrlInvalid,
  submitRelanceRow,
} from '../api/relancesSheet'
import styles from './RelancesForm.module.css'

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function RelancesForm() {
  const [date, setDate] = useState(todayISO)
  const [managerId, setManagerId] = useState('')
  const [affaire, setAffaire] = useState('')
  const [documentManquant, setDocumentManquant] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState({ type: null, text: '' })
  const [history, setHistory] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [qAffaire, setQAffaire] = useState('')
  const [qManager, setQManager] = useState('')
  const [selected, setSelected] = useState({})
  const [validating, setValidating] = useState(false)

  const managerName = useMemo(() => {
    const g = GESTIONNAIRES.find((x) => x.id === managerId)
    return g ? g.nom : ''
  }, [managerId])

  useEffect(() => {
    let cancelled = false
    if (!relancesConfigured()) return
    readRelancesValues().then((r) => {
      if (cancelled) return
      if (!r.ok) {
        setHistoryError(String(r.message || ''))
        setHistory([])
        return
      }
      setHistoryError('')
      const values = r.values || []
      if (!Array.isArray(values) || values.length < 2) {
        setHistory([])
        return
      }
      const rows = values.slice(1).map((row) => ({
        date: String(row?.[0] ?? ''),
        manager: String(row?.[1] ?? ''),
        affaire: String(row?.[2] ?? ''),
        doc: String(row?.[3] ?? ''),
      }))
      const sorted = rows
        .slice(-200)
        .sort((a, b) => {
          const ta = Date.parse(String(a.date || '').trim())
          const tb = Date.parse(String(b.date || '').trim())
          const va = Number.isFinite(ta) ? ta : Number.POSITIVE_INFINITY
          const vb = Number.isFinite(tb) ? tb : Number.POSITIVE_INFINITY
          if (va !== vb) return va - vb
          return String(a.affaire || '').localeCompare(String(b.affaire || ''))
        })
      setHistory(sorted)
      setSelected({})
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredHistory = useMemo(() => {
    const qA = String(qAffaire || '').trim().toLowerCase()
    const qM = String(qManager || '').trim().toLowerCase()
    return (history || []).filter((r) => {
      if (qA && !String(r.affaire || '').toLowerCase().includes(qA)) return false
      if (qM && String(r.manager || '').toLowerCase() !== qM) return false
      return true
    })
  }, [history, qAffaire, qManager])

  async function onValidateSelected() {
    if (!relancesConfigured()) return
    const items = Object.keys(selected)
      .filter((k) => selected[k])
      .map((k) => {
        const idx = Number(k)
        const r = filteredHistory[idx]
        return r
          ? {
              date: r.date,
              manager: r.manager,
              affaire: r.affaire,
              documentManquant: r.doc,
            }
          : null
      })
      .filter(Boolean)

    if (items.length === 0) {
      setFeedback({ type: 'error', text: 'Cochez au moins une relance à valider.' })
      return
    }

    setValidating(true)
    const del = await deleteRelancesFromSheet(items)
    setValidating(false)

    if (!del.ok) {
      setFeedback({ type: 'error', text: del.message || 'Échec suppression' })
      return
    }

    setFeedback({
      type: 'ok',
      text: `${del.deleted || items.length} relance(s) validée(s) et supprimée(s) de la feuille.`,
    })
    const rr = await readRelancesValues()
    if (rr.ok) {
      const values = rr.values || []
      const rows = values.slice(1).map((row) => ({
        date: String(row?.[0] ?? ''),
        manager: String(row?.[1] ?? ''),
        affaire: String(row?.[2] ?? ''),
        doc: String(row?.[3] ?? ''),
      }))
      const sorted = rows
        .slice(-200)
        .sort((a, b) => {
          const ta = Date.parse(String(a.date || '').trim())
          const tb = Date.parse(String(b.date || '').trim())
          const va = Number.isFinite(ta) ? ta : Number.POSITIVE_INFINITY
          const vb = Number.isFinite(tb) ? tb : Number.POSITIVE_INFINITY
          if (va !== vb) return va - vb
          return String(a.affaire || '').localeCompare(String(b.affaire || ''))
        })
      setHistory(sorted)
      setSelected({})
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    setFeedback({ type: null, text: '' })

    if (!relancesConfigured()) {
      setFeedback({
        type: 'error',
        text: relancesUrlInvalid()
          ? `${RELANCES_INVALID_WEBAPP_URL_MESSAGE} Corrigez VITE_RELANCES_WEBAPP_URL dans .env.local puis redémarrez le serveur.`
          : 'Configurez VITE_RELANCES_WEBAPP_URL et VITE_RELANCES_WEBAPP_TOKEN dans .env.local, puis redémarrez npm run dev.',
      })
      return
    }

    if (!managerId) {
      setFeedback({ type: 'error', text: 'Choisissez un gestionnaire.' })
      return
    }
    if (!String(affaire).trim()) {
      setFeedback({ type: 'error', text: 'Renseignez l’affaire.' })
      return
    }
    if (!String(documentManquant).trim()) {
      setFeedback({ type: 'error', text: 'Renseignez le document manquant.' })
      return
    }

    setSaving(true)
    const result = await submitRelanceRow({
      date,
      manager: managerName,
      affaire: String(affaire).trim(),
      documentManquant: String(documentManquant).trim(),
    })
    setSaving(false)

    if (result.ok) {
      setFeedback({ type: 'ok', text: result.message || 'Relance enregistrée' })
      setAffaire('')
      setDocumentManquant('')
      // Recharge rapide de l’historique après ajout
      readRelancesValues().then((r) => {
        if (!r.ok) return
        const values = r.values || []
        if (!Array.isArray(values) || values.length < 2) return
        const rows = values.slice(1).map((row) => ({
          date: String(row?.[0] ?? ''),
          manager: String(row?.[1] ?? ''),
          affaire: String(row?.[2] ?? ''),
          doc: String(row?.[3] ?? ''),
        }))
        setHistory(rows.slice(-50).reverse())
      })
      return
    }
    setFeedback({ type: 'error', text: result.message || 'Échec enregistrement' })
  }

  return (
    <section className={styles.wrap} aria-label="Création d’une relance">
      <div className={styles.panel}>
        <header className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Créer une relance</h2>
          <p className={styles.panelMeta}>Saisissez la relance, puis enregistrez dans la feuille.</p>
        </header>

        {relancesUrlInvalid() ? (
          <p className={styles.configWarn} role="status">
            <strong>URL incorrecte :</strong> {RELANCES_INVALID_WEBAPP_URL_MESSAGE}
          </p>
        ) : !relancesConfigured() ? (
          <p className={styles.configWarn} role="status">
            <strong>Configuration requise :</strong> <code>VITE_RELANCES_WEBAPP_URL</code> (…/exec) et{' '}
            <code>VITE_RELANCES_WEBAPP_TOKEN</code> dans <code>.env.local</code>, puis redémarrer le serveur.
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

        {relancesConfigured() && historyError ? (
          <p className={styles.configWarn} role="status">
            <strong>Historique non chargé :</strong> {historyError}
          </p>
        ) : null}

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Date de création</span>
            <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Gestionnaire</span>
            <select className={styles.select} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">— Choisir —</option>
              {GESTIONNAIRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.fieldWide}>
            <span className={styles.fieldLabel}>Affaire</span>
            <input
              className={styles.input}
              type="text"
              value={affaire}
              onChange={(e) => setAffaire(e.target.value)}
              placeholder="Ex. 2026/12345 ou référence dossier…"
              autoComplete="off"
            />
          </label>

          <label className={styles.fieldWide}>
            <span className={styles.fieldLabel}>Document manquant</span>
            <input
              className={styles.input}
              type="text"
              value={documentManquant}
              onChange={(e) => setDocumentManquant(e.target.value)}
              placeholder="Ex. Attestation, quittance, RIB…"
              autoComplete="off"
            />
          </label>

          <div className={styles.toolbar}>
            <button type="submit" className={styles.submit} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>

        {history.length ? (
          <div className={styles.historyWrap} aria-label="Historique des relances">
            <h3 className={styles.historyTitle}>Relances (feuille 3)</h3>
            <div className={styles.filters}>
              <label className={styles.filterField}>
                <span className={styles.fieldLabel}>Recherche affaire</span>
                <input
                  className={styles.input}
                  type="text"
                  value={qAffaire}
                  onChange={(e) => setQAffaire(e.target.value)}
                  placeholder="Numéro / texte…"
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.fieldLabel}>Gestionnaire</span>
                <select className={styles.select} value={qManager} onChange={(e) => setQManager(e.target.value)}>
                  <option value="">Tous</option>
                  {GESTIONNAIRES.map((g) => (
                    <option key={g.id} value={g.nom.toLowerCase()}>
                      {g.nom}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.filterActions}>
                <button
                  type="button"
                  className={styles.btnValidate}
                  onClick={onValidateSelected}
                  disabled={validating || !relancesConfigured()}
                >
                  {validating ? 'Suppression…' : 'Valider (supprimer)'}
                </button>
              </div>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th aria-label="Valider" />
                    <th>Date</th>
                    <th>Gestionnaire</th>
                    <th>Affaire</th>
                    <th>Document manquant</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((r, i) => (
                    <tr key={`${r.affaire}_${r.manager}_${i}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[i])}
                          onChange={(e) => setSelected((p) => ({ ...p, [i]: e.target.checked }))}
                          aria-label={`Valider ${r.affaire}`}
                        />
                      </td>
                      <td>{r.date || '—'}</td>
                      <td>{r.manager || '—'}</td>
                      <td>{r.affaire || '—'}</td>
                      <td>{r.doc || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

