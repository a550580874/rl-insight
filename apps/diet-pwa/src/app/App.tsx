import { useState } from 'react';
import { BottomNav, type PageKey } from './components/BottomNav';
import { Button, Card } from './components/ui';
import { FoodsPage } from './pages/FoodsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import { useApp } from './state/AppContext';

const PAGE_TITLES: Record<PageKey, string> = {
  today: '今日饮食',
  foods: '食物库',
  history: '历史记录',
  settings: '设置',
};

export function App() {
  const { status, fatalError, toast, settings } = useApp();
  const [page, setPage] = useState<PageKey>('today');

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-xs text-slate-400">
        正在加载…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <Card>
          <p className="text-sm text-slate-700">加载失败</p>
          <p className="mt-1 text-xs text-slate-500">{fatalError}</p>
          <Button className="mt-3" variant="primary" onClick={() => window.location.reload()}>
            重新加载
          </Button>
        </Card>
      </div>
    );
  }

  if (!settings) {
    return <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-xs text-slate-400">正在加载…</div>;
  }

  return (
    <div className="min-h-dvh bg-slate-100 pb-24">
      <header className="safe-top sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 pb-2 backdrop-blur">
        <h1 className="text-base font-semibold text-slate-800">{PAGE_TITLES[page]}</h1>
      </header>

      <main className="mx-auto max-w-md pt-3">
        {page === 'today' ? <TodayPage /> : null}
        {page === 'foods' ? <FoodsPage /> : null}
        {page === 'history' ? <HistoryPage /> : null}
        {page === 'settings' ? <SettingsPage /> : null}
      </main>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <span className="rounded-full bg-slate-800/90 px-4 py-2 text-xs text-white shadow-lg">{toast}</span>
        </div>
      ) : null}

      <BottomNav page={page} onChange={setPage} />
    </div>
  );
}
