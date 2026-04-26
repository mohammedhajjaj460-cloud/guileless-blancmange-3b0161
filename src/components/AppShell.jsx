import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { AppSidebar } from './AppSidebar'
import styles from './AppShell.module.css'

export function AppShell({ children, title, subtitle }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!sidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sidebarOpen])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      if (mq.matches) setSidebarOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function closeSidebar() {
    setSidebarOpen(false)
  }

  return (
    <div className={styles.shell}>
      <div
        className={`${styles.overlay} ${sidebarOpen ? styles.overlayVisible : ''}`}
        aria-hidden={!sidebarOpen}
        onClick={closeSidebar}
      />

      <aside
        id="app-sidebar"
        className={`${styles.aside} ${sidebarOpen ? styles.asideOpen : ''}`}
        aria-label="Menu latéral"
      >
        <AppSidebar onNavigate={closeSidebar} />
      </aside>

      <div className={styles.column}>
        <header className={styles.topBar}>
          <button
            type="button"
            className={styles.menuBtn}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          {title ? (
            <h1 className={styles.pageTitle}>{title}</h1>
          ) : (
            <span className={styles.pageTitlePlaceholder} />
          )}
        </header>

        <main className={styles.main} id="main-content">
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          {children}
        </main>

        <footer className={styles.footer}>
          <span>SOFAC</span>
          <span className={styles.footerSep}>·</span>
          <span>Application interne</span>
        </footer>
      </div>
    </div>
  )
}
