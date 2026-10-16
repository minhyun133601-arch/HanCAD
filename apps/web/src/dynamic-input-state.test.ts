import { expect, it } from 'vitest';
import { constraintsFor, dynamicToken } from './dynamic-input-state';

const fallback = { distance: '50', angle: '45', x: '10', y: '20', z: '0' };
it('combines locked dimensional fields as raw shared-parser input without changing unit notation', () => {
  const edit = { field: 'angle' as const, locked: { distance: `2'3.5"` }, engaged: true, relative: true };
  expect(dynamicToken(edit, '30d15\'', fallback)).toBe(`@2'3.5"<30d15'`);
  expect(constraintsFor(edit, '30d15\'')).toEqual({ distance: `2'3.5"`, angle: '30d15\'', relative: true });
});

it('uses locked Cartesian coordinates and current cursor components for unlocked fields', () => {
  const edit = { field: 'y' as const, locked: { x: '-10' }, engaged: true, relative: false };
  expect(dynamicToken(edit, '25', fallback)).toBe('#-10,25');
  expect(dynamicToken(edit, '', fallback)).toBe('#-10,20');
  expect(dynamicToken({ ...edit, field: 'z' }, '40', fallback)).toBe('#-10,20,40');
});
