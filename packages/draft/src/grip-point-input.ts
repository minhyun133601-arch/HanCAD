import type { CadPoint } from '@hancad/legacy-bridge';
import type { GripSessionOptions } from './grip-types';
import type { PointInputContext, PointSnapOverride } from './point-input';

export function gripPointInputContext(
  base: CadPoint,
  cursor: CadPoint | undefined,
  options: GripSessionOptions,
  source: 'interactive' | 'script',
): PointInputContext {
  const settings = options.coordinates?.();
  return {
    base,
    ...(cursor ? { cursor } : {}),
    ...(settings ? { settings } : {}),
    resolveTypedPoint: (point: CadPoint, override?: PointSnapOverride): CadPoint | null => {
      const mode = override ?? options.getSnapOverride?.(),
        priority = settings?.osnapcoord ?? 2;
      if (mode === 'none' || (!mode && priority !== 0 && !(priority === 2 && source === 'script')))
        return point;
      return options.resolveTypedPoint?.(point, mode) ?? (mode ? null : point);
    },
  };
}
