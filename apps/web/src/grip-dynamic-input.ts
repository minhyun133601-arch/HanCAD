import {
  formatDraftAngle,
  formatDraftNumber,
  gripDimensionValues,
  parseDraftAngle,
  parseDraftNumber,
  resolveGripDimensionPoint,
  updateGripDimensionContext,
} from '@hancad/draft';
import type { CoordinateSettings, GripDimensionContext, GripDimensionField } from '@hancad/draft';
import type { CadPoint } from '@hancad/legacy-bridge';
import type { DynamicConstraints, DynamicEdit, DynamicField } from './dynamic-input-state';

export const gripDimensionFields: readonly GripDimensionField[] = [
  'result',
  'lengthChange',
  'absoluteAngle',
  'angleChange',
  'radius',
];
const angular = (field: GripDimensionField): boolean =>
  field === 'absoluteAngle' || field === 'angleChange';
export function gripDimensionDisplay(
  context: GripDimensionContext,
  settings: CoordinateSettings,
): Record<GripDimensionField, string> {
  const values = gripDimensionValues(context);
  return Object.fromEntries(
    gripDimensionFields.map((field) => {
      const value = values[field];
      return [
        field,
        value === undefined
          ? '—'
          : angular(field)
            ? field === 'angleChange'
              ? `${value < 0 ? '-' : ''}${formatDraftAngle(Math.abs(value), { ...settings, angbase: 0, angdir: 0 })}`
              : formatDraftAngle(
                  value,
                  context.kind === 'arc' ? { ...settings, angbase: 0, angdir: 0 } : settings,
                )
            : formatDraftNumber(value, settings),
      ];
    }),
  ) as Record<GripDimensionField, string>;
}
function parseValues(
  edit: DynamicEdit,
  input: string,
  context: GripDimensionContext,
  settings: CoordinateSettings,
) {
  const raw = gripDimensionLocks(edit, input, context);
  const result: Partial<Record<GripDimensionField, number>> = {};
  for (const field of gripDimensionFields) {
    const value = raw[field];
    if (value === undefined) continue;
    const parsed = angular(field)
      ? parseDraftAngle(
          value,
          context.kind === 'arc' || field === 'angleChange'
            ? { ...settings, angbase: 0, angdir: 0 }
            : settings,
        )
      : parseDraftNumber(value, settings);
    if (parsed === undefined) return;
    result[field] = parsed;
  }
  return result;
}
export function gripDimensionLocks(
  edit: DynamicEdit,
  input: string,
  context: GripDimensionContext,
): Partial<Record<DynamicField, string>> {
  const result = { ...edit.locked };
  if (!input.trim()) return result;
  if (context.kind === 'arc') for (const field of gripDimensionFields) delete result[field];
  else {
    if (edit.field === 'result') delete result.lengthChange;
    if (edit.field === 'lengthChange') delete result.result;
    if (edit.field === 'absoluteAngle') delete result.angleChange;
    if (edit.field === 'angleChange') delete result.absoluteAngle;
  }
  result[edit.field] = input.trim();
  return result;
}
export function isGripDimensionField(field: DynamicField): field is GripDimensionField {
  return gripDimensionFields.includes(field as GripDimensionField);
}
export function gripDimensionToken(
  edit: DynamicEdit,
  input: string,
  context: GripDimensionContext,
  settings: CoordinateSettings,
): string | null | undefined {
  const values = parseValues(edit, input, context, settings);
  if (!values) return input;
  if (!Object.keys(values).length) return;
  const point = resolveGripDimensionPoint(context, values);
  if (!point) return null;
  return `#${point.x + (context.pointerOffset?.x ?? 0)},${-(point.y + (context.pointerOffset?.y ?? 0))}${point.z === undefined ? '' : `,${point.z}`}`;
}
export function gripDimensionConstraints(
  edit: DynamicEdit,
  input: string,
  context: GripDimensionContext,
  settings: CoordinateSettings,
): DynamicConstraints {
  const values = parseValues(edit, input, context, settings);
  if (!values || !Object.keys(values).length) return { relative: true };
  if (!resolveGripDimensionPoint(context, values))
    return { relative: false, invalid: true, constraintKey: JSON.stringify([context.key, values]) };
  return {
    relative: false,
    constraintKey: JSON.stringify([context.key, values]),
    project: (point: CadPoint): CadPoint => {
      const offset = context.pointerOffset ?? { x: 0, y: 0 };
      const current = updateGripDimensionContext(context, {
        x: point.x - offset.x,
        y: point.y - offset.y,
        ...(point.z === undefined ? {} : { z: point.z }),
      });
      const target = resolveGripDimensionPoint(current, values);
      return target ? { ...target, x: target.x + offset.x, y: target.y + offset.y } : point;
    },
  };
}
