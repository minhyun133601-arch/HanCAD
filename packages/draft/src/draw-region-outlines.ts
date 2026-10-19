import type { DrawFactory } from './draw-program';
import { drawRevcloud } from './draw-cloud';
import { drawWipeout } from './draw-wipeout';
import { drawRegion } from './draw-region';

export const regionOutlineFactories: Record<string, DrawFactory> = {
  REVCLOUD: drawRevcloud,
  WIPEOUT: drawWipeout,
  REGION: drawRegion,
};
