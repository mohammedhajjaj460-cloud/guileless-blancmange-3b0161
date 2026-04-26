import { AppShell } from '../components/AppShell'
import { DossiersDispatchView } from '../components/DossiersDispatchView'

export function Dossiers() {
  return (
    <AppShell
      title="Dossiers Dispatch"
      subtitle="Gestion des cinq gestionnaires, absences, télétravail Badiaa et calcul automatique de la répartition des dossiers injectés."
    >
      <DossiersDispatchView />
    </AppShell>
  )
}
