import { describe, expect, it } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { DocumentManager, SystemVariableError, SystemVariables } from './index';
import type { SysvarValue } from './index';
import { calendarDate, elapsedDays, localJulianDate, universalJulianDate } from './clock';

describe('runtime clock values', () => {
  it('uses AutoCAD Julian dates with midnight day boundaries and whole seconds', () => {
    expect(localJulianDate(new Date(1998, 0, 1, 12, 0, 0, 999))).toBe(2450815.5);
    expect(localJulianDate(new Date(1970, 0, 1))).toBe(2440588);
    expect(universalJulianDate(new Date(Date.UTC(1998, 0, 1, 6)))).toBe(2450815.25);
    expect(calendarDate(new Date(2026, 9, 15, 9, 5, 7, 800))).toBe(20261015.090507);
    expect(calendarDate(new Date(2026, 0, 2, 0, 0, 0))).toBe(20260102);
    expect(elapsedDays(0, 43_200_999)).toBe(0.5);
    expect(elapsedDays(10, 0)).toBe(0);
    expect(() => localJulianDate(new Date(Number.NaN))).toThrow(RangeError);
  });

  it('stamps new drawings once, keeps opened times and folds editing time on save', () => {
    let now = new Date(2026, 9, 15, 9, 0, 0);
    const manager = new DocumentManager({ clock: () => now });
    const document = manager.create();
    const created = localJulianDate(now);
    expect(document.sysvars.get('TDCREATE')).toBe(created);
    expect(document.sysvars.get('TDUPDATE')).toBe(created);
    expect(document.sysvars.get('TDUCREATE')).toBe(universalJulianDate(now));
    expect(document.sysvars.get('TDINDWG')).toBe(0);
    expect(document.database.undoCount).toBe(0);
    expect(() => document.sysvars.set('TDCREATE', 1)).toThrow(SystemVariableError);

    now = new Date(2026, 9, 15, 15, 0, 0);
    expect(document.sysvars.get('DATE')).toBe(localJulianDate(now));
    expect(document.sysvars.get('CDATE')).toBe(20261015.15);
    expect(document.sysvars.get('TDINDWG')).toBe(0.25);
    expect(document.sysvars.get('TDUSRTIMER')).toBe(0.25);
    const bytes = manager.saveHcd(document.id);
    expect(document.sysvars.get('TDUPDATE')).toBe(localJulianDate(now));
    expect(document.database.undoCount).toBe(0);

    now = new Date(2026, 9, 16, 15, 0, 0);
    const opened = manager.openHcd(bytes, '열린 도면.hcd');
    expect(opened.sysvars.get('TDCREATE')).toBe(created);
    expect(opened.sysvars.get('TDINDWG')).toBe(0.25);
    now = new Date(2026, 9, 16, 21, 0, 0);
    expect(opened.sysvars.get('TDINDWG')).toBe(0.5);
  });

  it('reports host values, the World UCS and the current layout without journaling', () => {
    const manager = new DocumentManager({
      hostValue: (_document, name) =>
        (
          ({ CLAYOUT: 'Model', LOCALE: 'KOR', SCREENSIZE: [1200, 700] }) as Record<
            string,
            SysvarValue
          >
        )[name],
    });
    const document = manager.create();
    expect(document.sysvars.get('UCSNAME')).toBe('');
    expect(document.sysvars.get('CLAYOUT')).toBe('Model');
    expect(document.sysvars.get('LOCALE')).toBe('KOR');
    expect(document.sysvars.get('SCREENSIZE')).toEqual([1200, 700]);
    expect(() => document.sysvars.get('LOGINNAME')).toThrow('아직 확인할 수 없습니다');
    expect(document.database.undoCount).toBe(0);
  });

  it('enforces audited documented ranges, including the SELECTIONEFFECTCOLOR initial value', () => {
    const variables = new SystemVariables({ database: new DrawingDatabase() });
    expect(variables.get('SELECTIONEFFECTCOLOR')).toBe(0);
    variables.set('SELECTIONEFFECTCOLOR', 255);
    expect(() => variables.set('SELECTIONEFFECTCOLOR', 256)).toThrow(SystemVariableError);
    expect(() => variables.set('CBARTRANSPARENCY', 95)).toThrow(SystemVariableError);
    expect(() => variables.set('TEXTQLTY', -1)).toThrow(SystemVariableError);
    variables.set('CLIPROMPTLINES', 50);
    expect(() => variables.set('CLIPROMPTLINES', 51)).toThrow(SystemVariableError);
    variables.set('USERI1', -123_456);
    expect(variables.get('USERI1')).toBe(-123_456);
  });
});
