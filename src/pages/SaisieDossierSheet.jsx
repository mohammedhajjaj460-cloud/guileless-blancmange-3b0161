import { AppShell } from '../components/AppShell'
import { DossierSheetForm } from '../components/DossierSheetForm'

export function SaisieDossierSheet() {
  return (
    <AppShell
      title="Traitement dispatch"
      subtitle="Saisie des dossiers et envoi vers Google Sheets — attribution équilibrée automatique."
    >
      <DossierSheetForm />
    </AppShell>
  )
}
