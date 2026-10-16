import { describe, expect, it } from 'vitest';
import { chordOf, findShortcut, shortcuts } from '@hancad/input';
import { SystemVariables } from '@hancad/sysvars';
import { draftingToggles, flipToggle } from './drafting-toggles';
import { TempOverrides } from './temp-overrides';

describe('global keyboard bindings', () => {
  it('names chords from physical key codes', () => {
    expect(chordOf({ code: 'KeyS', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+S');
    expect(chordOf({ code: 'Digit9', ctrlKey: true })).toBe('Ctrl+9');
    expect(chordOf({ code: 'F3' })).toBe('F3');
    expect(findShortcut({ code: 'KeyB', ctrlKey: true, metaKey: true })).toBeUndefined();
  });

  it('covers every Reference B function key and Ctrl shortcut exactly once', () => {
    const keys = shortcuts.map((shortcut) => shortcut.keys);
    expect(new Set(keys).size).toBe(keys.length);
    const expected = [
      ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
      ...['0', '1', '2', '3', '4', '6', '7', '8', '9'].map((key) => `Ctrl+${key}`),
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((key) => `Ctrl+${key}`),
      'Ctrl+Shift+A',
      'Ctrl+Shift+C',
      'Ctrl+Shift+H',
      'Ctrl+Shift+I',
      'Ctrl+Shift+P',
      'Ctrl+Shift+S',
      'Ctrl+Shift+V',
      'Ctrl+BracketLeft',
      'Ctrl+Backslash',
      'Ctrl+Tab',
      'Ctrl+Shift+Tab',
      'Ctrl+PageUp',
      'Ctrl+PageDown',
      'Ctrl+F4',
      'Ctrl+F2',
      'Delete',
    ];
    expect([...keys].sort()).toEqual([...expected].sort());
  });

  it('maps the acceptance keys to the drafting toggles', () => {
    const toggles = Object.fromEntries(
      ['F3', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].map((key) => [
        key,
        findShortcut({ code: key })?.action,
      ]),
    );
    expect(toggles).toEqual({
      F3: { kind: 'toggle', toggle: 'objectSnap' },
      F7: { kind: 'toggle', toggle: 'grid' },
      F8: { kind: 'toggle', toggle: 'ortho' },
      F9: { kind: 'toggle', toggle: 'snap' },
      F10: { kind: 'toggle', toggle: 'polar' },
      F11: { kind: 'toggle', toggle: 'objectSnapTracking' },
      F12: { kind: 'toggle', toggle: 'dynamicInput' },
    });
    const ctrl = (key: string) => findShortcut({ code: `Key${key}`, ctrlKey: true })?.action;
    expect(['B', 'E', 'F', 'G', 'L', 'U', 'W'].map(ctrl)).toEqual(
      ['snap', 'isoplane', 'objectSnap', 'grid', 'ortho', 'polar', 'selectionCycling'].map(
        (toggle) => ({ kind: 'toggle', toggle }),
      ),
    );
    expect(ctrl('Z')).toEqual({ kind: 'macro', macro: '^C^C_U' });
    expect(ctrl('S')).toEqual({ kind: 'macro', macro: '^C^C_QSAVE' });
  });
});

describe('drafting toggles', () => {
  it('flips each variable the way AutoCAD stores it', () => {
    const sysvars = new SystemVariables();
    expect(flipToggle(sysvars, 'grid')).toBe(false);
    expect(sysvars.getNumber('GRIDMODE')).toBe(0);
    flipToggle(sysvars, 'objectSnap');
    expect(sysvars.getNumber('OSMODE')).toBe(4133 | 16384);
    flipToggle(sysvars, 'objectSnap');
    expect(sysvars.getNumber('OSMODE')).toBe(4133);
    sysvars.set('OSMODE', 0);
    expect(flipToggle(sysvars, 'objectSnap')).toBe(true);
    expect(sysvars.getNumber('OSMODE')).toBe(4133);
    flipToggle(sysvars, 'dynamicInput');
    expect(sysvars.getNumber('DYNMODE')).toBe(-3);
    flipToggle(sysvars, 'selectionCycling');
    expect(sysvars.getNumber('SELECTIONCYCLING')).toBe(2);
    expect(
      [1, 2, 0].map(() => (flipToggle(sysvars, 'isoplane'), sysvars.getNumber('SNAPISOPAIR'))),
    ).toEqual([1, 2, 0]);
    flipToggle(sysvars, 'object3dSnap');
    expect(draftingToggles.object3dSnap.enabled(sysvars)).toBe(true);
  });

  it('keeps ortho and polar tracking mutually exclusive', () => {
    const sysvars = new SystemVariables();
    // AUTOSNAP 63 has polar tracking on by default.
    expect(sysvars.getNumber('AUTOSNAP') & 8).toBe(8);
    flipToggle(sysvars, 'ortho');
    expect(sysvars.getNumber('ORTHOMODE')).toBe(1);
    expect(sysvars.getNumber('AUTOSNAP') & 8).toBe(0);
    flipToggle(sysvars, 'polar');
    expect(sysvars.getNumber('AUTOSNAP') & 8).toBe(8);
    expect(sysvars.getNumber('ORTHOMODE')).toBe(0);
  });
});

describe('temporary overrides', () => {
  it('changes effective values only while held', () => {
    const overrides = new TempOverrides();
    let changes = 0;
    overrides.subscribe(() => changes++);
    overrides.press('ortho');
    expect(overrides.effective('ORTHOMODE', 0)).toBe(1);
    expect(overrides.effective('ORTHOMODE', 1)).toBe(0);
    overrides.release('ortho');
    expect(overrides.effective('ORTHOMODE', 0)).toBe(0);
    overrides.press('endpoint');
    expect(overrides.effective('OSMODE', 4133)).toBe(1);
    overrides.release();
    overrides.press('osnapToggle');
    expect(overrides.effective('OSMODE', 4133)).toBe(4133 | 16384);
    expect(overrides.effective('OSMODE', 4133 | 16384)).toBe(4133);
    overrides.release();
    overrides.press('osnapEnforce');
    expect(overrides.effective('OSMODE', 0)).toBe(4133);
    overrides.release();
    overrides.press('disableSnaps');
    expect(overrides.effective('OSMODE', 4133)).toBe(0);
    expect(overrides.effective('AUTOSNAP', 63)).toBe(63 & ~24);
    overrides.release();
    overrides.press('polarToggle');
    overrides.press('trackingToggle');
    expect(overrides.effective('AUTOSNAP', 63)).toBe(63 ^ 24);
    overrides.release();
    expect(changes).toBe(13);
  });
});
