import { expect, it } from 'vitest';
import { SystemVariables, getSystemVariableDefinition } from '@hancad/sysvars';
import {
  applySettings,
  fieldChecked,
  readSettings,
  selectedFieldValue,
  setFieldChecked,
  setSelectedFieldValue,
  settingsVariables,
} from './drafting-settings-state';
import { draftingSettings } from './drafting-settings-fields';

it('connects every tab control to an existing validated variable and preserves unedited settings', () => {
  const vars = new SystemVariables();
  for (const name of settingsVariables)
    expect(getSystemVariableDefinition(name), name).toBeDefined();
  const draft = readSettings(vars);
  applySettings(vars, draft);
  expect(vars.database.undoCount).toBe(0);
});

it('formats and parses SNAPANG in the current angle units without changing unedited exact values', () => {
  const vars = new SystemVariables();
  vars.set('AUNITS', 2);
  vars.set('AUPREC', 3);
  vars.set('ANGBASE', 0.8);
  vars.set('ANGDIR', 1);
  vars.set('SNAPANG', Math.PI / 4 + 0.000001);
  const before = vars.database.undoCount;
  const current = readSettings(vars);
  expect(current.SNAPANG).toBe('50.000g');
  applySettings(vars, current);
  expect(vars.database.undoCount).toBe(before);
  applySettings(vars, { ...current, SNAPANG: '100g' });
  expect(vars.getNumber('SNAPANG')).toBeCloseTo(Math.PI / 2, 12);
  expect(() => applySettings(vars, { ...readSettings(vars), SNAPANG: 'invalid' })).toThrow();
});

it('matches disabled signed selection choices and preserves their remembered value', () => {
  const field = draftingSettings.cycling
    .flatMap((group) => group.fields)
    .find((item) => item.kind === 'select');
  if (!field) throw new Error('Selection cycling list setting missing');
  expect(selectedFieldValue(field, { SELECTIONCYCLING: '-2' })).toBe('2');
  expect(setSelectedFieldValue(field, { SELECTIONCYCLING: '-2' }, '1').SELECTIONCYCLING).toBe('-1');
});

it('preserves disabled dynamic mode bits and treats an empty osnap mask as off', () => {
  const pointer = draftingSettings.dynamic
    .flatMap((group) => group.fields)
    .find((field) => field.variable === 'DYNMODE' && field.bit === 1);
  const osnap = draftingSettings.osnap
    .flatMap((group) => group.fields)
    .find((field) => field.variable === 'OSMODE' && field.inverse);
  if (!pointer || !osnap) throw new Error('Drafting toggle setting missing');
  expect(setFieldChecked(pointer, { DYNMODE: '-3' }, true).DYNMODE).toBe('3');
  expect(fieldChecked(osnap, { OSMODE: '0' })).toBe(false);
  expect(fieldChecked(osnap, { OSMODE: '1' })).toBe(true);
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
