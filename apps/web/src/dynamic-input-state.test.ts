import { expect, it } from 'vitest';
import { constraintsFor, dynamicPosition, dynamicToken } from './dynamic-input-state';

const fallback = { distance: '50', angle: '45', x: '10', y: '20', z: '0' };
it('combines locked dimensional fields as raw shared-parser input without changing unit notation', () => {
  const edit = {
    field: 'angle' as const,
    locked: { distance: `2'3.5"` },
    engaged: true,
    relative: true,
  };
  expect(dynamicToken(edit, "30d15'", fallback)).toBe(`@2'3.5"<30d15'`);
  expect(constraintsFor(edit, "30d15'")).toEqual({
    distance: `2'3.5"`,
    angle: "30d15'",
    relative: true,
  });
});

it('uses explicit coordinate prefixes for both constraints and submitted points', () => {
  const edit = { field: 'x' as const, locked: { y: '20' }, engaged: true, relative: true };
  expect(constraintsFor(edit, '#10').relative).toBe(false);
  expect(dynamicToken(edit, '#10', fallback)).toBe('#10,20');
  expect(dynamicToken({ ...edit, relative: false }, '@10', fallback)).toBe('@10,20');
});

it('keeps the complete tooltip inside the drawing viewport at every cursor edge', () => {
  const size = { width: 220, height: 130 },
    bounds = { width: 800, height: 600 };
  for (const screen of [
    { x: 0, y: 0 },
    { x: 799, y: 599 },
    { x: 400, y: 599 },
  ]) {
    const point = dynamicPosition(screen, size, bounds);
    expect(point.x).toBeGreaterThanOrEqual(4);
    expect(point.y).toBeGreaterThanOrEqual(4);
    expect(point.x + size.width).toBeLessThanOrEqual(796);
    expect(point.y + size.height).toBeLessThanOrEqual(596);
  }
});

it('uses locked Cartesian coordinates and current cursor components for unlocked fields', () => {
  const edit = { field: 'y' as const, locked: { x: '-10' }, engaged: true, relative: false };
  expect(dynamicToken(edit, '25', fallback)).toBe('#-10,25');
  expect(dynamicToken(edit, '', fallback)).toBe('#-10,20');
  expect(dynamicToken({ ...edit, field: 'z' }, '40', fallback)).toBe('#-10,20,40');
});

it('passes command keywords and complete point syntax to the shared controller despite locked fields', () => {
  for (const field of ['distance', 'angle', 'x'] as const) {
    const edit = { field, locked: { distance: '100', angle: '30' }, engaged: true, relative: true };
    for (const input of [
      'U',
      'UNDO',
      'CLOSE',
      'FROM',
      'END',
      '.X',
      'M2P',
      'TT',
      'TK',
      'FROM 10,20',
      '<45',
      '#10,20',
      '@100<45',
    ])
      expect(dynamicToken(edit, input, fallback), `${field}: ${input}`).toBe(input);
  }
});
