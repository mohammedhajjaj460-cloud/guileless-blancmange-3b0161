import styles from './WorkspacePlaceholder.module.css'

export function WorkspacePlaceholder({ label }) {
  return (
    <section className={styles.wrap} aria-label={label || 'Zone de contenu à venir'}>
      <div className={styles.inner}>
        <p className={styles.title}>{label || 'Espace de travail'}</p>
        <p className={styles.hint}>
          Cette zone accueillera prochainement les tableaux de données, filtres, formulaires et
          actions métier associés à ce module.
        </p>
        <div className={styles.mock} role="presentation">
          <div className={styles.mockRow} />
          <div className={styles.mockRow} />
          <div className={styles.mockRow} />
          <div className={styles.mockRow} />
        </div>
      </div>
    </section>
  )
}
