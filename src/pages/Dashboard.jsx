import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, FolderKanban, BellRing } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { fetchAffairesFromSheet } from '../services/dispatchGoogleSheet'
import { readTraitementSheetValues } from '../api/googleSheet'
import { readRelancesValues } from '../api/relancesSheet'
import { GESTIONNAIRES } from '../utils/repartitionDossiers'
import styles from './Dashboard.module.css'

const QUICK = [
  { to: '/dossiers', label: 'Dossiers Dispatch', icon: FolderKanban },
  { to: '/relances', label: 'Relances', icon: BellRing },
]

function safeLower(s) {
  return String(s || '').trim().toLowerCase()
}

function parseIsoMs(s) {
  const t = Date.parse(String(s || '').trim())
  return Number.isFinite(t) ? t : null
}

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ymdFromAnyDateString(s) {
  const ms = parseIsoMs(s)
  if (ms == null) return ''
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function BarList({ title, subtitle, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <section className={styles.card} aria-label={title}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{title}</h2>
          {subtitle ? <p className={styles.cardMeta}>{subtitle}</p> : null}
        </div>
      </header>
      <div className={styles.barList}>
        {rows.map((r) => (
          <div key={r.label} className={styles.barRow}>
            <div className={styles.barLabel}>{r.label}</div>
            <div className={styles.barTrack} aria-hidden>
              <div className={styles.barFill} style={{ width: `${Math.round((r.value / max) * 100)}%` }} />
            </div>
            <div className={styles.barValue}>{r.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MiniLine({ title, points }) {
  const w = 320
  const h = 92
  const pad = 10
  const max = Math.max(1, ...points.map((p) => p.value))
  const xs = points.map((_, i) => (pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1)))
  const ys = points.map((p) => pad + (1 - p.value / max) * (h - pad * 2))
  const d = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`)
    .join(' ')

  return (
    <section className={styles.card} aria-label={title}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{title}</h2>
          <p className={styles.cardMeta}>7 derniers jours · max {max}</p>
        </div>
      </header>
      <div className={styles.lineWrap}>
        <svg viewBox={`0 0 ${w} ${h}`} className={styles.lineSvg} role="img" aria-label={title}>
          <path d={d} className={styles.linePath} />
          {xs.map((x, i) => (
            <circle key={i} cx={x} cy={ys[i]} r={3.2} className={styles.lineDot} />
          ))}
        </svg>
        <div className={styles.lineLegend} aria-hidden>
          {points.map((p) => (
            <div key={p.label} className={styles.lineLegendItem}>
              <span className={styles.lineLegendKey}>{p.label.slice(5)}</span>
              <span className={styles.lineLegendVal}>{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [dispatchAffaires, setDispatchAffaires] = useState([])
  const [traitementValues, setTraitementValues] = useState(null)
  const [relancesValues, setRelancesValues] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr('')
    Promise.allSettled([fetchAffairesFromSheet(), readTraitementSheetValues(), readRelancesValues()]).then(
      (results) => {
        if (cancelled) return
        const [rDispatch, rTrait, rRel] = results
        if (rDispatch.status === 'fulfilled') setDispatchAffaires(rDispatch.value || [])
        else setErr(String(rDispatch.reason?.message || rDispatch.reason || 'Erreur dispatch'))

        if (rTrait.status === 'fulfilled' && rTrait.value?.ok) setTraitementValues(rTrait.value.values || [])
        if (rRel.status === 'fulfilled' && rRel.value?.ok) setRelancesValues(rRel.value.values || [])
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const kpi = useMemo(() => {
    const dossiersActifs = dispatchAffaires.length
    const dispatchEnAttente = dispatchAffaires.filter((a) => !String(a.assignee || '').trim()).length
    const relancesOuvertes = relancesValues && Array.isArray(relancesValues) ? Math.max(0, relancesValues.length - 1) : '—'
    return [
      { label: 'Dossiers actifs', value: String(dossiersActifs), hint: 'Feuille 1 · Dispatch' },
      { label: 'Dispatch en attente', value: String(dispatchEnAttente), hint: 'Sans gestionnaire' },
      { label: 'Relances ouvertes', value: String(relancesOuvertes), hint: 'Feuille 3 · Relances' },
    ]
  }, [dispatchAffaires, relancesValues])

  const traitementByManager = useMemo(() => {
    const base = Object.fromEntries(GESTIONNAIRES.map((g) => [g.nom, 0]))
    const idToNom = new Map(GESTIONNAIRES.map((g) => [String(g.id).trim().toLowerCase(), g.nom]))
    if (!traitementValues || !Array.isArray(traitementValues) || traitementValues.length < 2) {
      return Object.entries(base).map(([label, value]) => ({ label, value }))
    }
    const headers = traitementValues[0].map((h) => safeLower(h))
    const idxManager = headers.findIndex((h) => h.includes('gestionnaire'))
    for (let i = 1; i < traitementValues.length; i++) {
      const row = traitementValues[i] || []
      const raw = idxManager >= 0 ? String(row[idxManager] || '').trim() : ''
      if (!raw) continue
      const maybeById = idToNom.get(raw.toLowerCase())
      const nom = maybeById || raw
      if (base[nom] !== undefined) base[nom] += 1
    }
    return Object.entries(base).map(([label, value]) => ({ label, value }))
  }, [traitementValues])

  const dispatchByManager = useMemo(() => {
    const base = Object.fromEntries(GESTIONNAIRES.map((g) => [g.nom, 0]))
    const idToNom = new Map(GESTIONNAIRES.map((g) => [String(g.id).trim().toLowerCase(), g.nom]))
    for (const a of dispatchAffaires) {
      const raw = String(a.assignee || '').trim()
      if (!raw) continue
      // La feuille peut contenir soit le nom ("Zineb"), soit l'id ("zineb").
      const key = raw
      const maybeById = idToNom.get(raw.toLowerCase())
      const nom = maybeById || key
      if (base[nom] !== undefined) base[nom] += 1
    }
    return Object.entries(base).map(([label, value]) => ({ label, value }))
  }, [dispatchAffaires])

  const traitementByType = useMemo(() => {
    const out = {}
    if (!traitementValues || !Array.isArray(traitementValues) || traitementValues.length < 2) return []
    const headers = traitementValues[0].map((h) => safeLower(h))
    const idxType = headers.findIndex((h) => h === 'type')
    for (let i = 1; i < traitementValues.length; i++) {
      const row = traitementValues[i] || []
      const t = idxType >= 0 ? String(row[idxType] || '').trim() : ''
      if (!t) continue
      out[t] = (out[t] || 0) + 1
    }
    return Object.entries(out)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [traitementValues])

  const relancesSeries = useMemo(() => {
    const today = todayYmd()
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      days.push(`${y}-${m}-${day}`)
    }
    const counts = Object.fromEntries(days.map((d) => [d, 0]))
    if (relancesValues && Array.isArray(relancesValues) && relancesValues.length >= 2) {
      for (let i = 1; i < relancesValues.length; i++) {
        const row = relancesValues[i] || []
        const ymd = ymdFromAnyDateString(row[0])
        if (ymd && counts[ymd] !== undefined) counts[ymd] += 1
      }
    }
    return days.map((d) => ({ label: d === today ? `${d}*` : d, value: counts[d] || 0 }))
  }, [relancesValues])

  return (
    <AppShell
      title="Tableau de bord"
      subtitle="Synthèse opérationnelle : accédez rapidement aux modules depuis le menu latéral ou utilisez les raccourcis ci-dessous."
    >
      <div className={styles.layout}>
        <section className={styles.kpiRow} aria-label="Indicateurs clés">
          {kpi.map((item) => (
            <article key={item.label} className={styles.kpi}>
              <p className={styles.kpiLabel}>{item.label}</p>
              <p className={styles.kpiValue}>{item.value}</p>
              <p className={styles.kpiHint}>{item.hint}</p>
            </article>
          ))}
        </section>

        {err ? (
          <p className={styles.warn} role="status">
            <strong>Connexion données :</strong> {err}
          </p>
        ) : null}

        <div className={styles.grid}>
          <BarList title="Traitement — dossiers par gestionnaire" subtitle="Feuille 2 · équilibrage" rows={traitementByManager} />
          <BarList title="Dispatch — dossiers par gestionnaire" subtitle="Feuille 1 · assignation" rows={dispatchByManager} />
          <BarList title="Types les plus traités" subtitle="Feuille 2 · Top 8" rows={traitementByType} />
          <MiniLine title="Relances créées (par jour)" points={relancesSeries} />
        </div>

        <div className={styles.split}>
          <section className={styles.panel} aria-labelledby="quick-title">
            <h2 id="quick-title" className={styles.panelTitle}>
              Accès rapide
            </h2>
            <ul className={styles.quickList}>
              {QUICK.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link to={to} className={styles.quickLink}>
                    <span className={styles.quickIcon}>
                      <Icon size={20} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className={styles.quickLabel}>{label}</span>
                    <ArrowUpRight size={18} className={styles.quickArrow} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.panel} aria-labelledby="activity-title">
            <h2 id="activity-title" className={styles.panelTitle}>
              Activité récente
            </h2>
            <div className={styles.activity}>
              <div className={styles.activityRow}>
                <span className={styles.activityKey}>Chargement</span>
                <span className={styles.activityVal}>{loading ? 'En cours…' : 'OK'}</span>
              </div>
              <div className={styles.activityRow}>
                <span className={styles.activityKey}>Feuille 1</span>
                <span className={styles.activityVal}>{dispatchAffaires.length} lignes</span>
              </div>
              <div className={styles.activityRow}>
                <span className={styles.activityKey}>Feuille 2</span>
                <span className={styles.activityVal}>
                  {traitementValues && Array.isArray(traitementValues) ? Math.max(0, traitementValues.length - 1) : '—'} lignes
                </span>
              </div>
              <div className={styles.activityRow}>
                <span className={styles.activityKey}>Feuille 3</span>
                <span className={styles.activityVal}>
                  {relancesValues && Array.isArray(relancesValues) ? Math.max(0, relancesValues.length - 1) : '—'} lignes
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}
