import { AppShell } from '../components/AppShell'
import { RelancesForm } from '../components/RelancesForm'

export function Relances() {
  return (
    <AppShell
      title="Relances"
      subtitle="Suivez les relances clients et internes, les réserves et les échéances afin de limiter les impayés et d’accélérer la clôture des dossiers."
    >
      <RelancesForm />
    </AppShell>
  )
}
