import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { resolveAuthenticatedEmail } from '../auth/allowedAccounts'
import {
  AUTH_STORAGE_KEY,
  createSessionPayload,
  parseValidSession,
} from '../auth/session'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      const session = parseValidSession(raw)
      if (session) {
        setUser({
          email: session.email,
          token: session.token,
          expiresAt: session.expiresAt,
        })
      } else if (raw) {
        localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    } finally {
      setReady(true)
    }
  }, [])

  const openLoginModal = useCallback(() => setLoginModalOpen(true), [])
  const closeLoginModal = useCallback(() => setLoginModalOpen(false), [])

  const login = useCallback((email, password) => {
    const canonicalEmail = resolveAuthenticatedEmail(email, password)
    if (!canonicalEmail) return { ok: false }

    const payload = createSessionPayload(canonicalEmail)
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload))
    setUser({
      email: payload.email,
      token: payload.token,
      expiresAt: payload.expiresAt,
    })
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setUser(null)
    setLoginModalOpen(false)
  }, [])

  useEffect(() => {
    if (!user?.expiresAt) return
    const check = () => {
      if (Date.now() > user.expiresAt) logout()
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [user?.expiresAt, logout])

  const value = useMemo(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user),
      loginModalOpen,
      openLoginModal,
      closeLoginModal,
      login,
      logout,
    }),
    [user, ready, loginModalOpen, login, logout, openLoginModal, closeLoginModal],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
