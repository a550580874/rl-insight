import { useState, type FormEvent } from 'react';
import { Button, Card } from '../components/ui';

export function LockPage({
  pinConfigured,
  error,
  onUnlock,
}: {
  pinConfigured: boolean;
  error: string | null;
  onUnlock: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || pin.length < 4) return;
    setBusy(true);
    try {
      await onUnlock(pin);
    } catch {
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="safe-top flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-emerald-50 to-slate-100 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl text-white">
            🍚
          </div>
          <h1 className="text-lg font-semibold text-slate-800">个人饮食管理</h1>
          <p className="mt-1 text-xs text-slate-500">
            {pinConfigured ? '请输入 PIN 解锁' : '首次使用，请设置 4-8 位数字 PIN'}
          </p>
        </div>

        <Card>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="\d*"
              maxLength={8}
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="••••"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-2xl tracking-[0.6em] tabular-nums outline-none focus:border-emerald-400"
            />

            {error ? <p className="text-center text-xs text-red-500">{error}</p> : null}

            <Button type="submit" variant="primary" disabled={busy || pin.length < 4}>
              {busy ? '验证中…' : pinConfigured ? '解锁' : '设置并进入'}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
          PIN 只以 PBKDF2 哈希形式保存在 D1，登录状态使用 HttpOnly Cookie 保持 30 天。
        </p>
      </div>
    </div>
  );
}
