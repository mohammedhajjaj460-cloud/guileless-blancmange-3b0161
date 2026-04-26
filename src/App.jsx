import { Routes, Route, Navigate } from 'react-router-dom'
import { Home } from './pages/Home'
import { Dashboard } from './pages/Dashboard'
import { Dossiers } from './pages/Dossiers'
import { Dispatch } from './pages/Dispatch'
import { Relances } from './pages/Relances'
import { Archives } from './pages/Archives'
import { SaisieDossierSheet } from './pages/SaisieDossierSheet'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthModal } from './components/AuthModal'
import { AuthModalListener } from './components/AuthModalListener'

export default function App() {
  return (
    <>
      <AuthModalListener />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/connexion" element={<Navigate to="/" replace />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dossiers"
          element={
            <ProtectedRoute>
              <Dossiers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatch"
          element={
            <ProtectedRoute>
              <Dispatch />
            </ProtectedRoute>
          }
        />
        <Route
          path="/relances"
          element={
            <ProtectedRoute>
              <Relances />
            </ProtectedRoute>
          }
        />
        <Route
          path="/archives"
          element={
            <ProtectedRoute>
              <Archives />
            </ProtectedRoute>
          }
        />
        <Route
          path="/saisie-dossier"
          element={
            <ProtectedRoute>
              <SaisieDossierSheet />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AuthModal />
    </>
  )
}
