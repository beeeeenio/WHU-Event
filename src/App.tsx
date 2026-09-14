import { useState } from 'react';
import { KastenbuehneConfigurator } from './modules/kastenbuehne/KastenbuehneConfigurator';
import { TresenConfigurator } from './modules/tresen/TresenConfigurator';

// Tisch/Tribüne (und die alte reglerbasierte Bühne) sind bewusst aus der App entfernt,
// aber nicht gelöscht — die Dateien liegen weiter unter src/modules/{tisch,tribuene,buehne}/,
// falls sie später wieder gebraucht werden.
type TabId = 'buehne' | 'tresen';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'buehne', label: 'Bühne' },
  { id: 'tresen', label: 'Tresen / Theken' },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('buehne');

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">NivTec Planungstool</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Bühne &amp; Tresen aus modularen Systemplatten planen — leerer Plan, Stücke per Drag &amp; Drop, Füße
            und Materialliste automatisch berechnet.
          </p>
        </div>
      </header>

      <nav className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-4xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'buehne' && <KastenbuehneConfigurator />}
        {activeTab === 'tresen' && <TresenConfigurator />}
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-6 text-xs text-[var(--color-text-muted)]">
        Privates Lernprojekt, inspiriert vom NivTec-Systempodest-Konzept. Alle Maße/Regeln sind recherchierte bzw.
        plausible Annahmen ohne Gewähr — keine offiziellen NivTec-Preise oder Artikelnummern.
      </footer>
    </div>
  );
}

export default App;
