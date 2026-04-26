import { Navbar } from './Navbar'
import { Footer } from './Footer'
import styles from './Layout.module.css'

export function Layout({ children, variant = 'default' }) {
  return (
    <div className={styles.shell}>
      <Navbar />
      <main
        className={variant === 'home' ? styles.mainHome : styles.main}
        id="main-content"
      >
        {children}
      </main>
      <Footer />
    </div>
  )
}
