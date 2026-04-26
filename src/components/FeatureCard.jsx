import styles from './FeatureCard.module.css'

export function FeatureCard({ icon: Icon, title, description }) {
  return (
    <article className={styles.card}>
      <div className={styles.iconWrap} aria-hidden>
        {Icon ? <Icon className={styles.icon} strokeWidth={1.75} size={26} /> : null}
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
    </article>
  )
}
