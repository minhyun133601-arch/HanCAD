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
  return { ...locked, relative: edit.relative };
}
/** Raw scalar fragments are passed to the one shared coordinate parser at submission. */
export function dynamicToken(
  edit: DynamicEdit,
  input: string,
  fallback: Readonly<Record<DynamicField, string>>,
): string | undefined {
  const fields = constraintsFor(edit, input);
  const prefix = edit.relative ? '@' : '#';
  if (fields.x !== undefined || fields.y !== undefined || fields.z !== undefined) {
    const xy = `${fields.x ?? fallback.x},${fields.y ?? fallback.y}`;
    return `${prefix}${xy}${fields.z === undefined ? '' : `,${fields.z}`}`;
  }
  if (fields.angle !== undefined)
    return `${prefix}${fields.distance ?? fallback.distance}<${fields.angle}`;
  return fields.distance;
}
