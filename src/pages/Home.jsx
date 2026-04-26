import { useAuth } from '../context/AuthContext'
import {
  FolderKanban,
  GitBranch,
  BellRing,
  Archive,
  Clock,
  LayoutDashboard,
  Radio,
  ShieldCheck,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { FeatureCard } from '../components/FeatureCard'
import styles from './Home.module.css'

const FEATURES = [
  {
    icon: FolderKanban,
    title: 'Gestion des dossiers',
    description:
      'Centralisez l’ensemble du cycle de vie des dossiers : statuts, pièces, affectations et historique des actions.',
  },
  {
    icon: GitBranch,
    title: 'Dispatch intelligent',
    description:
      'Répartissez les tâches selon la charge, les compétences et les priorités pour fluidifier le traitement opérationnel.',
  },
  {
    icon: BellRing,
    title: 'Relances et réserves',
    description:
      'Pilotez les relances, les réserves et les échéances avec des indicateurs clairs et des workflows cohérents.',
  },
  {
    icon: Archive,
    title: 'Archivage et suivi',
    description:
      'Sécurisez l’archivage et conservez une traçabilité complète pour les contrôles et les audits internes.',
  },
]

const BENEFITS = [
  {
    icon: Clock,
    text: 'Gain de temps sur le traitement quotidien et la recherche d’information.',
  },
  {
    icon: LayoutDashboard,
    text: 'Meilleure organisation des équipes et des priorités métier.',
  },
  {
    icon: Radio,
    text: 'Suivi en temps réel de l’avancement et des indicateurs clés.',
  },
  {
    icon: ShieldCheck,
    text: 'Réduction des erreurs grâce à des processus standardisés et tracés.',
  },
]

export function Home() {
  const { openLoginModal } = useAuth()

  return (
    <Layout variant="home">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Plateforme interne SOFAC</p>
            <h1 id="hero-title" className={styles.heroTitle}>
              Système de gestion des dossiers et dispatch intelligent
            </h1>
            <p className={styles.heroSubtitle}>
              Une solution professionnelle pour centraliser, suivre et optimiser le traitement des
              dossiers, la répartition des tâches, les relances et l’archivage.
            </p>
            <div className={styles.heroActions}>
              <button type="button" className={styles.btnPrimary} onClick={openLoginModal}>
                Accéder à l’application
              </button>
              <a href="#fonctionnalites" className={styles.btnSecondary}>
                Voir les fonctionnalités
              </a>
            </div>
          </div>
          <div className={styles.heroPanel} aria-hidden>
            <div className={styles.panelCard}>
              <span className={styles.panelLabel}>Vue d’ensemble</span>
              <ul className={styles.panelList}>
                <li>Dossiers actifs</li>
                <li>Files d’attente dispatch</li>
                <li>Relances en cours</li>
                <li>Archives consultables</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="fonctionnalites" aria-labelledby="features-title">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHead}>
            <h2 id="features-title" className={styles.sectionTitle}>
              Fonctionnalités principales
            </h2>
            <p className={styles.sectionLead}>
              Des modules pensés pour les équipes internes : clarté, efficacité et conformité des
              processus.
            </p>
          </div>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.benefitsSection}`} aria-labelledby="benefits-title">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHead}>
            <h2 id="benefits-title" className={styles.sectionTitle}>
              Pourquoi utiliser cette application
            </h2>
            <p className={styles.sectionLead}>
              Une expérience unifiée pour accélérer le travail collaboratif et renforcer la qualité
              du service.
            </p>
          </div>
          <ul className={styles.benefitList}>
            {BENEFITS.map(({ icon: BenefitIcon, text }) => (
              <li key={text} className={styles.benefitItem}>
                <span className={styles.benefitIcon}>
                  <BenefitIcon size={22} strokeWidth={1.75} />
                </span>
                <span className={styles.benefitText}>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Layout>
  )
}
