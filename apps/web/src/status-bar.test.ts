import { describe, expect, it } from 'vitest';
import { SystemVariables } from '@hancad/sysvars';
import { coordinateText } from './status-coordinates';
import { readStatusItems, statusBarStorageKey } from './status-bar-preferences';
import { coordinateMenu, statusSettings } from './status-bar-menus';
import { flipToggle } from './drafting-toggles';

describe('status strip drafting controls', () => {
  it('cycles static, dynamic and polar coordinates instead of losing polar mode', () => {
    const sysvars = new SystemVariables();
    sysvars.set('COORDS', 0);
    expect(flipToggle(sysvars, 'coordinates')).toBe(true);
    expect(sysvars.getNumber('COORDS')).toBe(1);
    flipToggle(sysvars, 'coordinates');
    expect(sysvars.getNumber('COORDS')).toBe(2);
    expect(flipToggle(sysvars, 'coordinates')).toBe(false);
    expect(sysvars.getNumber('COORDS')).toBe(0);
  });

  it('formats static, absolute and relative polar positions using UNITS precision', () => {
    const vars = new SystemVariables();
    vars.set('LUPREC', 2);
    vars.set('AUPREC', 1);
    const points = { last: { x: -0.001, y: 12 }, cursor: { x: 13, y: 24 }, base: { x: 10, y: 20 } };
    vars.set('COORDS', 0);
    expect(coordinateText(vars, points)).toBe('0.00, 12.00, 0.00');
    vars.set('COORDS', 1);
    expect(coordinateText(vars, points)).toBe('13.00, 24.00, 0.00');
    vars.set('COORDS', 2);
    expect(coordinateText(vars, points)).toBe('5.00<53.1');
    expect(coordinateText(vars, { last: points.last, cursor: points.cursor })).toBe(
      '13.00, 24.00, 0.00',
    );
  });

  it('reports unavailable geographical coordinates instead of presenting UCS values as latitude and longitude', () => {
    const vars = new SystemVariables();
    vars.set('COORDS', 3);
    const points = { cursor: { x: 127, y: 37 }, last: { x: 0, y: 0 } };
    expect(coordinateText(vars, points)).toBe('지리적 위치 없음');
    expect(coordinateText(vars, points, 'en-US')).toBe('Geographic location unavailable');
  });

  it('keeps unrelated osnap and polar tracking bits when changing a setting', () => {
    const vars = new SystemVariables();
    const macros: string[] = [];
    vars.set('OSMODE', 16384 | 1 | 32);
    const mode = statusSettings(
      'objectSnap',
      vars,
      'ko-KR',
      () => {},
      (macro) => macros.push(macro),
    ).find((item) => item.id === 'osnap-2');
    if (!mode || mode.kind === 'separator') throw new Error('Missing snap menu item');
    mode.onSelect?.();
    expect(macros.pop()).toBe(`'_SETVAR OSMODE ${16384 | 1 | 32 | 2}`);
    vars.set('POLARMODE', 14);
    const tracking = statusSettings(
      'objectSnapTracking',
      vars,
      'ko-KR',
      () => {},
      (macro) => macros.push(macro),
    ).find((item) => item.id === 'tracking-1');
    if (!tracking || tracking.kind === 'separator') throw new Error('Missing tracking menu item');
    tracking.onSelect?.();
    expect(macros.pop()).toBe("'_SETVAR POLARMODE 15");
  });

  it('makes relative and geographical menu modes unavailable without their context', () => {
    const items = coordinateMenu(new SystemVariables(), 'ko-KR', false, () => {});
    for (const id of ['coords-2', 'coords-3']) {
      const item = items.find((entry) => entry.id === id);
      expect(item && item.kind !== 'separator' && item.disabled).toBe(true);
    }
  });

  it('loads customized visibility and recovers defaults from corrupt profile data', () => {
    const storage = {
      getItem: (key: string) =>
        key === statusBarStorageKey ? '["coordinates","grid","foreign","grid",4]' : null,
    };
    expect(readStatusItems(storage)).toEqual(['coordinates', 'grid']);
    expect(readStatusItems({ getItem: () => 'invalid' })).toContain('objectSnap');
    expect(readStatusItems({ getItem: () => null })).not.toContain('coordinates');
    expect(readStatusItems({ getItem: () => '[]' })).toEqual([]);
  });
});
