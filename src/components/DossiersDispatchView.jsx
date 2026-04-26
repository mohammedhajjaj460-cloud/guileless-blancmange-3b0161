import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { StatsCalendarPopover, StatsDateTrigger } from './StatsCalendarPopover'
import { dayKeyFromParts } from '../utils/dateCalendar'
import { GESTIONNAIRES } from '../utils/repartitionDossiers'
import {
  SHEET_HEADERS,
  getDispatchSpreadsheetEditUrl,
  canPushToSheet,
  clearDispatchSheetConfig,
  fetchAffairesFromSheet,
  getDispatchSheetUrl,
  pushAffairesToSheet,
  saveDispatchSheetConfig,
  sheetConfigFromBrowser,
  sheetSyncConfigured,
  sheetUrlIsSpreadsheetWebView,
  sheetUrlLooksLikeWebApp,
} from '../services/dispatchGoogleSheet'
import { gasUsesNetlifyRelay } from '../services/gasProxyMode'
import {
  POOL_DISPATCH_IDS,
  STATUTS_AFFAIRE,
  DUREES_ABSENCE,
  STORAGE_AFFAIRES,
  canonicalStatut,
  choisirGestionnaire,
  filtrerAffairesConservation,
  nomGestionnaire,
  poidsAffaire,
} from '../utils/affairesAssignation'
import styles from './DossiersDispatchView.module.css'

const POOL_META = GESTIONNAIRES.filter((g) => POOL_DISPATCH_IDS.includes(g.id))

const PRESENCE_OPTIONS = [
  { value: 'tous', label: 'Tous travaillent' },
  { value: 'absence', label: 'Il y a une absence' },
]

