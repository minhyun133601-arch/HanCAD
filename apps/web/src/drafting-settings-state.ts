import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import type { SysvarValue, SystemVariables } from '@hancad/sysvars';
import { draftingSettings } from './drafting-settings-fields';
import type { SettingField } from './drafting-settings-fields';

export type SettingsDraft = Record<string, string>;
export const settingsVariables = [
  ...new Set(
    Object.values(draftingSettings).flatMap((groups) =>
      groups.flatMap((group) => group.fields.map((field) => field.variable)),
    ),
  ),
];
export function readSettings(sysvars: SystemVariables): SettingsDraft {
  return Object.fromEntries(settingsVariables.map((name) => [name, String(sysvars.get(name))]));
}
export function fieldChecked(field: SettingField, draft: SettingsDraft): boolean {
  const value = Number(draft[field.variable]);
  if (field.signed) return value > 0;
  if (field.bit !== undefined) {
    const bit = (value & field.bit) !== 0;
    return field.inverse ? !bit : field.variable === 'DYNMODE' ? value > 0 && bit : bit;
  }
  return value !== 0;
}
export function setFieldChecked(
  field: SettingField,
  draft: SettingsDraft,
  checked: boolean,
): SettingsDraft {
  let value = Number(draft[field.variable]);
  if (field.signed)
    value = checked
      ? Math.abs(value) || (field.variable === 'SELECTIONCYCLING' ? 2 : 1)
      : -(Math.abs(value) || 1);
  else if (field.bit !== undefined) {
    if (field.variable === 'DYNMODE') value = Math.max(0, value);
    const enabled = field.inverse ? !checked : checked;
    value = enabled ? value | field.bit : value & ~field.bit;
    if (field.inverse && checked && value === 0) {
      const initial = getSystemVariableDefinition(field.variable)?.default;
      if (typeof initial === 'number') value = initial & ~field.bit;
    }
  } else value = checked ? 1 : 0;
  return { ...draft, [field.variable]: String(value) };
}
export function validatedSettings(draft: SettingsDraft): Record<string, SysvarValue> {
  const result: Record<string, SysvarValue> = {};
  for (const name of settingsVariables) {
    const definition = getSystemVariableDefinition(name);
    if (!definition) throw new Error(`Unknown setting ${name}`);
    const text = draft[name] ?? '';
    const value: SysvarValue =
      definition.type === 'string'
        ? text
        : definition.type === 'point2'
          ? (text.split(',').map(Number) as [number, number])
          : Number(text);
    validateSystemVariable(definition, value);
    if (name === 'SNAPUNIT' && Array.isArray(value) && value.some((n) => n <= 0))
      throw new Error('스냅 간격은 양수이어야 합니다.');
    if (name === 'GRIDUNIT' && Array.isArray(value) && value.some((n) => n < 0))
      throw new Error('그리드 간격은 0 이상이어야 합니다.');
    result[name] = value;
  }
  return result;
}

/** Drawing settings form one undoable edit; profile preferences remain profile scoped. */
export function applySettings(sysvars: SystemVariables, draft: SettingsDraft): void {
  const values = Object.entries(validatedSettings(draft)).filter(
    ([name, value]) => String(sysvars.get(name)) !== String(value),
  );
  const drawing = values.filter(([name]) => getSystemVariableDefinition(name)?.scope === 'drawing');
  if (drawing.length)
    sysvars.database.transaction('DSETTINGS', (transaction) => {
      for (const [name, value] of drawing) transaction.setVariable(name, value);
    });
  for (const [name, value] of values)
    if (getSystemVariableDefinition(name)?.scope !== 'drawing') sysvars.set(name, value);
}
