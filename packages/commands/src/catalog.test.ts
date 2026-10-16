import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CommandRegistry,
  commandCatalog,
  defaultAliases,
  extendedAliases,
  formatPgp,
  parsePgp,
  parsePrefixes,
} from './index';

describe('command catalog metadata', () => {
  it('describes every registered command with Korean/English names, help and a phase', () => {
    expect(commandCatalog.size).toBeGreaterThanOrEqual(370);
    for (const entry of commandCatalog.values()) {
      expect(entry.globalName).toBe(entry.name);
      expect(entry.displayName['ko-KR'].length).toBeGreaterThan(0);
      expect(entry.description['ko-KR']).toMatch(/[가-힣]/);
      expect(entry.description['en-US']).toMatch(/^[A-Z]/);
      expect(entry.phase).toBeGreaterThanOrEqual(0);
      expect(entry.phase).toBeLessThanOrEqual(25);
    }
  });

  it('uses the glossary display names and ObjectARX-style flags', () => {
    const name = (command: string) => commandCatalog.get(command)?.displayName['ko-KR'];
    expect([name('LINE'), name('PLINE'), name('CIRCLE'), name('ARC')]).toEqual([
      '선',
      '폴리선',
      '원',
      '호',
    ]);
    expect([name('ZOOM'), name('PAN'), name('OFFSET'), name('MATCHPROP')]).toEqual([
      '줌',
      '초점이동',
      '간격띄우기',
      '특성 일치',
    ]);
    expect([name('DIMLINEAR'), name('TEXT'), name('MTEXT'), name('U')]).toEqual([
      '선형',
      '단일 행 문자',
      '여러 줄 문자',
      '명령 취소',
    ]);
    expect(commandCatalog.get('ZOOM')?.flags).toMatchObject({ transparent: true, pickfirst: true });
    expect(commandCatalog.get('LINE')?.flags).toEqual({});
    expect(commandCatalog.get('OPTIONS')?.flags.modal).toBe(true);
    expect(commandCatalog.get('MOVE')?.flags.pickfirst).toBe(true);
    expect(commandCatalog.get('U')?.flags.noUndo).toBe(true);
    for (const transparent of ['CAL', 'DIST', 'SETVAR', 'OSNAP', 'PAN', 'HELP'])
      expect(commandCatalog.get(transparent)?.flags.transparent).toBe(true);
  });

  it('resolves every built-in alias to a catalog command', () => {
    for (const command of Object.values({ ...defaultAliases, ...extendedAliases }))
      expect(commandCatalog.has(parsePrefixes(command).name), command).toBe(true);
    const registry = new CommandRegistry();
    expect(registry.resolve('GCON')?.canonicalName).toBe('GEOMCONSTRAINT');
    expect(registry.resolve('DTEXT')?.canonicalName).toBe('TEXT');
    expect(registry.resolve('RECTANGLE')?.canonicalName).toBe('RECTANG');
    expect(registry.resolve('SE')?.canonicalName).toBe('DSETTINGS');
    expect(registry.resolve('ED')?.canonicalName).toBe('TEXTEDIT');
    expect(registry.resolve('-AR')?.prefixes.commandLine).toBe(true);
    expect(registry.aliasesFor('COPY')).toEqual(['CO', 'CP']);
  });

  it('lists every catalog command and alias in docs/COMMANDS.md', () => {
    const doc = readFileSync(new URL('../../../docs/COMMANDS.md', import.meta.url), 'utf8');
    const table = doc.slice(0, doc.indexOf('\n## '));
    const rows = new Map<string, string>();
    for (const match of table.matchAll(/^\| ([A-Z0-9_]+) +\| ([^|]*)\|/gm))
      if (match[1] && match[2] !== undefined) rows.set(match[1], match[2]);
    for (const name of commandCatalog.keys()) expect(rows.has(name), name).toBe(true);
    const registry = new CommandRegistry();
    for (const entry of registry.aliasEntries()) {
      const row = rows.get(parsePrefixes(entry.command).name) ?? '';
      expect(
        row.split(',').map((item) => item.trim()),
        entry.alias,
      ).toContain(entry.alias);
    }
  });
});

