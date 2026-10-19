import { describe, expect, it, vi } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { CommandRegistry, HeadlessCommandRunner } from '@hancad/commands';
import { SystemVariables } from '@hancad/sysvars';
import { builtinLinetypes, linetypeFromFields } from '@hancad/render';
import { parseColorValue } from './color-values';
import { LinetypeLibrary, loadLinetypes, deleteLinetype } from './linetype-library';
import { registerStyleCommands } from './register-style-commands';

function fixture() {
  const database = new DrawingDatabase(),
    sysvars = new SystemVariables({ database });
  const registry = new CommandRegistry(),
    runner = new HeadlessCommandRunner({ database, sysvars, registry });
  const dialogs = { color: vi.fn(), linetype: vi.fn(), lineweight: vi.fn(), transparency: vi.fn() };
  const library = new LinetypeLibrary();
  registerStyleCommands(
    { database, sysvars, registry, locale: 'ko-KR', print: vi.fn(), focus: vi.fn() },
    dialogs,
    library,
  );
  return { database, sysvars, runner, dialogs, library, registry };
}
describe('Phase 08 style commands', () => {
  it('routes dialogs and hyphen command prompts through the same canonical registry', async () => {
    const { runner, dialogs, registry, database, sysvars } = fixture();
    await runner.run('COLOR');
    await runner.run('LINETYPE');
    await runner.run('LWEIGHT');
    expect(dialogs.color).toHaveBeenCalledOnce();
    expect(dialogs.linetype).toHaveBeenCalledOnce();
    expect(dialogs.lineweight).toHaveBeenCalledOnce();
    const definition = registry.get('LINETYPE')!;
    const state = {
      database,
      sysvars,
      locale: 'ko-KR' as const,
      prefixes: { global: false, builtin: false, transparent: false, commandLine: true },
    };
    expect(definition.nextPrompt?.([], state)?.prompt).toContain('로드(L)');
    expect(definition.nextPrompt?.(['Load', 'DASHED'], state)?.text).toBe(true);
    expect(definition.nextPrompt?.(['Load', 'DASHED', '', ''], state)).toBeUndefined();
  });
  it('sets color names, true color and HSL, keeps Color Books explicit, and journals Undo', async () => {
    const { runner, sysvars } = fixture();
    await runner.run('-COLOR', ['Red']);
    expect(sysvars.get('CECOLOR')).toBe('1');
    await runner.run('-COLOR', ['T', '20,40,60']);
    expect(sysvars.get('CECOLOR')).toBe('RGB:20,40,60');
    await runner.run('-COLOR', ['HSL:120,100,50']);
    expect(sysvars.get('CECOLOR')).toBe('RGB:0,255,0');
    const result = await runner.run('-COLOR', ['CO']);
    expect(result.messages.join()).toContain('아직 지원');
    expect(sysvars.get('CECOLOR')).toBe('RGB:0,255,0');
    await runner.run('U');
    expect(sysvars.get('CECOLOR')).toBe('RGB:20,40,60');
    for (const invalid of ['RGB:256,0,0', 'RGB:1,,2', 'HSL:0,101,50', '-1'])
      expect(() => parseColorValue(invalid)).toThrow();
  });
  it('loads and sets standard linetypes as a single undo entry and protects referenced records', async () => {
    const { runner, database, sysvars } = fixture();
    const result = await runner.run('-LINETYPE', [
      'L',
      'DASHED,HIDDEN',
      'hancadiso.lin',
      'S',
      'DASHED',
      '',
    ]);
    expect(result.status).toBe('ok');
    expect(database.undoCount).toBe(1);
    expect(sysvars.get('CELTYPE')).toBe('DASHED');
    expect(deleteLinetype(database, 'DASHED')).toBe(false);
    expect(deleteLinetype(database, 'CONTINUOUS')).toBe(false);
    await runner.run('U');
    expect(database.find('LTYPE', 'DASHED')).toBeUndefined();
    expect(sysvars.get('CELTYPE')).toBe('BYLAYER');
    await runner.run('REDO');
    expect(database.find('LTYPE', 'HIDDEN')).toBeDefined();
    expect(sysvars.get('CELTYPE')).toBe('DASHED');
  });
  it('loads user complex UTF-8 and CP949 libraries without losing complex definitions on recovery', async () => {
    const { library, runner, database } = fixture();
    const custom = '*HOT,온수\nA,10,-2,["온수",STANDARD,S=2,U=0,X=-1,Y=.5],-2';
    library.remember('custom.lin', new TextEncoder().encode(custom));
    expect((await runner.run('-LINETYPE', ['L', '*', 'custom.lin', ''])).status).toBe('ok');
    const record = database.find('LTYPE', 'HOT')!;
    expect(linetypeFromFields('HOT', record.fields).elements[2]?.complex?.value).toBe('온수');
    const restored = DrawingDatabase.deserialize(database.serialize());
    expect(restored.find('LTYPE', 'HOT')?.fields).toEqual(record.fields);
    const cp949 = Uint8Array.from([
      ...new TextEncoder().encode('*CUSTOM,'),
      0xc7,
      0xd1,
      0xb1,
      0xdb,
      ...new TextEncoder().encode('\nA,2,-1'),
    ]);
    expect(library.remember('korean.lin', cp949)[0]?.description).toBe('한글');
  });
  it('keeps imported metadata on reload while replacing the pattern', () => {
    const { database } = fixture();
    loadLinetypes(database, [builtinLinetypes().get('DASHED')!]);
    const dashed = database.find('LTYPE', 'DASHED')!;
    database.transaction('metadata', (tx) =>
      tx.modify(dashed.handle, (object) => {
        object.xdata.CUSTOM = [{ code: 1000, value: 'retained' }];
        object.groups.push({ code: 999, value: 'kept' });
      }),
    );
    loadLinetypes(database, [{ ...builtinLinetypes().get('DASHED')!, description: 'reloaded' }]);
    expect(database.find('LTYPE', 'DASHED')).toMatchObject({
      handle: dashed.handle,
      xdata: { CUSTOM: [{ code: 1000, value: 'retained' }] },
      groups: [{ code: 999, value: 'kept' }],
    });
  });
});
