import type { SystemVariables, SysvarValue } from '@hancad/sysvars';
import { coordinateSettings, formatDraftAngle, parseDraftAngle } from '@hancad/draft';

export const angularInputVariables = new Set(['ANGBASE', 'SNAPANG']);
/** The command-line value prompt uses current angle units; numeric APIs keep radians. */
export function formatSysvarInput(
  name: string,
  value: SysvarValue,
  sysvars: SystemVariables,
): string {
  if (angularInputVariables.has(name) && typeof value === 'number')
    return formatDraftAngle(value, {
      ...coordinateSettings((key) => sysvars.get(key)),
      angbase: 0,
      angdir: 0,
    });
  return Array.isArray(value) ? value.join(',') : String(value);
}
export function parseAngleSysvarInput(input: string, sysvars: SystemVariables): number {
  return (
    parseDraftAngle(input, {
      ...coordinateSettings((key) => sysvars.get(key)),
      angbase: 0,
      angdir: 0,
    }) ?? Number.NaN
  );
}
