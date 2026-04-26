import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './ProtectedRoute.module.css'

export function ProtectedRoute({ children }) {
  const { isAuthenticated, ready } = useAuth()

  if (!ready) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden />
        Chargement…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ openAuthModal: true }} />
  }

  return children
}
