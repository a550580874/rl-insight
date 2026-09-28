/** Small, dependency-free UI primitives shared by every page. */

import { useEffect, type ChangeEvent, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-600 text-white active:bg-emerald-700 disabled:bg-emerald-300',
  secondary: 'bg-white text-slate-700 border border-slate-200 active:bg-slate-100 disabled:text-slate-400',
  ghost: 'bg-transparent text-emerald-700 active:bg-emerald-50 disabled:text-slate-400',
  danger: 'bg-white text-red-600 border border-red-200 active:bg-red-50 disabled:text-red-300',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
};

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  type = 'button',
  className = '',
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1 rounded-xl font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 ${className}`}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-500">{children}</h2>
      {action}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  step = 1,
  min,
  max,
  suffix,
  className = '',
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value);
    onChange(Number.isFinite(parsed) ? parsed : 0);
  };

  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label ? <span className="text-xs text-slate-500">{label}</span> : null}
      <span className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 focus-within:border-emerald-400">
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={handleChange}
          onBlur={onBlur}
          className="w-full min-w-0 bg-transparent text-right text-sm font-medium tabular-nums outline-none"
        />
        {suffix ? <span className="shrink-0 text-xs text-slate-400">{suffix}</span> : null}
      </span>
    </label>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex rounded-xl bg-slate-100 p-0.5 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-[10px] px-2 py-1.5 text-xs font-medium transition-colors ${
            value === option.value ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export function ProgressBar({
  label,
  actual,
  target,
  unit,
  tone,
}: {
  label: string;
  actual: number;
  target: number;
  unit: string;
  tone: string;
}) {
  const ratio = target > 0 ? actual / target : 0;
  const width = Math.min(ratio * 100, 100);
  const over = ratio > 1.02;
  const remaining = Math.round((target - actual) * 10) / 10;

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="tabular-nums text-slate-500">
          <span className={over ? 'font-semibold text-amber-600' : 'font-semibold text-slate-700'}>
            {Math.round(actual)}
          </span>
          {' / '}
          {Math.round(target)} {unit}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
        剩余 {remaining} {unit}
      </div>
    </div>
  );
}

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-slate-900/40" onClick={onClose}>
      <div
        className="safe-bottom flex max-h-[85dvh] flex-col rounded-t-3xl bg-white"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} ariaLabel="关闭">
            关闭
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-slate-400">{children}</p>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" />
      <span className="text-xs">{label}</span>
    </div>
  );
}
