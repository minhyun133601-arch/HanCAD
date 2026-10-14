import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemVariableProfile, SystemVariables } from '@hancad/sysvars';
import {
  persistProfileVariables,
  profileStorageKey,
  restoreProfileVariables,
  subscribeProfileVariables,
} from './profile-storage';

afterEach(() => vi.unstubAllGlobals());

function memoryStorage(initial: string | null = null) {
  let cached = initial;
  return {
    getItem: vi.fn((_key: string) => cached),
    setItem: vi.fn((_key: string, value: string) => {
      cached = value;
    }),
  };
}

describe('browser system-variable profiles', () => {
  it('restores a shared profile and persists changes without entering either drawing journal', () => {
    const storage = memoryStorage(
      JSON.stringify({ TRIMEXTENDMODE: 0, EDGEMODE: 1, OFFSETGAPTYPE: 2 }),
    );
    const profile = new SystemVariableProfile();
    const first = new SystemVariables({ profile });
    const second = new SystemVariables({ profile });
    const before = first.database.serialize();
    restoreProfileVariables(profile, storage);
    const unsubscribe = subscribeProfileVariables(profile, storage);
    expect(first.getNumber('TRIMEXTENDMODE')).toBe(0);
    expect(second.getNumber('EDGEMODE')).toBe(1);
    first.set('OFFSETGAPTYPE', 1);
    expect(second.getNumber('OFFSETGAPTYPE')).toBe(1);
    expect(first.database.serialize()).toBe(before);
    expect(first.database.undoCount).toBe(0);
    expect(second.database.undoCount).toBe(0);
    expect(storage.getItem).toHaveBeenCalledWith(profileStorageKey);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      profileStorageKey,
      JSON.stringify({
        TRIMEXTENDMODE: 0,
        EDGEMODE: 1,
        OFFSETGAPTYPE: 1,
      }),
    );
    const reloaded = new SystemVariables();
    restoreProfileVariables(reloaded.profile, storage);
    expect(reloaded.getNumber('TRIMEXTENDMODE')).toBe(0);
    expect(reloaded.getNumber('EDGEMODE')).toBe(1);
    expect(reloaded.getNumber('OFFSETGAPTYPE')).toBe(1);
    expect(reloaded.getNumber('OFFSETDIST')).toBe(-1);
    unsubscribe();
  });

  it('discards invalid entries, unknown names, drawing/session values and readonly values individually', () => {
    const storage = memoryStorage(
      JSON.stringify({
        TRIMEXTENDMODE: 0,
        EDGEMODE: 1,
        OFFSETGAPTYPE: 3,
        OSMODE: 'invalid',
        UNKNOWN_PROFILE: 12,
        TEXTSIZE: 99,
        OFFSETDIST: 22,
        CMDACTIVE: 4,
        FONTALT: '맑은 고딕',
        APERTURE: null,
      }),
    );
    const variables = new SystemVariables();
    restoreProfileVariables(variables.profile, storage);
    expect(Object.fromEntries(variables.profile.values)).toEqual({
      TRIMEXTENDMODE: 0,
      EDGEMODE: 1,
      FONTALT: '맑은 고딕',
    });
    expect(variables.getNumber('OFFSETGAPTYPE')).toBe(0);
    expect(variables.getNumber('OSMODE')).toBe(4133);
    expect(variables.getNumber('TEXTSIZE')).toBe(2.5);
    expect(variables.getNumber('OFFSETDIST')).toBe(-1);
    expect(variables.getNumber('CMDACTIVE')).toBe(0);
    expect(variables.database.undoCount).toBe(0);
  });

  it('falls back to defaults on corrupt JSON and malformed roots', () => {
    for (const raw of ['{', 'null', '[]', '"invalid"', '42']) {
      const variables = new SystemVariables();
      expect(() => restoreProfileVariables(variables.profile, memoryStorage(raw))).not.toThrow();
      expect(variables.profile.values.size).toBe(0);
      expect(variables.getNumber('TRIMEXTENDMODE')).toBe(1);
      expect(variables.database.undoCount).toBe(0);
    }
  });

  it('serializes only validated profile values and unsubscribes cleanly', () => {
    const storage = memoryStorage();
    const variables = new SystemVariables();
    variables.profile.values.set('TEXTSIZE', 9);
    variables.profile.values.set('OFFSETDIST', 9);
    variables.profile.values.set('OSMODE', 'invalid');
    variables.profile.values.set('CMDACTIVE', 9);
    variables.profile.values.set('UNKNOWN_PROFILE', 9);
    const unsubscribe = subscribeProfileVariables(variables.profile, storage);
    variables.set('EDGEMODE', 1);
    expect(JSON.parse(storage.getItem(profileStorageKey) ?? '{}')).toEqual({ EDGEMODE: 1 });
    unsubscribe();
    const writes = storage.setItem.mock.calls.length;
    variables.set('EDGEMODE', 0);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
    expect(variables.profile.events.failures).toEqual([]);
  });

  it('keeps the application usable when preference reads or writes are denied', () => {
    const storage = {
      getItem: () => {
        throw new Error('Storage denied');
      },
      setItem: () => {
        throw new Error('Storage denied');
      },
    };
    vi.stubGlobal('localStorage', storage);
    const variables = new SystemVariables();
    expect(() => restoreProfileVariables(variables.profile)).not.toThrow();
    const unsubscribe = subscribeProfileVariables(variables.profile);
    expect(() => variables.set('TRIMEXTENDMODE', 0)).not.toThrow();
    expect(() => persistProfileVariables(variables.profile)).not.toThrow();
    expect(variables.getNumber('TRIMEXTENDMODE')).toBe(0);
    expect(variables.profile.events.failures).toEqual([]);
    expect(variables.database.undoCount).toBe(0);
    unsubscribe();
  });
});
