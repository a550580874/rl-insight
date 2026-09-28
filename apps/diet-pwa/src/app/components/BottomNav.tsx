export type PageKey = 'today' | 'foods' | 'history' | 'settings';

const TABS: ReadonlyArray<{ key: PageKey; label: string; path: string }> = [
  { key: 'today', label: '首页', path: 'M3 10.6 12 3.2l9 7.4V20a1 1 0 0 1-1 1h-5.2v-6.2H9.2V21H4a1 1 0 0 1-1-1z' },
  { key: 'foods', label: '食物', path: 'M4.5 11h15a7.5 7.5 0 0 1-15 0zM9 7.5c0-1.2 1.2-1.6 1.2-2.6M13 7.5c0-1.2 1.2-1.6 1.2-2.6' },
  { key: 'history', label: '历史', path: 'M4 20V11M9.5 20V5M15 20v-6.5M20 20V8' },
  { key: 'settings', label: '设置', path: 'M5 7h14M5 12h14M5 17h14M9 5.5v3M15 10.5v3M8 15.5v3' },
];

export function BottomNav({ page, onChange }: { page: PageKey; onChange: (page: PageKey) => void }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = tab.key === page;
          return (
            <li key={tab.key} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(tab.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-1 py-2 text-[11px] ${
                  active ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  <path d={tab.path} />
                </svg>
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
