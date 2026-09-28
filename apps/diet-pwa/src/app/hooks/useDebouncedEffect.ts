/** Runs an effect after the given dependencies stop changing for `delayMs`. */

import { useEffect, useRef } from 'react';

export function useDebouncedEffect(
  effect: () => void,
  deps: readonly unknown[],
  delayMs: number,
  enabled = true,
): void {
  const latest = useRef(effect);
  useEffect(() => {
    latest.current = effect;
  });

  const signature = JSON.stringify(deps);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => latest.current(), delayMs);
    return () => clearTimeout(timer);
  }, [signature, delayMs, enabled]);
}
