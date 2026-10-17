import { parseDraftAngle, parseDraftNumber } from '@hancad/draft';

export type DynamicField = 'distance' | 'angle' | 'x' | 'y' | 'z';
export interface DynamicConstraints {
  distance?: string;
  angle?: string;
  x?: string;
  y?: string;
  z?: string;
  relative: boolean;
}
export interface DynamicEdit {
  field: DynamicField;
  locked: Partial<Record<DynamicField, string>>;
  engaged: boolean;
  relative: boolean;
  cartesian?: boolean;
}
export function dynamicFields(dimensional: boolean, polar: boolean): readonly DynamicField[] {
  return dimensional || polar ? ['distance', 'angle'] : ['x', 'y', 'z'];
}
export function constraintsFor(edit: DynamicEdit, input: string): DynamicConstraints {
  const locked = { ...edit.locked };
  if (input.trim()) locked[edit.field] = input.trim().replace(/^[#@]/, '');
  return {
    ...locked,
    relative: input.startsWith('#') ? false : input.startsWith('@') ? true : edit.relative,
  };
}
/** Raw scalar fragments are passed to the one shared coordinate parser at submission. */
export function dynamicToken(
  edit: DynamicEdit,
  input: string,
  fallback: Readonly<Record<DynamicField, string>>,
): string | undefined {
  const value = input.trim();
  const scalar = value.replace(/^[#@]/, '');
  if (
    value &&
    (edit.field === 'angle' ? parseDraftAngle(scalar) : parseDraftNumber(scalar)) === undefined
  )
    return value;
  const fields = constraintsFor(edit, input);
  const prefix = fields.relative ? '@' : '#';
  if (fields.x !== undefined || fields.y !== undefined || fields.z !== undefined) {
    const xy = `${fields.x ?? fallback.x},${fields.y ?? fallback.y}`;
    return `${prefix}${xy}${fields.z === undefined ? '' : `,${fields.z}`}`;
  }
  if (fields.angle !== undefined)
    return `${prefix}${fields.distance ?? fallback.distance}<${fields.angle}`;
  return fields.distance;
}

/** Flip around the cursor when a tooltip would cross its drawing viewport. */
export function dynamicPosition(
  screen: { x: number; y: number },
  size: { width: number; height: number },
  bounds: { width: number; height: number },
): { x: number; y: number } {
  const x =
    screen.x + 18 + size.width > bounds.width - 4 ? screen.x - size.width - 18 : screen.x + 18;
  const y =
    screen.y + 22 + size.height > bounds.height - 4 ? screen.y - size.height - 22 : screen.y + 22;
  return {
    x: Math.max(4, Math.min(x, bounds.width - size.width - 4)),
    y: Math.max(4, Math.min(y, bounds.height - size.height - 4)),
  };
}
