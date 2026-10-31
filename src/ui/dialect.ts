import { useSyncExternalStore } from 'react';
import type { Dialect } from '../plc/dialects';

// Site-wide vendor choice, remembered per browser.
const KEY = 'plc-dialect';
let current: Dialect = read();
const listeners = new Set<() => void>();

function read(): Dialect {
  try {
    return localStorage.getItem(KEY) === 'siemens' ? 'siemens' : 'ab';
  } catch {
    return 'ab';
  }
}

export function setDialect(d: Dialect): void {
  current = d;
  try {
    localStorage.setItem(KEY, d);
  } catch {
    // storage blocked: keep the in-memory choice
  }
  listeners.forEach((fn) => fn());
}

export function useDialect(): Dialect {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}
