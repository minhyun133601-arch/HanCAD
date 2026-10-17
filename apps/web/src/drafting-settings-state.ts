import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import type { SysvarValue, SystemVariables } from '@hancad/sysvars';
import { coordinateSettings, formatDraftAngle, parseDraftAngle } from '@hancad/draft';
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
  const angles = { ...coordinateSettings((name) => sysvars.get(name)), angbase: 0, angdir: 0 };
  return Object.fromEntries(
    settingsVariables.map((name) => [
      name,
      name === 'SNAPANG'
        ? formatDraftAngle(sysvars.getNumber(name), angles)
        : String(sysvars.get(name)),
    ]),
  );
}
export function fieldChecked(field: SettingField, draft: SettingsDraft): boolean {
  const value = Number(draft[field.variable]);
  if (field.signed) return value > 0;
  if (field.bit !== undefined) {
    const bit = (value & field.bit) !== 0;
    if (field.variable === 'OSMODE' && field.inverse && (value & 16383) === 0) return false;
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
    if (field.variable === 'DYNMODE') value = Math.abs(value);
    const enabled = field.inverse ? !checked : checked;
    value = enabled ? value | field.bit : value & ~field.bit;
    if (field.inverse && checked && value === 0) {
      const initial = getSystemVariableDefinition(field.variable)?.default;
      if (typeof initial === 'number') value = initial & ~field.bit;
    }
  } else value = checked ? 1 : 0;
  return { ...draft, [field.variable]: String(value) };
}
export function selectedFieldValue(field: SettingField, draft: SettingsDraft): string {
  const raw = draft[field.variable] ?? '';
  return field.signed ? String(Math.abs(Number(raw))) : raw;
}
export function setSelectedFieldValue(
  field: SettingField,
  draft: SettingsDraft,
  text: string,
): SettingsDraft {
  const value = field.signed && Number(draft[field.variable]) < 0 ? -Number(text) : Number(text);
  return { ...draft, [field.variable]: String(value) };
}
export function validatedSettings(
  draft: SettingsDraft,
  sysvars?: SystemVariables,
): Record<string, SysvarValue> {
  const result: Record<string, SysvarValue> = {};
  for (const name of settingsVariables) {
    const definition = getSystemVariableDefinition(name);
    if (!definition) throw new Error(`Unknown setting ${name}`);
    const text = draft[name] ?? '';
    const angle =
      name === 'SNAPANG'
        ? parseDraftAngle(text, {
            ...coordinateSettings((key) => sysvars?.get(key)),
            angbase: 0,
            angdir: 0,
          })
        : undefined;
    if (name === 'SNAPANG' && angle === undefined)
      throw new Error('유효한 스냅 각도를 입력하십시오.');
    const value: SysvarValue =
      angle !== undefined
        ? angle
        : definition.type === 'string'
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
  const current = readSettings(sysvars);
  const values = Object.entries(validatedSettings(draft, sysvars)).filter(
    ([name, value]) => draft[name] !== current[name] && String(sysvars.get(name)) !== String(value),
  );
  const drawing = values.filter(([name]) => getSystemVariableDefinition(name)?.scope === 'drawing');
  if (drawing.length)
    sysvars.database.transaction('DSETTINGS', (transaction) => {
      for (const [name, value] of drawing) transaction.setVariable(name, value);
    });
  for (const [name, value] of values)
    if (getSystemVariableDefinition(name)?.scope !== 'drawing') sysvars.set(name, value);
}
