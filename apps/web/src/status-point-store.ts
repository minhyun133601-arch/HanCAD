import type { CadPoint } from '@hancad/legacy-bridge';
import type { SystemVariables } from '@hancad/sysvars';

interface PointStore {
  last: CadPoint & { z: number };
  listeners: Set<() => void>;
}
const stores = new WeakMap<SystemVariables, PointStore>();
export function statusPointStore(sysvars: SystemVariables): PointStore {
  let store = stores.get(sysvars);
  if (!store) {
    const saved = sysvars.get('LASTPOINT');
    const last = Array.isArray(saved)
      ? { x: saved[0] ?? 0, y: -(saved[1] ?? 0) || 0, z: saved[2] ?? 0 }
      : { x: 0, y: 0, z: 0 };
    store = { last, listeners: new Set() };
    stores.set(sysvars, store);
    const target = store;
    sysvars.events.subscribe((event) => {
      if (event.name !== 'LASTPOINT' || !Array.isArray(event.value)) return;
      const next = {
        x: event.value[0] ?? 0,
        y: -(event.value[1] ?? 0) || 0,
        z: event.value[2] ?? 0,
      };
      if (target.last.x === next.x && target.last.y === next.y && target.last.z === next.z) return;
      target.last = next;
      for (const listener of target.listeners) listener();
    });
  }
  return store;
}

/** Called only after the session accepts its exact, constrained point. */
export function recordStatusPoint(sysvars: SystemVariables, point: CadPoint): void {
  const store = statusPointStore(sysvars);
  if (store.last.x === point.x && store.last.y === point.y && store.last.z === 0) return;
  sysvars.set('LASTPOINT', [point.x, -point.y, 0]);
}
