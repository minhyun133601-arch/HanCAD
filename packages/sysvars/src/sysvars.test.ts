import { describe, expect, it } from 'vitest';
import {
  DocumentManager,
  SystemVariables,
  generateSystemVariableMarkdown,
  systemVariableDefinitions,
} from './index';

describe('declarative system variables', () => {
  it('honors metric defaults and rejects invalid values before mutation', () => {
    const variables = new SystemVariables();
    expect(variables.get('osmode')).toBe(4133);
    expect(variables.get('INSUNITS')).toBe(4);
    expect(variables.get('DIMSTYLE')).toBe('ISO-25');
    expect(variables.get('TRIMEXTENDMODE')).toBe(1);
    expect(variables.get('EDGEMODE')).toBe(0);
    expect(() => variables.set('OSMODE', 99999)).toThrow('유효하지');
    expect(variables.get('OSMODE')).toBe(4133);
    expect(() => variables.set('LUPREC', 2.5)).toThrow();
    expect(() => variables.set('LUPREC', Number.NaN)).toThrow();
    expect(() => variables.set('CMDACTIVE', 2)).toThrow('읽기 전용');
    expect(() => variables.set('NONEXISTENT', 0)).toThrow('알 수 없는');
    variables.set('LUPREC', 2);
    expect(variables.get('LUPREC')).toBe(2);
    expect(variables.database.undo()).toBe(1);
    expect(variables.get('LUPREC')).toBe(4);
    variables.database.redo();
    expect(variables.get('LUPREC')).toBe(2);
  });

  it('shares profile variables while keeping drawing/session variables and undo independent', () => {
    const manager = new DocumentManager();
    const first = manager.create();
    const second = manager.create();
    expect(first.name).toBe('Drawing1.dwg');
    expect(second.name).toBe('Drawing2.dwg');
    first.sysvars.set('OSMODE', 32);
    expect(second.sysvars.get('OSMODE')).toBe(32);
    first.sysvars.set('LUPREC', 2);
    expect(second.sysvars.get('LUPREC')).toBe(4);
    first.sysvars.set('MODEMACRO', 'first');
    first.sysvars.set('OFFSETDIST', 12);
    expect(second.sysvars.get('OFFSETDIST')).toBe(-1);
    expect(second.sysvars.get('MODEMACRO')).toBe('');
    first.database.undo();
    expect(second.sysvars.get('OSMODE')).toBe(32);
    expect(first.sysvars.get('LUPREC')).toBe(4);
    manager.activate(first.id);
    expect(manager.active?.id).toBe(first.id);
    manager.close(first.id);
    expect(manager.active?.id).toBe(second.id);
    manager.close(second.id);
    expect(manager.active).toBeUndefined();
  });

  it('toggles object snap suppression without destroying selected snap flags', () => {
    const variables = new SystemVariables();
    variables.toggle('OSMODE');
    expect(variables.get('OSMODE')).toBe(4133 | 16384);
    variables.toggle('OSMODE');
    expect(variables.get('OSMODE')).toBe(4133);
    variables.toggle('GRIDMODE');
    expect(variables.get('GRIDMODE')).toBe(0);
    variables.toggle('DYNMODE');
    expect(variables.get('DYNMODE')).toBe(-3);
    variables.toggle('DYNMODE');
    expect(variables.get('DYNMODE')).toBe(3);
  });

  it('returns immutable value copies, validates point shape and generates every registered docs row', () => {
    const variables = new SystemVariables();
    const point = variables.get('GRIDUNIT');
    if (Array.isArray(point)) point[0] = 777;
    expect(variables.get('GRIDUNIT')).toEqual([10, 10]);
    expect(() => variables.set('GRIDUNIT', [1, Infinity])).toThrow();
    expect(variables.search('OSM').map((definition) => definition.name)).toEqual(['OSMODE']);
    const markdown = generateSystemVariableMarkdown();
    for (const definition of systemVariableDefinitions)
      expect(markdown).toContain(`| ${definition.name} |`);
    expect(new Set(systemVariableDefinitions.map((definition) => definition.name)).size).toBe(
      systemVariableDefinitions.length,
    );
  });

  it('rejects missing layer/style/linetype references without changing the drawing or journal', () => {
    const variables = new SystemVariables();
    const before = variables.database.serialize();
    for (const [name, value] of [
      ['CLAYER', 'Missing Layer'],
      ['TEXTSTYLE', 'Missing Style'],
      ['DIMSTYLE', 'Missing Dimstyle'],
      ['CELTYPE', 'Missing Linetype'],
    ] as const) {
      expect(() => variables.set(name, value)).toThrow('도면에 없습니다');
    }
    expect(variables.database.serialize()).toBe(before);
    expect(variables.database.undoCount).toBe(0);
    variables.set('CLAYER', '0');
    variables.set('TEXTSTYLE', 'standard');
    variables.set('DIMSTYLE', 'iso-25');
    variables.set('CELTYPE', 'bylayer');
    expect(variables.get('TEXTSTYLE')).toBe('Standard');
    expect(variables.get('DIMSTYLE')).toBe('ISO-25');
    expect(variables.get('CELTYPE')).toBe('BYLAYER');
  });
});
