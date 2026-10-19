import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  SystemVariables,
  SystemVariableError,
  getSystemVariableDefinition,
  systemVariableDefinitions,
  dxfHeaderVariableDefinitions,
  validateSystemVariable,
} from './index';
import { loadSystemVariableDefinition } from './definition';
import { DrawingDatabase } from '@hancad/db';

describe('Autodesk-sourced declarative catalog', () => {
  it('exceeds the phase target with distinct sourced variables and explicit unresolved initial values', () => {
    expect(systemVariableDefinitions.length).toBeGreaterThanOrEqual(500);
    expect(new Set(systemVariableDefinitions.map((variable) => variable.name)).size).toBe(
      systemVariableDefinitions.length,
    );
    for (const definition of systemVariableDefinitions) {
      expect(definition.source.url).toMatch(/^https:\/\/help\.autodesk\.com\/cloudhelp\/2026\//);
      expect(definition.description).toMatch(/[가-힣]/);
      if (definition.default === undefined) expect(definition.defaultUnavailable).toBeTruthy();
      else
        expect(
          () => validateSystemVariable(definition, definition.default),
          definition.name,
        ).not.toThrow();
    }
    expect(
      systemVariableDefinitions.filter((variable) => variable.default !== undefined).length,
    ).toBeGreaterThanOrEqual(500);
    expect(dxfHeaderVariableDefinitions).toHaveLength(214);
    expect(new Set(dxfHeaderVariableDefinitions.map((header) => header.name)).size).toBe(214);
    for (const header of dxfHeaderVariableDefinitions) {
      expect(header.codes.length).toBeGreaterThan(0);
      if (header.systemVariable)
        expect(getSystemVariableDefinition(header.systemVariable)).toBeDefined();
    }
  });

  it('uses metric defaults, current canonical names and documented scope/read-only corrections', () => {
    const variables = new SystemVariables();
    const defaults = {
      INSUNITS: 4,
      MEASUREMENT: 1,
      DIMSTYLE: 'ISO-25',
      LUNITS: 2,
      LUPREC: 4,
      GRIDUNIT: [10, 10],
      SNAPUNIT: [10, 10],
      LIMMAX: [420, 297],
      GRIPS: 2,
      SELECTIONCYCLING: 0,
      SELECTIONPREVIEWLIMIT: 20000,
      PREVIEWFILTER: 3,
      GRIPMULTIFUNCTIONAL: 3,
      GRIPTIPS: 1,
      FONTALT: 'simplex.shx',
      FONTMAP: 'acad.fmp',
      ISAVEBAK: 1,
      DIMDSEP: 44,
    };
    for (const [name, value] of Object.entries(defaults))
      expect(variables.get(name), name).toEqual(value);
    expect(getSystemVariableDefinition('ISAVEBACK')).toBeUndefined();
    expect(getSystemVariableDefinition('INPUTSEARCHOPTIONS')).toBeUndefined();
    expect(getSystemVariableDefinition('CIRCLERAD')?.scope).toBe('session');
    expect(() => variables.set('DIMSTYLE', 'Standard')).toThrow('읽기 전용');
    expect(() => variables.set('OSMODE', 99999)).toThrow(SystemVariableError);
    variables.set('COORDS', 3);
    variables.set('PICKADD', 3);
    for (let index = 1; index <= 5; index++) {
      variables.set(`USERI${index}`, index);
      variables.set(`USERR${index}`, index + 0.5);
      expect(variables.get(`USERI${index}`)).toBe(index);
      expect(variables.get(`USERR${index}`)).toBe(index + 0.5);
    }
  });

  it('validates documented discrete lineweights, combined flags and positive numeric boundaries', () => {
    const variables = new SystemVariables();
    variables.set('CELWEIGHT', 53);
    variables.set('DIMLWD', -2);
    variables.set('LWDEFAULT', 25);
    expect(() => variables.set('CELWEIGHT', 54)).toThrow(SystemVariableError);
    expect(() => variables.set('LWDEFAULT', -1)).toThrow(SystemVariableError);
    variables.set('DIMZIN', 5);
    variables.set('DIMALTZ', 15);
    variables.set('PDMODE', 34);
    expect(() => variables.set('DIMZIN', 16)).toThrow(SystemVariableError);
    expect(() => variables.set('LTSCALE', 0)).toThrow(SystemVariableError);
    expect(() => variables.set('TEXTSIZE', 0)).toThrow(SystemVariableError);
    expect(() => variables.set('FACETRES', 0.001)).toThrow(SystemVariableError);
    variables.set('FACETRES', 0.5);
  });

  it('accepts documented bit sums and rejects sparse-mask gaps without confusing variable names', () => {
    const variables = new SystemVariables();
    for (const value of [3, 17, 63]) {
      variables.set('AFLAGS', value);
      expect(variables.get('AFLAGS')).toBe(value);
    }
    expect(() => variables.set('AFLAGS', 64)).toThrow(SystemVariableError);
    expect(getSystemVariableDefinition('RE')).toBeUndefined();
    expect(getSystemVariableDefinition('RE-INIT')?.bitmask).toBe(21);
    variables.set('RE-INIT', 5);
    variables.set('RE-INIT', 21);
    expect(() => variables.set('RE-INIT', 2)).toThrow(SystemVariableError);
    for (const name of ['UCSICON', 'RECOVERAUTO', 'SMOOTHMESHCONVERT']) {
      variables.set(name, 3);
      expect(() => variables.set(name, 4)).toThrow(SystemVariableError);
    }
    const mode = variables.getNumber('3DOSMODE');
    expect(variables.toggle('3DOSMODE')).toBe(mode ^ 1);
    expect(variables.toggle('3DOSMODE')).toBe(mode);
    for (const definition of systemVariableDefinitions) {
      if (definition.bitmask === undefined) continue;
      expect(definition.enum, definition.name).toBeUndefined();
      for (const value of [0, definition.bitmask])
        expect(() => validateSystemVariable(definition, value), definition.name).not.toThrow();
      expect(() => validateSystemVariable(definition, 2 ** 32), definition.name).toThrow(
        SystemVariableError,
      );
    }
  });

  it('keeps environment-dependent defaults unavailable and honors validated live read-only providers', () => {
    const variables = new SystemVariables();
    expect(() => variables.get('SAVEFILEPATH')).toThrow('아직 확인할 수 없습니다');
    expect(() => variables.get('DWGPREFIX')).toThrow('아직 확인할 수 없습니다');
    variables.set('SAVEFILEPATH', 'C:/User selected path');
    expect(variables.get('SAVEFILEPATH')).toBe('C:/User selected path');
    const live = new SystemVariables({
      runtimeValues: () => ({ DWGNAME: '사용자 도면.hcd', DWGPREFIX: 'C:/Local/', DWGTITLED: 1 }),
    });
    expect(live.get('DWGNAME')).toBe('사용자 도면.hcd');
    expect(live.get('DWGPREFIX')).toBe('C:/Local/');
    expect(live.get('DWGTITLED')).toBe(1);
    expect(() =>
      new SystemVariables({ runtimeValues: () => ({ DWGTITLED: 9 }) }).get('DWGTITLED'),
    ).toThrow(SystemVariableError);
    expect(() =>
      new SystemVariables({ runtimeValues: () => ({ OSMODE: 9 }) }).get('OSMODE'),
    ).not.toThrow();
    const database = new DrawingDatabase(),
      scoped = new SystemVariables({ database });
    expect(scoped.get('HANDSEED')).toBe(database.handseed);
    expect(scoped.get('UNDOCTL')).toBe(database.undoControl);
    const events: number[] = [];
    scoped.events.subscribe((event) => {
      if (event.name === 'UNDOCTL' && typeof event.value === 'number') events.push(event.value);
    });
    database.beginUndoGroup();
    expect(scoped.get('UNDOCTL')).toBe(61);
    database.endUndoGroup();
    expect(events).toContain(61);
    expect(events.at(-1)).toBe(53);
  });

  it('updates validated read-only command session state without permitting SETVAR or drawing writes', () => {
    const variables = new SystemVariables(),
      before = variables.database.serialize();
    variables.setRuntimeSessionValue('cmdactive', 1);
    variables.setRuntimeSessionValue('cmdnames', 'LINE');
    expect(variables.get('CMDACTIVE')).toBe(1);
    expect(variables.get('CMDNAMES')).toBe('LINE');
    expect(() => variables.set('CMDACTIVE', 0)).toThrow(SystemVariableError);
    expect(() => variables.setRuntimeSessionValue('CMDACTIVE', 128)).toThrow(SystemVariableError);
    expect(variables.get('CMDACTIVE')).toBe(1);
    for (const name of ['HANDSEED', 'UNDOCTL', 'OSMODE', 'LUPREC'])
      expect(() => variables.setRuntimeSessionValue(name, 0)).toThrow(SystemVariableError);
    variables.setRuntimeSessionValue('CMDACTIVE', 0);
    variables.setRuntimeSessionValue('CMDNAMES', '');
    expect(variables.database.serialize()).toBe(before);
    expect(variables.database.undoCount).toBe(0);
  });

  it('resolves documented symbolic settings and applies the explicit metric startup policy', () => {
    const variables = new SystemVariables(),
      peer = new SystemVariables({ profile: variables.profile });
    expect(variables.get('HPDRAWMODE')).toBe(0);
    expect(variables.get('HPPATHALIGNMENT')).toBe(1);
    expect(variables.get('MEASUREINIT')).toBe(1);
    const metric = getSystemVariableDefinition('MEASUREINIT');
    expect(metric?.source.initial).toBe('Varies by country/region');
    expect(metric?.defaultPolicy).toContain("HanCAD's metric startup policy");
    for (const name of ['HPLAYER', 'HPTRANSPARENCY', 'MLEADERLAYER', 'XREFLAYER']) {
      expect(variables.get(name)).toBe('.');
      expect(getSystemVariableDefinition(name)?.source.initial).toBe('use current');
      expect(getSystemVariableDefinition(name)?.defaultUnavailable).toBeUndefined();
    }
    variables.set('HPDRAWMODE', 1);
    variables.set('HPPATHALIGNMENT', 3);
    variables.set('MEASUREINIT', 0);
    expect(peer.get('HPDRAWMODE')).toBe(1);
    expect(peer.get('HPPATHALIGNMENT')).toBe(3);
    expect(peer.get('MEASUREINIT')).toBe(0);
    for (const [name, value] of [
      ['HPDRAWMODE', 2],
      ['HPPATHALIGNMENT', 0],
      ['HPPATHALIGNMENT', 4],
      ['MEASUREINIT', 2],
    ] as const)
      expect(() => variables.set(name, value)).toThrow(SystemVariableError);
    expect(variables.database.undoCount).toBe(0);
    expect(systemVariableDefinitions).toHaveLength(875);
    expect(
      systemVariableDefinitions.filter((definition) => definition.default !== undefined),
    ).toHaveLength(813);
    expect(
      systemVariableDefinitions.filter((definition) => definition.default === undefined),
    ).toHaveLength(62);
  });

  it('restores the use-current drawing sentinel through undo and redo without observer errors', () => {
    const variables = new SystemVariables(),
      peer = new SystemVariables({ profile: variables.profile }),
      events: unknown[] = [];
    variables.events.subscribe((event) => events.push(event));
    variables.set('HPLAYER', 'User supplied hatch layer');
    expect(peer.get('HPLAYER')).toBe('.');
    variables.database.undo();
    expect(variables.get('HPLAYER')).toBe('.');
    expect(events).toContainEqual({ name: 'HPLAYER', value: '.' });
    expect(variables.database.events.failures).toHaveLength(0);
    variables.database.redo();
    expect(variables.get('HPLAYER')).toBe('User supplied hatch layer');
  });

  it('publishes an unresolved value after undo without recording an observer failure', () => {
    const variables = new SystemVariables(),
      events: unknown[] = [];
    variables.events.subscribe((event) => events.push(event));
    const model = variables.database.find('LAYOUT', 'Model')?.handle;
    expect(() => variables.set('CLAYOUT', 'Model*FF')).toThrow(SystemVariableError);
    variables.set('CLAYOUT', `*${model}`);
    expect(variables.get('CLAYOUT')).toBe(`Model*${model}`);
    variables.database.undo();
    expect(events).toContainEqual({ name: 'CLAYOUT', value: undefined });
    expect(variables.database.events.failures).toHaveLength(0);
    expect(() => variables.get('CLAYOUT')).toThrow(SystemVariableError);
    variables.database.redo();
    expect(variables.get('CLAYOUT')).toBe(`Model*${model}`);
  });

  it('deeply freezes catalog metadata and reproduces the checked-in documentation without network access', () => {
    const definition = getSystemVariableDefinition('OSMODE');
    expect(definition).toBeDefined();
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition?.bits)).toBe(true);
    expect(() =>
      loadSystemVariableDefinition({
        name: 'FILLER',
        type: 'integer',
        scope: 'drawing',
        description: '가짜',
      }),
    ).toThrow();
    const result = spawnSync(process.execPath, ['scripts/generate-sysvars.mjs', '--check'], {
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    const markdown = readFileSync(new URL('../../../docs/SYSVARS.md', import.meta.url), 'utf8');
    for (const definition of systemVariableDefinitions)
      expect(markdown).toContain(`| ${definition.name} `);
    expect(markdown).toContain('Environment/document-dependent');
  });
});
