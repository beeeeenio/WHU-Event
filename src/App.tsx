import { useEffect, useState } from 'react';
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

// Jeder Techie einer WHU-Initiative (forumWHU, Campus for Finance, ...) ist gleichzeitig Teil
// von WHU Event — das Tool wird deshalb von mehreren Initiativen genutzt, mit je eigener CI,
// während "WHU Event" als das eigentlich verantwortliche Team immer sichtbar bleibt.
type CiId = 'forumwhu' | 'cff';
const CI_STORAGE_KEY = 'nivtec-ci';
const CIS: Array<{ id: CiId; label: string }> = [
  { id: 'forumwhu', label: 'forum WHU' },
  { id: 'cff', label: 'Campus for Finance' },
];

/** Logo-Grafik je CI — wird direkt IN den Umschalt-Buttons gezeigt statt danebenstehendem Text. */
function CiLogo({ id, activeCi }: { id: CiId; activeCi: CiId }) {
  if (id === 'forumwhu') {
    // Der Button sitzt auf der Header-Fläche, die sich mit der AKTIVEN CI ändert — bei aktivem
    // CFF ist das immer Deep Navy (siehe CFF-CSS, kein System-Light/Dark mehr), also IMMER die
    // weiße Variante, unabhängig vom System-Modus. Ist forumWHU selbst aktiv, gilt weiterhin
    // dessen eigener System-Light/Dark-Wechsel (die ursprüngliche .brand-logo-*-Logik).
    if (activeCi === 'cff') {
      return <img src="/brand/forumwhu-mark-white.png" alt="forum WHU" className="h-6 w-auto" />;
    }
    return (
      <>
        <img src="/brand/forumwhu-mark.png" alt="forum WHU" className="brand-logo-light h-6 w-auto" />
        <img src="/brand/forumwhu-mark-white.png" alt="forum WHU" className="brand-logo-dark h-6 w-auto" />
      </>
    );
  }
  // CFF-Logodatei ist nur als weiße Version vorhanden — laut Guidelines exakt für den Fall
  // gedacht ("weißes Wortmarke + 4-farbige Bögen auf der Markenfarbe — PRIMARY rendition"),
  // deshalb hier bewusst IMMER auf einem eigenen Deep-Navy-Chip statt direkt auf der
  // Seitenfläche — so stimmt der Kontrast unabhängig vom Light/Dark-Modus dieser App.
  return (
    <span className="inline-flex items-center rounded px-2 py-1" style={{ backgroundColor: '#0C0734' }}>
      <img src="/brand/cff-main-white.svg" alt="Campus for Finance" className="h-3.5 w-auto" />
    </span>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('buehne');
  const [ci, setCi] = useState<CiId>(() => {
    const saved = localStorage.getItem(CI_STORAGE_KEY);
    return saved === 'cff' ? 'cff' : 'forumwhu';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-ci', ci);
    localStorage.setItem(CI_STORAGE_KEY, ci);
  }, [ci]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              WHU Event
            </span>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">NivTec Planungstool</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Bühne &amp; Tresen aus modularen Systemplatten planen — leerer Plan, Stücke per Drag &amp; Drop, Füße
              und Materialliste automatisch berechnet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {CIS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCi(c.id)}
                aria-pressed={ci === c.id}
                title={c.label}
                aria-label={c.label}
                className={`flex items-center rounded-md border-2 px-2 py-1.5 transition-opacity ${
                  ci === c.id
                    ? 'border-[var(--color-accent)] opacity-100'
                    : 'border-transparent opacity-40 hover:opacity-70'
                }`}
              >
                <CiLogo id={c.id} activeCi={ci} />
              </button>
            ))}
          </div>
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
