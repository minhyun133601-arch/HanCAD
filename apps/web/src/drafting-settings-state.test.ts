import { expect, it } from 'vitest';
import { SystemVariables, getSystemVariableDefinition } from '@hancad/sysvars';
import { applySettings, fieldChecked, readSettings, setFieldChecked, settingsVariables } from './drafting-settings-state';
import { draftingSettings } from './drafting-settings-fields';

it('connects every tab control to an existing validated variable and preserves unedited settings', () => {
  const vars = new SystemVariables();
  for (const name of settingsVariables) expect(getSystemVariableDefinition(name), name).toBeDefined();
  const draft = readSettings(vars);
  applySettings(vars, draft);
  expect(vars.database.undoCount).toBe(0);
});

it('validates before changing anything and groups drawing setting changes into one undo step', () => {
  const vars = new SystemVariables();
  const draft = { ...readSettings(vars), GRIDUNIT: '25,25', GRIDMODE: '0', DYNMODE: '1' };
  expect(() => applySettings(vars, { ...draft, SNAPUNIT: '0,5' })).toThrow();
  expect(vars.get('GRIDUNIT')).toEqual([10, 10]);
  applySettings(vars, draft);
  expect(vars.get('GRIDUNIT')).toEqual([25, 25]);
  expect(vars.getNumber('GRIDMODE')).toBe(0);
  expect(vars.getNumber('DYNMODE')).toBe(1);
  vars.database.undo();
  expect(vars.get('GRIDUNIT')).toEqual([10, 10]);
  expect(vars.getNumber('GRIDMODE')).toBe(1);
  expect(vars.getNumber('DYNMODE')).toBe(1);
});

it('keeps independent polar angle measurement and tracking masks when toggling either checkbox', () => {
  const fields = draftingSettings.polar.flatMap((group) => group.fields);
  const track = fields.find((field) => field.variable === 'POLARMODE' && field.bit === 2);
  if (!track) throw new Error('Tracking option missing');
  const draft = setFieldChecked(track, { POLARMODE: '13' }, true);
  expect(draft.POLARMODE).toBe('15');
  expect(fieldChecked(track, draft)).toBe(true);
  expect(setFieldChecked(track, draft, false).POLARMODE).toBe('13');
});
