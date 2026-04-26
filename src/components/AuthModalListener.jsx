import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Ouvre le modal de connexion lorsque la navigation arrive avec state.openAuthModal
 * (ex. accès à une route protégée sans session).
 */
export function AuthModalListener() {
  const location = useLocation()
  const navigate = useNavigate()
  const { openLoginModal } = useAuth()
  const handled = useRef(false)

  useEffect(() => {
    if (!location.state?.openAuthModal) {
      handled.current = false
      return
    }
    if (handled.current) return
    handled.current = true
    openLoginModal()
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate, openLoginModal])

  return null
}
