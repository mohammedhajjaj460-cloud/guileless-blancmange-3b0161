import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import styles from './AuthModal.module.css'

export function AuthModal() {
  const titleId = useId()
  const navigate = useNavigate()
  const { loginModalOpen, closeLoginModal, login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!loginModalOpen) {
      wasOpenRef.current = false
      return
    }

    const justOpened = !wasOpenRef.current
    wasOpenRef.current = true

    if (justOpened) {
      setEmail('')
      setPassword('')
      setError('')
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && closeLoginModal()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [loginModalOpen, closeLoginModal])

  if (!loginModalOpen) return null

  function handleOverlayClick() {
    closeLoginModal()
  }

  function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()
    if (!trimmedEmail || !trimmedPassword) {
      setError('Veuillez renseigner l’e-mail et le mot de passe.')
      return
    }

    const result = login(trimmedEmail, trimmedPassword)
    if (result.ok) {
      closeLoginModal()
      navigate('/dashboard', { replace: true })
    } else {
      setError('Authentification erronée ou non valide. Vérifiez votre e-mail et votre mot de passe.')
    }
  }

  return (
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Fermer la fenêtre de connexion"
        onClick={handleOverlayClick}
      />

      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.close}
          aria-label="Fermer"
          onClick={closeLoginModal}
        >
          <X size={22} strokeWidth={2} />
        </button>

        <div className={styles.header}>
          <img
            src="/sofac-logo.png"
            alt="SOFAC"
            className={styles.logo}
            width={220}
            height={52}
          />
          <h2 id={titleId} className={styles.title}>
            Connexion à l’application
          </h2>
          <p className={styles.subtitle}>
            Saisissez votre e-mail et votre mot de passe pour accéder au tableau de bord.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>E-mail</span>
            <input
              className={styles.input}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="nom@exemple.com"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Mot de passe</span>
            <input
              className={styles.input}
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className={styles.submit}>
            Se connecter
          </button>
        </form>
      </div>
    </div>
  )
}
