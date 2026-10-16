import { describe, expect, it } from 'vitest';
import { parsePgp } from './pgp';
import { removePgpAlias, removePgpExternal, setPgpAlias, setPgpExternal } from './pgp-edit';

const sample = [
  '﻿; My acad.pgp',
  'NOTEPAD,   NOTEPAD,  1,*File to edit: ,',
  '',
  '; Aliases',
  'C,         *CIRCLE',
  'CO,        *COPY',
  'C,         *CIRCLE ; duplicate',
  '',
].join('\r\n');

describe('line-preserving PGP edits', () => {
  it('replaces the last definition of an alias and drops earlier duplicates', () => {
    const result = setPgpAlias(sample, 'c', 'circle');
    expect(result.startsWith('﻿; My acad.pgp\r\n')).toBe(true);
    expect(result.match(/^C,/gm)).toHaveLength(1);
    expect(result).toContain('; Aliases\r\nCO,');
    expect(result.endsWith('\r\n')).toBe(true);
    const redefined = setPgpAlias(sample, 'CO', 'COPYBASE');
    expect(parsePgp(redefined).aliases.find((entry) => entry.alias === 'CO')?.command).toBe(
      'COPYBASE',
    );
  });

  it('appends new aliases after the last alias line and keeps the trailing newline', () => {
    const result = setPgpAlias(sample, 'zz', 'zoom');
    const lines = result.split('\r\n');
    expect(lines.at(-2)).toBe('ZZ,      *ZOOM');
    expect(lines.at(-1)).toBe('');
    expect(setPgpAlias('', 'L', 'LINE')).toBe('L,       *LINE\n');
  });

  it('removes every definition of an alias and nothing else', () => {
    const result = removePgpAlias(sample, 'C');
    expect(parsePgp(result).aliases.map((entry) => entry.alias)).toEqual(['CO']);
    expect(result).toContain('; My acad.pgp');
    expect(removePgpAlias(sample, 'MISSING')).toBe(sample);
  });

  it('adds, redefines and removes external commands before the aliases', () => {
    const added = setPgpExternal(sample, {
      name: 'explorer',
      executable: 'START EXPLORER',
      flags: 1,
      prompt: 'Folder: ',
      allowSpaces: true,
    });
    const document = parsePgp(added);
    expect(document.externals.map((entry) => entry.name)).toEqual(['NOTEPAD', 'EXPLORER']);
    expect(added).toContain('EXPLORER, START EXPLORER, 1,*Folder: ,');
    const replaced = setPgpExternal(added, {
      name: 'NOTEPAD',
      executable: 'NOTEPAD',
      flags: 0,
      prompt: 'File: ',
      allowSpaces: false,
    });
    expect(parsePgp(replaced).externals[0]).toMatchObject({ name: 'NOTEPAD', flags: 0 });
    const removed = removePgpExternal(replaced, 'notepad');
    expect(parsePgp(removed).externals.map((entry) => entry.name)).toEqual(['EXPLORER']);
    const fresh = setPgpExternal('L, *LINE\n', {
      name: 'DIR',
      executable: 'DIR',
      flags: 8,
      prompt: 'File specification: ',
      allowSpaces: false,
    });
    expect(fresh.split('\n')[0]).toBe('DIR, DIR, 8,File specification: ,');
  });
});
