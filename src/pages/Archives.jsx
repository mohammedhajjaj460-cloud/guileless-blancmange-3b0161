import { AppShell } from '../components/AppShell'
import { WorkspacePlaceholder } from '../components/WorkspacePlaceholder'

export function Archives() {
  return (
    <AppShell
      title="Archives"
      subtitle="Accédez aux dossiers archivés, à l’historique des décisions et aux exports nécessaires aux contrôles internes ou réglementaires."
    >
      <WorkspacePlaceholder label="Recherche et consultation d’archives" />
    </AppShell>
  )
}
