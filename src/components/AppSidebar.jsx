import { NavLink, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  BellRing,
  Archive,
  Home,
  LogOut,
  Clock,
  FileSpreadsheet,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import styles from './AppSidebar.module.css'

const MAIN_NAV = [
  { to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  {
    to: '/dossiers',
    label: 'Dossiers Dispatch',
    icon: FolderKanban,
    matchPaths: ['/dossiers', '/dispatch'],
  },
  { to: '/saisie-dossier', label: 'Traitement dispatch', icon: FileSpreadsheet },
  { to: '/relances', label: 'Relances', icon: BellRing },
  { to: '/archives', label: 'Archives', icon: Archive },
]

function initialsFromEmail(email) {
  const local = String(email || '').split('@')[0] || ''
  const cleaned = local.replace(/[^a-zA-Z0-9]/g, '')
  if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase()
  if (local.length >= 2) return local.slice(0, 2).toUpperCase()
  return local.slice(0, 1).toUpperCase() || '?'
}

export function AppSidebar({ onNavigate }) {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const email = user?.email ?? ''
  const expiresAt = user?.expiresAt

  const sessionShort =
    typeof expiresAt === 'number'
      ? new Date(expiresAt).toLocaleString('fr-FR', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—'

  function handleNav() {
    onNavigate?.()
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.brand}>
        <Link to="/dashboard" className={styles.brandLink} onClick={handleNav}>
          <img
            src="/sofac-logo.png"
            alt="SOFAC"
            className={styles.logo}
            width={160}
            height={40}
          />
        </Link>
        <p className={styles.brandTag}>Portail interne</p>
      </div>

      <nav className={styles.nav} aria-label="Navigation application">
        <ul className={styles.navList}>
          {MAIN_NAV.map(({ to, label, icon: Icon, end, matchPaths }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => {
                  const active = matchPaths ? matchPaths.includes(pathname) : isActive
                  return active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                }}
                onClick={handleNav}
              >
                <Icon className={styles.navIcon} size={20} strokeWidth={1.75} aria-hidden />
                <span className={matchPaths ? styles.navLabelWide : undefined}>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.sidebarFooter}>
        <Link to="/" className={styles.publicLink} onClick={handleNav}>
          <Home size={18} strokeWidth={2} aria-hidden />
          <span>Accueil site public</span>
        </Link>

        <div className={styles.profile}>
          <div className={styles.avatar} aria-hidden>
            {initialsFromEmail(email)}
          </div>
          <div className={styles.profileInfo}>
            <p className={styles.profileEmail} title={email}>
              {email || '—'}
            </p>
            <p className={styles.session}>
              <Clock size={12} strokeWidth={2} aria-hidden />
              Session jusqu’au {sessionShort}
            </p>
          </div>
        </div>

        <button type="button" className={styles.logout} onClick={() => logout()}>
          <LogOut size={18} strokeWidth={2} aria-hidden />
          Déconnexion
        </button>
      </div>
    </div>
  )
}