describe('PGP files', () => {
  it('parses aliases, external commands, comments and malformed lines', () => {
    const document = parsePgp(
      [
        '﻿; header',
        'NOTEPAD,   START NOTEPAD,  1,*File to edit: ,',
        'CATALOG,   DIR /W,  8,File specification: ,',
        'SH,        ,        1,*OS Command: ,',
        '-LA,  *-LAYER',
        'l , * line  ; trailing comment',
        'BAD LINE',
        'X,*',
      ].join('\r\n'),
    );
    expect(document.aliases).toEqual([
      { alias: '-LA', command: '-LAYER', line: 5 },
      { alias: 'L', command: 'LINE', line: 6 },
    ]);
    expect(document.externals.map((item) => [item.name, item.flags, item.allowSpaces])).toEqual([
      ['NOTEPAD', 1, true],
      ['CATALOG', 8, false],
      ['SH', 1, true],
    ]);
    expect(document.externals[0]?.prompt).toBe('File to edit: ');
    expect(document.invalidLines).toEqual([7, 8]);
    const text = formatPgp(document.aliases, document.externals, ['HanCAD aliases']);
    expect(parsePgp(text).aliases.map((item) => [item.alias, item.command])).toEqual([
      ['-LA', '-LAYER'],
      ['L', 'LINE'],
    ]);
    expect(parsePgp(text).externals).toHaveLength(3);
  });

  it('lets the user file win, reloads it on REINIT and keeps removed built-ins hidden', () => {
    const registry = new CommandRegistry();
    registry.importPgp('C, *COPY\nQQ, *QSAVE\nNOTEPAD, START NOTEPAD, 1,*File to edit: ,');
    expect(registry.resolve('C')?.canonicalName).toBe('COPY');
    expect(registry.resolve('QQ')?.canonicalName).toBe('QSAVE');
    expect(registry.external('notepad')?.executable).toBe('START NOTEPAD');
    registry.reloadPgp('QQ, *QUIT', ['Z']);
    expect(registry.resolve('C')?.canonicalName).toBe('CIRCLE');
    expect(registry.resolve('QQ')?.canonicalName).toBe('QUIT');
    expect(registry.resolve('Z')).toBeUndefined();
    expect(registry.resolve('ZOOM')?.canonicalName).toBe('ZOOM');
    expect(registry.external('NOTEPAD')).toBeUndefined();
    expect(registry.aliasEntries().find((entry) => entry.alias === 'QQ')?.source).toBe('user');
    registry.reloadPgp(undefined);
    expect(registry.resolve('Z')?.canonicalName).toBe('ZOOM');
  });

  it('loads AutoCorrect entries below aliases and ignores unknown targets', () => {
    const registry = new CommandRegistry();
    expect(registry.loadCorrections('CRIRCLE, *CIRCLE\nWPIOUT, *WIPEOUT\nXYZ, *NOPE')).toBe(2);
    expect(registry.resolve('CRIRCLE')?.canonicalName).toBe('CIRCLE');
    registry.importPgp('CRIRCLE, *COPY');
    expect(registry.resolve('CRIRCLE')?.canonicalName).toBe('COPY');
  });

  it('keeps catalog help authoritative when an implementation registers', () => {
    const registry = new CommandRegistry();
    registry.register({
      name: 'LINE',
      displayName: { 'ko-KR': 'x', 'en-US': 'x' },
      description: { 'ko-KR': 'x', 'en-US': 'x' },
      execute: () => undefined,
    });
    const line = registry.get('LINE');
    expect(line?.displayName['ko-KR']).toBe('선');
    expect(line?.phase).toBe(4);
    expect(line?.execute).toBeTypeOf('function');
  });
});
