import type { CadEntity } from '@hancad/legacy-bridge';
import type { DrawContext } from './draw-program';

/** Property-only factories ignore the unrelated drafting and annotation settings. */
export function drawEntityContext(entity: CadEntity): DrawContext {
  return {
    settings: {
      ...entity,
      unit: 'mm',
      grid: false,
      gridSnap: false,
      ortho: false,
      objectSnap: false,
      gridSize: 10,
      textSize: 2.5,
      dimPrecision: 2,
      dimScale: 1,
      dimTextSize: 3.5,
      arrowSize: 2.5,
      extensionGap: 1,
      extensionOvershoot: 2,
      dimUnit: 'mm',
    },
    coordinates: () => ({}),
    get: () => 0,
    set: () => {},
    entities: [],
  };
}
