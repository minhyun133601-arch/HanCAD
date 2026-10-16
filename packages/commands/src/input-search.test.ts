import { describe, expect, it } from 'vitest';
import { CommandRegistry } from './registry';
import {
  defaultInputSearchOptions,
  editDistance,
  inlineCompletion,
  normalizeInputSearchOptions,
  suggestCommandInput,
} from './input-search';
import type { InputSearchOptions } from './input-search';

const options = (overrides: Partial<InputSearchOptions> = {}): InputSearchOptions => ({
  ...defaultInputSearchOptions,
  ...overrides,
});
const names = (registry: CommandRegistry, input: string, extra: Partial<InputSearchOptions> = {}) =>
  suggestCommandInput(registry, { input, options: options(extra) }).items.map((item) => item.name);

describe('input search options', () => {
  it('defaults to AutoCAD settings with every content type enabled in order', () => {
    expect(normalizeInputSearchOptions(undefined)).toEqual(defaultInputSearchOptions);
    expect(defaultInputSearchOptions.contentTypes.map((item) => item.type)).toEqual([
      'block',
      'layer',
      'hatch',
      'visualStyle',
      'textStyle',
      'dimStyle',
    ]);
  });

  it('keeps valid stored values, user content order and clamps the threshold', () => {
    const result = normalizeInputSearchOptions({
      autoComplete: false,
      sortByUsage: false,
      correctionThreshold: 250,
      contentTypes: [
        { type: 'layer', enabled: false },
        { type: 'bogus', enabled: true },
        { type: 'block' },
      ],
    });
    expect(result).toMatchObject({ autoComplete: false, sortByUsage: false });
    expect(result.correctionThreshold).toBe(99);
    expect(result.contentTypes.slice(0, 3)).toEqual([
      { type: 'layer', enabled: false },
      { type: 'block', enabled: true },
      { type: 'hatch', enabled: true },
    ]);
    expect(normalizeInputSearchOptions({ correctionThreshold: 1.5 }).correctionThreshold).toBe(3);
  });
});

describe('command line suggestions', () => {
  const registry = new CommandRegistry();

  it('lists OSMODE for OSM and treats a complete name as exact', () => {
    expect(names(registry, 'OSM')).toContain('OSMODE');
    const exact = suggestCommandInput(registry, { input: 'osmode', options: options() });
    expect(exact.exact).toBe(true);
    expect(exact.items[0]).toMatchObject({ kind: 'sysvar', name: 'OSMODE', match: 'exact' });
  });

  it('puts an alias target first and keeps the typed alias as the submitted text', () => {
    const result = suggestCommandInput(registry, { input: 'C', options: options() });
    expect(result.exact).toBe(true);
    expect(result.items[0]).toEqual({
      kind: 'command',
      name: 'CIRCLE',
      text: 'C',
      match: 'exact',
    });
  });

  it('reverses Hangul and keeps typed prefixes on suggestions', () => {
    expect(names(registry, 'ㅣㅑㅜ')[0]).toBe('LINE');
    const result = suggestCommandInput(registry, { input: '_circ', options: options() });
    expect(result.items[0]).toMatchObject({ name: 'CIRCLE', text: '_CIRCLE', match: 'prefix' });
  });

  it('orders prefix before mid-string matches, then by usage or alphabetically', () => {
    const alphabetical = names(registry, 'LINE', { sortByUsage: false });
    expect(alphabetical[0]).toBe('LINE');
    const prefix = alphabetical.filter((name) => name.startsWith('LINE'));
    expect(prefix).toEqual([...prefix].sort());
    expect(alphabetical.indexOf('PLINE')).toBeGreaterThan(alphabetical.indexOf(prefix.at(-1)!));
    const byUsage = suggestCommandInput(registry, {
      input: 'ISO',
      options: options(),
      usage: (name) => (name === 'ISOLATEOBJECTS' ? 5 : 0),
    });
    expect(byUsage.items[0]?.name).toBe('ISOLATEOBJECTS');
    expect(names(registry, 'ISO', { sortByUsage: false })[0]).toBe('ISODRAFT');
  });

  it('honors mid-string, AutoComplete, AutoCorrect and system-variable switches', () => {
    expect(names(registry, 'LINE')).toContain('PLINE');
    // PLINE is one edit away, so AutoCorrect would still offer it.
    expect(names(registry, 'LINE', { midString: false, autoCorrect: false })).not.toContain(
      'PLINE',
    );
    expect(
      suggestCommandInput(registry, {
        input: 'LINE',
        options: options({ midString: false }),
      }).items.find((item) => item.name === 'PLINE')?.match,
    ).toBe('correction');
    expect(names(registry, 'OSM', { systemVariables: false })).not.toContain('OSMODE');
    expect(names(registry, 'CIRLCE')).toContain('CIRCLE');
    expect(names(registry, 'CIRLCE', { autoCorrect: false })).toEqual([]);
    expect(names(registry, 'CIRC', { autoComplete: false })).toEqual([]);
  });

  it('separates system variables into a second list when requested', () => {
    const result = suggestCommandInput(registry, {
      input: 'OSM',
      options: options({ separateSystemVariables: true }),
    });
    expect(result.items.some((item) => item.kind === 'sysvar')).toBe(false);
    expect(result.variables.map((item) => item.name)).toContain('OSMODE');
  });

  it('suggests only transparent commands and system variables inside a command', () => {
    expect(
      suggestCommandInput(registry, { input: 'ZO', options: options(), commandActive: true }).items,
    ).toEqual([]);
    const transparent = suggestCommandInput(registry, {
      input: "'ZO",
      options: options(),
      commandActive: true,
    });
    expect(transparent.items[0]).toMatchObject({ name: 'ZOOM', text: "'ZOOM" });
    expect(transparent.items.every((item) => item.kind === 'sysvar' || item.name !== 'LINE')).toBe(
      true,
    );
  });

  it('omits UNDEFINEd commands and returns nothing for coordinates or arguments', () => {
    const local = new CommandRegistry();
    local.undefine('LINE');
    expect(names(local, 'LINE')).not.toContain('LINE');
    expect(names(local, '10,20')).toEqual([]);
    expect(names(local, 'ZOOM E')).toEqual([]);
  });

  it('appends the rest of the top prefix suggestion from the second character', () => {
    const at = (input: string, extra: Partial<InputSearchOptions> = {}) =>
      inlineCompletion(
        suggestCommandInput(registry, { input, options: options(extra) }),
        options(extra),
      );
    expect(at('CIR')).toBe('CLE');
    expect(at('Q')).toBe('');
    expect(at('L')).toBe('');
    expect(at('CIR', { autoComplete: false })).toBe('');
  });
});

describe('edit distance', () => {
  it('counts insertions, deletions, substitutions and adjacent transpositions', () => {
    expect(editDistance('LINE', 'LINE')).toBe(0);
    expect(editDistance('LIEN', 'LINE')).toBe(1);
    expect(editDistance('OFSET', 'OFFSET')).toBe(1);
    expect(editDistance('CIRLE', 'CIRCLE')).toBe(1);
    expect(editDistance('MOVE', 'MIRROR')).toBeGreaterThan(2);
    expect(editDistance('A', 'ABCDEFG', 2)).toBe(3);
  });
});
