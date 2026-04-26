import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import styles from './Navbar.module.css'

const NAV_ITEMS = [
  { to: '/', label: 'Accueil', end: true },
  { to: '/dossiers', label: 'Dossiers Dispatch', matchPaths: ['/dossiers', '/dispatch'] },
  { to: '/relances', label: 'Relances' },
  { to: '/archives', label: 'Archives' },
]

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const { isAuthenticated, logout, openLoginModal } = useAuth()

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand} aria-label="SOFAC — Accueil">
          <img
            src="/sofac-logo.png"
            alt="SOFAC — Dites oui au super crédit"
            className={styles.logoImg}
            width={200}
            height={48}
          />
        </Link>

        <nav className={styles.nav} aria-label="Navigation principale">
          <ul className={styles.links}>
            {NAV_ITEMS.map(({ to, label, end, matchPaths }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) => {
                    const active = matchPaths ? matchPaths.includes(pathname) : isActive
                    return active ? `${styles.link} ${styles.linkActive}` : styles.link
                  }}
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className={styles.ctaSecondary}>
                Continuer
              </Link>
              <button type="button" className={styles.logout} onClick={() => logout()}>
                Déconnexion
              </button>
            </>
          ) : (
            <button type="button" className={styles.cta} onClick={openLoginModal}>
              Accéder à l’application
            </button>
          )}
          <button
            type="button"
            className={styles.menuBtn}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        className={`${styles.mobileOverlay} ${menuOpen ? styles.mobileOpen : ''}`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
        role="presentation"
      >
        <ul className={styles.mobileLinks} onClick={(e) => e.stopPropagation()}>
          {NAV_ITEMS.map(({ to, label, end, matchPaths }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => {
                  const active = matchPaths ? matchPaths.includes(pathname) : isActive
                  return active
                    ? `${styles.mobileLink} ${styles.mobileLinkActive}`
                    : styles.mobileLink
                }}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </NavLink>
            </li>
          ))}
          <li>
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className={styles.mobileCta} onClick={() => setMenuOpen(false)}>
                  Continuer
                </Link>
                <button
                  type="button"
                  className={styles.mobileLogout}
                  onClick={() => {
                    logout()
                    setMenuOpen(false)
                  }}
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.mobileCta}
                onClick={() => {
                  openLoginModal()
                  setMenuOpen(false)
                }}
              >
                Accéder à l’application
              </button>
            )}
          </li>
        </ul>
      </div>
    </header>
  )
}
