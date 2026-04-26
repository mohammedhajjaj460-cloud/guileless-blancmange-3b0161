import styles from './Footer.module.css'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className={styles.footer}>
      <div className={styles.accentBar} aria-hidden />
      <div className={styles.inner}>
        <div className={styles.brandBlock}>
          <span className={styles.name}>SOFAC</span>
          <p className={styles.tagline}>Application interne de gestion</p>
        </div>
        <div className={styles.meta}>
          <p className={styles.copy}>© {year} SOFAC. Tous droits réservés.</p>
          <p className={styles.credit}>
            Réalisation : <span className={styles.creditName}>Hajjaj Mohammed</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
