import { AppShell } from '../components/AppShell'
import { DossiersDispatchView } from '../components/DossiersDispatchView'

export function Dispatch() {
  return (
    <AppShell
      title="Dossiers Dispatch"
      subtitle="Même espace que Dossiers : vue dispatch, absences et répartition des dossiers injectés."
    >
      <DossiersDispatchView />
    </AppShell>
  )
}