function dayKeyLocal(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabelFromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function dayLabelShortFromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function monthLabelFromKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function todayDayKey() {
  const n = new Date()
  return dayKeyFromParts(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

function emptyDayRow() {
  return {
    cells: Object.fromEntries(POOL_DISPATCH_IDS.map((id) => [id, { count: 0, charge: 0 }])),
    totalCount: 0,
    totalCharge: 0,
  }
}

function mergeStatsRow(target, source) {
  for (const id of POOL_DISPATCH_IDS) {
    target.cells[id].count += source.cells[id].count
    target.cells[id].charge += source.cells[id].charge
  }
  target.totalCount += source.totalCount
  target.totalCharge += source.totalCharge
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `aff_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function migrateRow(raw) {
  if (!raw || typeof raw !== 'object') return null

  const statutCanon = raw.statut != null && String(raw.statut).trim() !== '' ? canonicalStatut(raw.statut) : raw.statut
  const base =
    statutCanon != null && statutCanon !== raw.statut ? { ...raw, statut: statutCanon } : { ...raw }

  if (base.presenceType === 'tous' || base.presenceType === 'absence') return base

  const absentsIds = Array.isArray(base.absentsIds) ? base.absentsIds : []
  const presenceType = base.tousPresents !== false && absentsIds.length === 0 ? 'tous' : 'absence'
  const gestionnaireAbsentId =
    presenceType === 'absence' && absentsIds.length > 0 ? absentsIds[0] : null

  return {
    ...base,
    presenceType,
    gestionnaireAbsentId,
    dureeAbsence: base.dureeAbsence ?? null,
    presenceLabel:
      base.presenceLabel ??
      (presenceType === 'tous'
        ? 'Tous travaillent'
        : `Absence : ${gestionnaireAbsentId ? nomGestionnaire(gestionnaireAbsentId) : '—'}`),
  }
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_AFFAIRES)
    if (!raw) return { affaires: [] }
    const data = JSON.parse(raw)
    if (!Array.isArray(data.affaires)) return { affaires: [] }
    const affaires = data.affaires.map(migrateRow).filter(Boolean)
    const kept = filtrerAffairesConservation(affaires)
    if (kept.length !== affaires.length) {
      localStorage.setItem(STORAGE_AFFAIRES, JSON.stringify({ affaires: kept }))
    }
    return { affaires: kept }
  } catch {
    return { affaires: [] }
  }
}

export function DossiersDispatchView() {
  const [affaires, setAffaires] = useState([])
  const [hydrated, setHydrated] = useState(false)
  const [sheetUi, setSheetUi] = useState({ status: 'idle', message: '' })
  /** Après un chargement réussi depuis la feuille, on saute un envoi auto (déjà aligné). */
  const suppressNextSheetPush = useRef(false)

  const [presenceType, setPresenceType] = useState('tous')
  const [gestionnaireAbsentId, setGestionnaireAbsentId] = useState(POOL_DISPATCH_IDS[0])
  const [dureeAbsence, setDureeAbsence] = useState(DUREES_ABSENCE[1])

  const [numero, setNumero] = useState('')
  const [statut, setStatut] = useState(STATUTS_AFFAIRE[0])
  const [formError, setFormError] = useState('')

  const [sheetConfigRev, setSheetConfigRev] = useState(0)
  const [sheetFormUrl, setSheetFormUrl] = useState('')
  const [sheetFormToken, setSheetFormToken] = useState('')
  const [sheetFormError, setSheetFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (canPushToSheet()) {
        setSheetUi({ status: 'loading', message: 'Chargement depuis la feuille…' })
        try {
          const { affaires: localAffaires } = loadStored()
          const list = await fetchAffairesFromSheet()
          const migrated = list.map(migrateRow).filter(Boolean)
          const fromSheet = filtrerAffairesConservation(migrated)

          if (!cancelled) {
            if (fromSheet.length > 0) {
              setAffaires(fromSheet)
              localStorage.setItem(STORAGE_AFFAIRES, JSON.stringify({ affaires: fromSheet }))
              suppressNextSheetPush.current = true
              setSheetUi({ status: 'ok', message: '' })
            } else if (localAffaires.length > 0) {
              setAffaires(localAffaires)
              localStorage.setItem(STORAGE_AFFAIRES, JSON.stringify({ affaires: localAffaires }))
              suppressNextSheetPush.current = false
              setSheetUi({
                status: 'ok',
                message: '',
              })
            } else {
              setAffaires([])
              localStorage.setItem(STORAGE_AFFAIRES, JSON.stringify({ affaires: [] }))
              suppressNextSheetPush.current = true
              setSheetUi({ status: 'ok', message: '' })
            }
          }
        } catch (e) {
          if (!cancelled) {
            suppressNextSheetPush.current = false
            const { affaires: a } = loadStored()
            setAffaires(a)
            setSheetUi({
              status: 'error',
              message: e?.message || 'Lecture feuille impossible — données locales affichées.',
            })
          }
        }
      } else {
        const { affaires: a } = loadStored()
        setAffaires(a)
        setSheetUi({ status: 'idle', message: '' })
      }
      if (!cancelled) setHydrated(true)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [sheetConfigRev])

  useEffect(() => {
    if (!hydrated) return
    const kept = filtrerAffairesConservation(affaires)
    if (kept.length !== affaires.length) {
      setAffaires(kept)
      return
    }
    localStorage.setItem(STORAGE_AFFAIRES, JSON.stringify({ affaires: kept }))

    if (!canPushToSheet()) return

    if (suppressNextSheetPush.current) {
      suppressNextSheetPush.current = false
      return
    }

    const t = setTimeout(() => {
      setSheetUi((s) => (s.status === 'error' ? s : { status: 'loading', message: 'Envoi vers la feuille…' }))
      pushAffairesToSheet(kept)
        .then((res) =>
          setSheetUi({
            status: 'ok',
            message:
              res?.written >= 0
                ? `Feuille mise à jour — ${res.written} ligne(s). Ouvrez le classeur via le lien ci-dessus et appuyez sur F5 si la grille ne se rafraîchit pas.`
                : 'Feuille synchronisée.',
          }),
        )
        .catch((e) =>
          setSheetUi({ status: 'error', message: e?.message || 'Échec synchronisation feuille' }),
        )
    }, 750)
    return () => clearTimeout(t)
  }, [affaires, hydrated])

  const envoyerVersFeuille = useCallback(async () => {
    if (!canPushToSheet()) return
    const kept = filtrerAffairesConservation(affaires)
    setSheetUi({ status: 'loading', message: 'Envoi…' })
    try {
      const res = await pushAffairesToSheet(kept)
      setSheetUi({
        status: 'ok',
        message:
          res?.written >= 0
            ? `Feuille mise à jour — ${res.written} ligne(s). F5 dans Google Sheets si vous ne voyez pas les changements.`
            : 'Feuille synchronisée.',
      })
    } catch (e) {
      setSheetUi({ status: 'error', message: e?.message || 'Échec envoi' })
    }
  }, [affaires])

  function handleSaveSheetBrowserConfig(e) {
    e.preventDefault()
    setSheetFormError('')
    const u = sheetFormUrl.trim()
    const t = sheetFormToken.trim()
    if (!u || !t) {
      setSheetFormError('Renseignez l’URL et le jeton.')
      return
    }
    if (sheetUrlIsSpreadsheetWebView(u)) {
      setSheetFormError(
        'Vous avez collé l’URL du tableur Google Sheets (adresse …/spreadsheets/…/edit). Ce champ attend l’URL du déploiement « Application Web » : elle commence par https://script.google.com/macros/s/ et se termine par /exec. Dans la feuille : Extensions → Apps Script, puis Déployer → Gérer les déploiements, et copiez le lien d’exécution.',
      )
      return
    }
    if (!sheetUrlLooksLikeWebApp(u)) {
      setSheetFormError(
        'L’URL doit être celle du déploiement Web App et se terminer par /exec (pas l’URL de l’éditeur du script ni celle du tableur).',
      )
      return
    }
    saveDispatchSheetConfig(u, t)
    setSheetConfigRev((x) => x + 1)
  }

  function handleClearSheetBrowserConfig() {
    clearDispatchSheetConfig()
    setSheetFormUrl('')
    setSheetFormToken('')
    setSheetFormError('')
    setSheetConfigRev((x) => x + 1)
  }

  const actualiserDepuisFeuille = useCallback(async () => {
    if (!canPushToSheet()) return
    setSheetUi({ status: 'loading', message: 'Lecture feuille…' })
    try {
      const list = await fetchAffairesFromSheet()
      const migrated = list.map(migrateRow).filter(Boolean)
      const kept = filtrerAffairesConservation(migrated)
      setAffaires(kept)
      localStorage.setItem(STORAGE_AFFAIRES, JSON.stringify({ affaires: kept }))
      suppressNextSheetPush.current = true
      setSheetUi({ status: 'ok', message: '' })
    } catch (e) {
      setSheetUi({ status: 'error', message: e?.message || 'Échec lecture' })
    }
  }, [])

  /** Écrit uniquement la ligne d’en-têtes dans la feuille (feuille vide → première connexion). */
  const creerEntetesDansFeuille = useCallback(async () => {
    if (!canPushToSheet()) return
    setSheetUi({ status: 'loading', message: 'Création des en-têtes…' })
    try {
      const res = await pushAffairesToSheet([])
      setSheetUi({
        status: 'ok',
        message:
          res?.written === 0
            ? 'En-têtes prêts dans la feuille (0 ligne de données). Ouvrez ou rafraîchissez Google Sheets.'
            : 'Feuille synchronisée.',
      })
    } catch (e) {
      setSheetUi({ status: 'error', message: e?.message || 'Échec' })
    }
  }, [])

  const lastAssigneeId = affaires[0]?.assignee ?? null

  const absentsPourSaisie = useMemo(() => {
    if (presenceType === 'tous') return []
    return gestionnaireAbsentId ? [gestionnaireAbsentId] : []
  }, [presenceType, gestionnaireAbsentId])

  const statsParJour = useMemo(() => {
    const map = new Map()
    for (const a of affaires) {
      if (!a.assignee || !a.dateEnregistrement) continue
      if (!POOL_DISPATCH_IDS.includes(a.assignee)) continue
      const key = dayKeyLocal(a.dateEnregistrement)
      const w = poidsAffaire(a)
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: dayLabelFromKey(key),
          labelShort: dayLabelShortFromKey(key),
          cells: Object.fromEntries(
            POOL_DISPATCH_IDS.map((id) => [id, { count: 0, charge: 0 }]),
          ),
          totalCount: 0,
          totalCharge: 0,
        })
      }
      const row = map.get(key)
      row.cells[a.assignee].count++
      row.cells[a.assignee].charge += w
      row.totalCount++
      row.totalCharge += w
    }
    return [...map.values()].sort((x, y) => y.key.localeCompare(x.key))
  }, [affaires])

  const statsParMois = useMemo(() => {
    const map = new Map()
    for (const day of statsParJour) {
      const mk = day.key.slice(0, 7)
      if (!map.has(mk)) {
        map.set(mk, {
          key: mk,
          label: monthLabelFromKey(mk),
          ...emptyDayRow(),
        })
      }
      mergeStatsRow(map.get(mk), day)
    }
    return [...map.values()].sort((x, y) => y.key.localeCompare(x.key))
  }, [statsParJour])

  const [statsMode, setStatsMode] = useState('month')
  const [statsDayKey, setStatsDayKey] = useState(todayDayKey)
  const [statsCalendarMonth, setStatsCalendarMonth] = useState(() => todayDayKey().slice(0, 7))
  const [statsDayPickerOpen, setStatsDayPickerOpen] = useState(false)
  const [statsFullMonth, setStatsFullMonth] = useState(false)

  const [overviewMonthKey, setOverviewMonthKey] = useState(() => todayDayKey().slice(0, 7))
  const [overviewShowAllMonths, setOverviewShowAllMonths] = useState(false)
  const [overviewCalMonth, setOverviewCalMonth] = useState(() => todayDayKey().slice(0, 7))
  const [overviewPickerOpen, setOverviewPickerOpen] = useState(false)

  const statsDayByKey = useMemo(() => new Map(statsParJour.map((d) => [d.key, d])), [statsParJour])
  const statsDaysWithData = useMemo(() => new Set(statsParJour.map((d) => d.key)), [statsParJour])

  const rowForDay = useCallback(
    (dayKey) =>
      statsDayByKey.get(dayKey) ?? {
        key: dayKey,
        label: dayLabelFromKey(dayKey),
        labelShort: dayLabelShortFromKey(dayKey),
        ...emptyDayRow(),
      },
    [statsDayByKey],
  )

  const joursDuMoisChoisi = useMemo(() => {
    const mk = statsDayKey.slice(0, 7)
    return statsParJour.filter((d) => d.key.slice(0, 7) === mk)
  }, [statsParJour, statsDayKey])

  const joursAfficher = useMemo(() => {
    if (statsFullMonth) return joursDuMoisChoisi
    return [rowForDay(statsDayKey)]
  }, [statsFullMonth, joursDuMoisChoisi, statsDayKey, rowForDay])

  const resumeMoisCourant = useMemo(() => {
    const mk = statsDayKey.slice(0, 7)
    const row = {
      key: mk,
      label: monthLabelFromKey(mk),
      ...emptyDayRow(),
    }
    for (const d of joursDuMoisChoisi) mergeStatsRow(row, d)
    return row
  }, [statsDayKey, joursDuMoisChoisi])

  const moisAffiches = useMemo(() => {
    if (overviewShowAllMonths) return statsParMois
    return statsParMois.filter((m) => m.key === overviewMonthKey)
  }, [statsParMois, overviewShowAllMonths, overviewMonthKey])

  const ajouterAffaire = useCallback(
    (e) => {
      e.preventDefault()
      setFormError('')
      const n = String(numero || '').trim()
      if (!n) {
        setFormError('Le numéro d’affaire est obligatoire.')
        return
      }
      if (presenceType === 'absence' && !gestionnaireAbsentId) {
        setFormError('Choisissez le gestionnaire absent.')
        return
      }

      const assignee = choisirGestionnaire(affaires, absentsPourSaisie, lastAssigneeId)
      if (!assignee) {
        setFormError('Aucun gestionnaire disponible pour l’assignation.')
        return
      }

      const dateEnregistrement = new Date().toISOString()
      const presenceLabel =
        presenceType === 'tous'
          ? 'Tous travaillent'
          : `Absence : ${nomGestionnaire(gestionnaireAbsentId)}`

      const row = {
        id: newId(),
        dateEnregistrement,
        numeroAffaire: n,
        statut,
        presenceType,
        gestionnaireAbsentId: presenceType === 'absence' ? gestionnaireAbsentId : null,
        dureeAbsence: presenceType === 'absence' ? dureeAbsence : null,
        absentsIds: absentsPourSaisie,
        presenceLabel,
        assignee,
      }

      setAffaires((prev) => [row, ...prev])
      setNumero('')
      setStatut(STATUTS_AFFAIRE[0])
    },
    [
      numero,
      statut,
      presenceType,
      gestionnaireAbsentId,
      dureeAbsence,
      absentsPourSaisie,
      affaires,
      lastAssigneeId,
    ],
  )

  function supprimer(id) {
    setAffaires((prev) => prev.filter((a) => a.id !== id))
  }

  const updateAffaireRow = useCallback((id, patch) => {
    setAffaires((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }, [])

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const sheetUrl = getDispatchSpreadsheetEditUrl()
  const gasUrl = getDispatchSheetUrl()
  const sheetUrlInvalid =
    sheetSyncConfigured() &&
    !gasUsesNetlifyRelay() &&
    !sheetUrlLooksLikeWebApp(gasUrl)

  const sheetFormUrlTrim = sheetFormUrl.trim()
  const sheetFormUrlIsSpreadsheet = sheetUrlIsSpreadsheetWebView(sheetFormUrlTrim)
  const sheetFormUrlOk = Boolean(sheetFormUrlTrim && sheetUrlLooksLikeWebApp(sheetFormUrlTrim))
  const sheetFormSaveDisabled =
    !sheetFormUrlTrim || !sheetFormToken.trim() || !sheetFormUrlOk

  return (
    <div className={styles.wrap}>
      <section className={styles.sheetPanel} aria-labelledby="sheet-panel-title">
        <h3 id="sheet-panel-title" className={styles.sheetPanelTitle}>
          Feuille Google — où cliquer
        </h3>
        <p className={styles.sheetPanelLead}>
          {sheetSyncConfigured() ? (
            <>
              Page <strong>Dispatch</strong> ou <strong>Dossiers</strong> : encadré tout en haut. Feuille
              vide ? Cliquez sur le <strong>grand bouton bleu</strong>.{' '}
              {sheetConfigFromBrowser() ? (
                <>
                  Connexion enregistrée dans <strong>ce navigateur</strong> (pas besoin de .env).
                </>
              ) : null}
            </>
          ) : (
            <>
              Remplissez le <strong>formulaire ci-dessous</strong> (recommandé) ou configurez{' '}
              <code className={styles.sheetCode}>.env.local</code> puis redémarrez le serveur. Le bouton bleu
              apparaît dès que l’URL et le jeton sont enregistrés. Rien à faire dans Google Sheets pour voir
              le bouton : tout est dans <strong>cette application</strong>.
            </>
          )}
        </p>

        {sheetSyncConfigured() ? (
          <>
            <div className={styles.sheetHeroAction}>
              <button
                type="button"
                className={styles.sheetBtnHero}
                onClick={creerEntetesDansFeuille}
                disabled={sheetUrlInvalid}
              >
                Créer les en-têtes (feuille vide)
              </button>
              <span className={styles.sheetHeroHint}>
                Étape 1 — remplit la ligne 1 dans Google Sheets pour tester la connexion.
              </span>
            </div>
            <div
              className={styles.sheetBar}
              role="status"
              aria-live="polite"
              aria-label="Synchronisation Google Sheets"
            >
              <a className={styles.sheetLink} href={sheetUrl} target="_blank" rel="noreferrer">
                Ouvrir la feuille dans le navigateur
              </a>
              <span className={styles.sheetStatus}>
                {sheetUrlInvalid
                  ? 'URL incorrecte : utilisez le lien du déploiement « Application Web » finissant par /exec (Déployer > Gérer les déploiements).'
                  : sheetUi.status === 'loading'
                    ? sheetUi.message || 'Synchronisation…'
                    : sheetUi.status === 'error'
                      ? sheetUi.message
                      : sheetUi.status === 'ok'
                        ? sheetUi.message ||
                          'Feuille connectée — synchronisation automatique.'
                        : ''}
              </span>
              <div className={styles.sheetActions}>
                <button
                  type="button"
                  className={styles.sheetBtn}
                  onClick={actualiserDepuisFeuille}
                  disabled={sheetUrlInvalid}
                >
                  Actualiser depuis la feuille
                </button>
                <button
                  type="button"
                  className={styles.sheetBtn}
                  onClick={envoyerVersFeuille}
                  disabled={sheetUrlInvalid}
                >
                  Forcer l’envoi
                </button>
              </div>
            </div>
            {!sheetUrlInvalid ? (
              <p className={styles.sheetNote}>
                Une feuille <strong>toute vide</strong> est normale au début. Le bouton bleu écrit la ligne 1 (
                {SHEET_HEADERS.join(', ')}). Ensuite, enregistrez une affaire plus bas sur cette page : les
                lignes s’ajoutent dans la feuille automatiquement.
              </p>
            ) : null}
            {sheetConfigFromBrowser() ? (
              <p className={styles.sheetBrowserNote}>
                <button type="button" className={styles.sheetLinkBtn} onClick={handleClearSheetBrowserConfig}>
                  Effacer l’URL et le jeton de ce navigateur
                </button>
                <span className={styles.sheetBrowserHint}>
                  (pour les saisir à nouveau ou utiliser uniquement .env)
                </span>
              </p>
            ) : null}
          </>
        ) : (
          <>
            <form className={styles.sheetConfigForm} onSubmit={handleSaveSheetBrowserConfig}>
              <p className={styles.sheetConfigWebLead}>
                Travailler dans <strong>Google Sheets sur le web</strong> (le classeur dans le navigateur) est
                normal. Pour connecter <strong>cette application</strong>, il faut <strong>deux liens
                différents</strong> : celui du tableur (pour ouvrir la grille) et celui du <strong>déploiement
                Apps Script</strong> (<code className={styles.sheetCode}>script.google.com/macros/s/…/exec</code>
                ), copié dans l’onglet Apps Script — c’est <strong>ce second lien</strong> qui va dans le champ
                « Web App ».
              </p>
              <ol className={styles.sheetConfigSteps}>
                <li className={styles.sheetConfigStep}>
                  <strong>Dans Google Sheets</strong> (votre classeur, dans le navigateur) : menu{' '}
                  <strong>Extensions</strong> → <strong>Apps Script</strong> — un <strong>nouvel onglet</strong>{' '}
                  s’ouvre avec l’éditeur de script (vous restez connecté au même compte Google).
                </li>
                <li className={styles.sheetConfigStep}>
                  Collez le code de <code className={styles.sheetCode}>DispatchSync.gs</code>, enregistrez
                  (icône disquette). Définissez la constante <code className={styles.sheetCode}>SECRET</code>{' '}
                  (même valeur que le jeton ci-dessous).
                </li>
                <li className={styles.sheetConfigStep}>
                  <strong>Déployer</strong> → <strong>Gérer les déploiements</strong> (ou « Nouveau déploiement
                  ») → type <strong>Application Web</strong> → publiez. Copiez l’{' '}
                  <strong>URL du déploiement</strong> qui se termine par{' '}
                  <code className={styles.sheetCode}>/exec</code> — ce n’est <strong>pas</strong> l’adresse
                  du tableur (<code className={styles.sheetCode}>…/spreadsheets/…/edit</code>).
                </li>
              </ol>

              <div className={styles.sheetConfigSheetLinkBox}>
                <span className={styles.sheetConfigSheetLinkTitle}>Ouvrir le classeur dans le navigateur</span>
                <p className={styles.sheetConfigSheetLinkLead}>
                  C’est l’adresse de <strong>votre feuille dans le navigateur</strong> — ouvrez-la pour voir ou
                  modifier les lignes. <strong>Ne la collez pas</strong> dans le champ « Web App » : ce champ
                  attend le lien <strong>de l’autre onglet</strong> (Apps Script, finissant par{' '}
                  <code className={styles.sheetCode}>/exec</code>).
                </p>
                <a className={styles.sheetConfigSheetLink} href={sheetUrl} target="_blank" rel="noreferrer">
                  {sheetUrl}
                </a>
              </div>

              <label className={styles.sheetConfigLabel}>
                URL Web App uniquement (script.google.com/…/exec)
                <input
                  className={`${styles.sheetConfigInput} ${
                    sheetFormUrlTrim && !sheetFormUrlOk ? styles.sheetConfigInputInvalid : ''
                  }`}
                  type="url"
                  name="gasUrl"
                  autoComplete="off"
                  placeholder="https://script.google.com/macros/s/…/exec"
                  value={sheetFormUrl}
                  onChange={(e) => {
                    setSheetFormUrl(e.target.value)
                    if (sheetFormError) setSheetFormError('')
                  }}
                  aria-invalid={sheetFormUrlTrim ? !sheetFormUrlOk : undefined}
                />
              </label>
              {sheetFormUrlTrim && sheetFormUrlIsSpreadsheet ? (
                <p className={styles.sheetConfigInlineErr} role="status">
                  Adresse du <strong>tableur web</strong> détectée. Basculez sur l’<strong>onglet Apps Script</strong>{' '}
                  (ou rouvrez-le via <strong>Extensions → Apps Script</strong> depuis la feuille), puis{' '}
                  <strong>Déployer → Gérer les déploiements</strong> et copiez l’URL qui se termine par{' '}
                  <code className={styles.sheetCode}>/exec</code> (
                  <code className={styles.sheetCode}>script.google.com/macros/s/…/exec</code>).
                </p>
              ) : sheetFormUrlTrim && !sheetFormUrlOk ? (
                <p className={styles.sheetConfigInlineErr} role="status">
                  L’URL doit se terminer par <code className={styles.sheetCode}>/exec</code> (déploiement
                  Application Web, pas l’éditeur du script).
                </p>
              ) : (
                <p className={styles.sheetConfigFieldNote}>
                  Collez ici <strong>uniquement</strong> le lien copié depuis Apps Script : il commence par{' '}
                  <code className={styles.sheetCode}>https://script.google.com/macros/s/</code> et finit par{' '}
                  <code className={styles.sheetCode}>/exec</code>. Ce n’est <strong>pas</strong> l’adresse du
                  tableur (<code className={styles.sheetCode}>docs.google.com/spreadsheets/…</code>).
                </p>
              )}
              <label className={styles.sheetConfigLabel}>
                Jeton (identique à SECRET dans Apps Script)
                <input
                  className={styles.sheetConfigInput}
                  type="password"
                  name="gasToken"
                  autoComplete="off"
                  placeholder="Votre secret"
                  value={sheetFormToken}
                  onChange={(e) => {
                    setSheetFormToken(e.target.value)
                    if (sheetFormError) setSheetFormError('')
                  }}
                />
              </label>
              {sheetFormError ? (
                <p className={styles.sheetConfigError} role="alert">
                  {sheetFormError}
                </p>
              ) : null}
              <button
                type="submit"
                className={styles.sheetBtnHero}
                disabled={sheetFormSaveDisabled}
                title={
                  sheetFormSaveDisabled
                    ? 'Renseignez une URL Web App …/exec et le jeton pour activer l’enregistrement.'
                    : undefined
                }
              >
                Enregistrer et afficher le bouton « Créer les en-têtes »
              </button>
            </form>
            <p className={styles.sheetHint}>
              Le lien du classeur est aussi au-dessus du champ Web App. Alternative : variables{' '}
              <code className={styles.sheetCode}>VITE_GAS_DISPATCH_URL</code> et{' '}
              <code className={styles.sheetCode}>VITE_GAS_DISPATCH_TOKEN</code> dans{' '}
              <code className={styles.sheetCode}>.env.local</code> à la racine du projet (voir{' '}
              <code className={styles.sheetCode}>.env.example</code>), puis redémarrer{' '}
              <code className={styles.sheetCode}>npm run dev</code>.
            </p>
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="ctx-title">
        <h2 id="ctx-title" className={styles.h2}>
          Présence & nouvelle affaire
        </h2>

        <form className={styles.form} onSubmit={ajouterAffaire}>
          <div className={styles.presenceRow}>
            <label className={styles.fieldGrow}>
              <span className={styles.label}>Situation du jour</span>
              <select
                className={styles.select}
                value={presenceType}
                onChange={(e) => setPresenceType(e.target.value)}
              >
                {PRESENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {presenceType === 'absence' ? (
              <>
                <label className={styles.fieldGrow}>
                  <span className={styles.label}>Gestionnaire absent</span>
                  <select
                    className={styles.select}
                    value={gestionnaireAbsentId}
                    onChange={(e) => setGestionnaireAbsentId(e.target.value)}
                  >
                    {POOL_META.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nom}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.fieldGrow}>
                  <span className={styles.label}>Durée de l’absence</span>
                  <select
                    className={styles.select}
                    value={dureeAbsence}
                    onChange={(e) => setDureeAbsence(e.target.value)}
                  >
                    {DUREES_ABSENCE.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Numéro d’affaire</span>
              <input
                className={styles.input}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="ex. AFF-2026-0042"
                autoComplete="off"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Statut — injection</span>
              <select
                className={styles.select}
                value={statut}
                onChange={(e) => setStatut(e.target.value)}
              >
                {STATUTS_AFFAIRE.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {formError ? (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          ) : null}

          <button type="submit" className={styles.submit}>
            Enregistrer dans le tableau
          </button>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="table-title">
        <h2 id="table-title" className={styles.h2}>
          Tableau des affaires
        </h2>
        {canPushToSheet() ? (
          <p className={styles.tableEditHint}>
            N°, statut et gestionnaire sont modifiables ici : après ~1 s la feuille Google est mise à jour
            automatiquement (ou « Forcer l’envoi » en cas d’erreur). Si vous modifiez la grille directement dans
            Google Sheets, utilisez « Actualiser depuis la feuille » pour recharger les données dans l’app.
          </p>
        ) : null}
        {affaires.length === 0 ? (
          <p className={styles.empty}>Aucune ligne. Enregistrez une affaire ci-dessus.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">N° affaire</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Présence</th>
                  <th scope="col">Durée absence</th>
                  <th scope="col">Gestionnaire (tour)</th>
                  <th scope="col" className={styles.thAction}>
                    <span className={styles.srOnly}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {affaires.map((a) => (
                  <tr key={a.id}>
                    <td className={styles.cellMuted}>{formatDate(a.dateEnregistrement)}</td>
                    <td>
                      <input
                        className={styles.inputCell}
                        type="text"
                        value={a.numeroAffaire ?? ''}
                        onChange={(e) => updateAffaireRow(a.id, { numeroAffaire: e.target.value })}
                        aria-label={`Numéro d’affaire ${a.numeroAffaire}`}
                      />
                    </td>
                    <td>
                      <select
                        className={styles.selectCell}
                        value={
                          STATUTS_AFFAIRE.includes(a.statut)
                            ? a.statut
                            : STATUTS_AFFAIRE.includes(canonicalStatut(a.statut))
                              ? canonicalStatut(a.statut)
                              : STATUTS_AFFAIRE[0]
                        }
                        onChange={(e) => updateAffaireRow(a.id, { statut: e.target.value })}
                        aria-label={`Statut pour ${a.numeroAffaire}`}
                      >
                        {STATUTS_AFFAIRE.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={styles.cellSmall}>{a.presenceLabel}</td>
                    <td className={styles.cellMuted}>
                      {a.presenceType === 'absence' && a.dureeAbsence ? a.dureeAbsence : '—'}
                    </td>
                    <td>
                      <select
                        className={`${styles.selectCell} ${styles.selectCellAssign}`}
                        value={a.assignee || ''}
                        onChange={(e) => updateAffaireRow(a.id, { assignee: e.target.value })}
                        aria-label={`Gestionnaire (tour) pour ${a.numeroAffaire}`}
                      >
                        <option value="">—</option>
                        {a.assignee && !POOL_DISPATCH_IDS.includes(a.assignee) ? (
                          <option value={a.assignee}>
                            {nomGestionnaire(a.assignee)} (hors tour)
                          </option>
                        ) : null}
                        {POOL_META.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.nom}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={styles.tdAction}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => supprimer(a.id)}
                        aria-label={`Supprimer l’affaire ${a.numeroAffaire}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.sectionStats} aria-labelledby="stats-title">
        <h2 id="stats-title" className={styles.statsH2}>
          Statistiques
        </h2>
        <p className={styles.statsIntro}>
          Affaires et équivalent dossiers (pour injection = 2, injecté = 1), par gestionnaire. Mois et jour
          proposés par défaut : <strong>aujourd’hui</strong>. Ouvrez le calendrier pour changer de date.
        </p>
        {statsParJour.length === 0 ? (
          <p className={styles.empty}>
            Aucune donnée à agréger. Les statistiques apparaîtront après des enregistrements.
          </p>
        ) : (
          <>
            <div className={styles.statsToolbar}>
              <div className={styles.statsTabs} role="tablist" aria-label="Type de statistiques">
                <button
                  type="button"
                  role="tab"
                  aria-selected={statsMode === 'month'}
                  className={statsMode === 'month' ? styles.statsTabOn : styles.statsTab}
                  onClick={() => setStatsMode('month')}
                >
                  Par mois
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statsMode === 'day'}
                  className={statsMode === 'day' ? styles.statsTabOn : styles.statsTab}
                  onClick={() => setStatsMode('day')}
                >
                  Par jour
                </button>
              </div>

              {statsMode === 'month' ? (
                <div className={styles.statsToolbarRight}>
                  <div className={styles.statsCalWrap}>
                    <StatsDateTrigger
                      label={
                        overviewShowAllMonths
                          ? 'Tous les mois'
                          : monthLabelFromKey(overviewMonthKey)
                      }
                      open={overviewPickerOpen}
                      onClick={() => {
                        setOverviewCalMonth(overviewMonthKey)
                        setOverviewPickerOpen((o) => !o)
                      }}
                    />
                    <StatsCalendarPopover
                      open={overviewPickerOpen}
                      onClose={() => setOverviewPickerOpen(false)}
                      viewMonth={overviewCalMonth}
                      onViewMonthChange={setOverviewCalMonth}
                      selectedDayKey={todayDayKey()}
                      highlightSelectedDay={false}
                      onSelectDay={(key) => {
                        setOverviewMonthKey(key.slice(0, 7))
                        setOverviewShowAllMonths(false)
                        setOverviewPickerOpen(false)
                      }}
                      todayKey={todayDayKey()}
                      daysWithData={statsDaysWithData}
                      onPickToday={() => {
                        const t = todayDayKey()
                        setOverviewMonthKey(t.slice(0, 7))
                        setOverviewCalMonth(t.slice(0, 7))
                        setOverviewShowAllMonths(false)
                        setOverviewPickerOpen(false)
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.statsLinkBtn}
                    onClick={() => {
                      setOverviewShowAllMonths((v) => !v)
                      setOverviewPickerOpen(false)
                    }}
                  >
                    {overviewShowAllMonths ? 'Un mois seulement' : 'Tous les mois'}
                  </button>
                </div>
              ) : (
                <div className={styles.statsToolbarRight}>
                  <div className={styles.statsCalWrap}>
                    <StatsDateTrigger
                      label={dayLabelFromKey(statsDayKey)}
                      open={statsDayPickerOpen}
                      onClick={() => {
                        setStatsCalendarMonth(statsDayKey.slice(0, 7))
                        setStatsDayPickerOpen((o) => !o)
                      }}
                    />
                    <StatsCalendarPopover
                      open={statsDayPickerOpen}
                      onClose={() => setStatsDayPickerOpen(false)}
                      viewMonth={statsCalendarMonth}
                      onViewMonthChange={setStatsCalendarMonth}
                      selectedDayKey={statsDayKey}
                      onSelectDay={(key) => {
                        setStatsDayKey(key)
                        setStatsCalendarMonth(key.slice(0, 7))
                        setStatsFullMonth(false)
                      }}
                      todayKey={todayDayKey()}
                      daysWithData={statsDaysWithData}
                      onPickToday={() => {
                        const t = todayDayKey()
                        setStatsDayKey(t)
                        setStatsCalendarMonth(t.slice(0, 7))
                        setStatsFullMonth(false)
                        setStatsDayPickerOpen(false)
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.statsLinkBtn}
                    onClick={() => setStatsFullMonth((v) => !v)}
                  >
                    {statsFullMonth ? 'Une date' : 'Tout le mois'}
                  </button>
                </div>
              )}
            </div>

            {statsMode === 'month' ? (
              moisAffiches.length === 0 ? (
                <p className={styles.empty}>
                  Aucune affaire pour {monthLabelFromKey(overviewMonthKey)}. Choisissez un autre mois dans le
                  calendrier ou enregistrez des affaires.
                </p>
              ) : (
                <div className={styles.statsMonthList}>
                  {moisAffiches.map((mois) => (
                    <article key={mois.key} className={styles.statsMonthCard}>
                      <header className={styles.statsMonthCardHead}>
                        <h3 className={styles.statsMonthTitle}>{mois.label}</h3>
                        <div className={styles.statsMonthKpis}>
                          <span className={styles.statsKpi}>
                            <span className={styles.statsKpiVal}>{mois.totalCount}</span>
                            <span className={styles.statsKpiLbl}>affaires</span>
                          </span>
                          <span className={styles.statsKpi}>
                            <span className={styles.statsKpiVal}>éq. {mois.totalCharge}</span>
                            <span className={styles.statsKpiLbl}>dossiers</span>
                          </span>
                        </div>
                      </header>
                      <ul className={styles.statsMonthGrid}>
                        {POOL_META.map((g) => {
                          const c = mois.cells[g.id]
                          const z = c.count === 0
                          return (
                            <li key={g.id} className={styles.statsMonthCell}>
                              <span className={styles.statsMonthName}>{g.nom}</span>
                              {z ? (
                                <span className={styles.statDash}>—</span>
                              ) : (
                                <span className={styles.statsMonthNums}>
                                  <strong>{c.count}</strong>
                                  <span>aff.</span>
                                  <span className={styles.statsMonthDot}>·</span>
                                  <strong>éq. {c.charge}</strong>
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </article>
                  ))}
                </div>
              )
            ) : (
              <>
                {statsFullMonth && joursDuMoisChoisi.length === 0 ? (
                  <p className={styles.empty}>
                    Aucune affaire sur les jours enregistrés pour {monthLabelFromKey(statsDayKey.slice(0, 7))}.
                  </p>
                ) : (
                  <>
                    {statsFullMonth ? (
                      <div className={styles.statsMonthSummary} aria-label="Totaux du mois">
                        <span className={styles.statsMonthSummaryLabel}>{resumeMoisCourant.label}</span>
                        <span className={styles.statsMonthSummaryNums}>
                          <strong>{resumeMoisCourant.totalCount}</strong> aff. · éq.{' '}
                          <strong>{resumeMoisCourant.totalCharge}</strong>
                        </span>
                      </div>
                    ) : (
                      <p className={styles.statsDayHint}>
                        Mois {resumeMoisCourant.label} (jours avec données) :{' '}
                        <strong>{resumeMoisCourant.totalCount}</strong> aff. · éq.{' '}
                        <strong>{resumeMoisCourant.totalCharge}</strong>
                      </p>
                    )}
                    <div
                      className={
                        statsFullMonth ? styles.statsDayGrid : `${styles.statsDayGrid} ${styles.statsDayGridSingle}`
                      }
                    >
                      {joursAfficher.map((day) => (
                        <article key={day.key} className={styles.statsDayCard}>
                          <header className={styles.statsDayCardHead}>
                            <time dateTime={day.key} className={styles.statsDayTitle}>
                              {day.labelShort}
                            </time>
                            <div className={styles.statsDayTotals}>
                              <span className={styles.statsDayTotalMain}>{day.totalCount}</span>
                              <span className={styles.statsDayTotalSub}>aff. · éq. {day.totalCharge}</span>
                            </div>
                          </header>
                          <ul className={styles.statsDayList}>
                            {POOL_META.map((g) => {
                              const c = day.cells[g.id]
                              const z = c.count === 0
                              return (
                                <li key={g.id} className={styles.statsDayRow}>
                                  <span className={styles.statsDayName}>{g.nom}</span>
                                  {z ? (
                                    <span className={styles.statDash}>—</span>
                                  ) : (
                                    <span className={styles.statsDayVals}>
                                      <span className={styles.statsDayCount}>{c.count}</span>
                                      <span className={styles.statsDayEq}>éq. {c.charge}</span>
                                    </span>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="synth-title">
        <h2 id="synth-title" className={styles.h2}>
          Synthèse par gestionnaire
        </h2>
        <p className={styles.synthHint}>
          La charge utilisée pour l’assignation : « Pour injection » = 2, « Injecté » = 1.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Gestionnaire</th>
                <th scope="col" className={styles.thNum}>
                  Nb affaires
                </th>
                <th scope="col" className={styles.thNum}>
                  Charge (équiv. dossiers)
                </th>
              </tr>
            </thead>
            <tbody>
              {POOL_META.map((g) => {
                const rows = affaires.filter((x) => x.assignee === g.id)
                const charge = rows.reduce((s, x) => s + poidsAffaire(x), 0)
                return (
                  <tr key={g.id}>
                    <td>{g.nom}</td>
                    <td className={styles.thNum}>{rows.length}</td>
                    <td className={styles.thNum}>{charge}</td>
                  </tr>
                )
              })}
              <tr className={styles.rowNote}>
                <td colSpan={3}>
                  Badiaa : télétravail — pas d’assignation entrante dans ce dispatch.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
