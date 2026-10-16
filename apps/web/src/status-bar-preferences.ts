import { useState } from 'react';
import { statusToggles } from './status-bar-items';

export const statusBarStorageKey = 'hancad.status-bar.v1';
const known = new Set(['coordinates', 'units', ...statusToggles.map((item) => item.toggle)]);
const defaults = [
  'units',
  ...statusToggles.filter((item) => item.defaultVisible).map((item) => item.toggle),
];

/** Reject foreign IDs and corrupt preference files without changing drawing state. */
export function readStatusItems(storage: Pick<Storage, 'getItem'>): string[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(statusBarStorageKey) ?? 'null');
    if (Array.isArray(saved))
      return [
        ...new Set(saved.filter((id): id is string => typeof id === 'string' && known.has(id))),
      ];
  } catch {
    // Storage may be denied; the in-memory customization still works.
  }
  return [...defaults];
}

export function useStatusItems() {
  const [visible, setVisible] = useState(() => readStatusItems(localStorage));
  return {
    visible,
    toggle(id: string): void {
      if (!known.has(id)) return;
      setVisible((previous) => {
        const next = previous.includes(id)
          ? previous.filter((item) => item !== id)
          : [...previous, id];
        try {
          localStorage.setItem(statusBarStorageKey, JSON.stringify(next));
        } catch {
          /* Memory-only profile. */
        }
        return next;
      });
    },
  };
}
