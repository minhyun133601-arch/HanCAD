import { reverseHangulInput } from '@hancad/input';
import { defaultAliases } from './aliases';
import type { CommandDefinition, CommandPrefixes, CommandResolution } from './types';

const transparentCommands = new Set(['ZOOM', 'PAN', 'CAL', 'DIST', 'SETVAR', 'OSNAP', 'GETVAR']);
const extraCommands = [
  'GETVAR',
  'SETVAR',
  'U',
  'UNDO',
  'REDO',
  'MREDO',
  'OOPS',
  'UNDEFINE',
  'REDEFINE',
  'NEW',
  'OPEN',
  'QSAVE',
  'SAVEAS',
  'HELP',
  'REINIT',
  'ALIASEDIT',
  'CAL',
  'CLOSE',
  'CLEANSCREENON',
  'CLEANSCREENOFF',
  'COPYCLIP',
  'COPYBASE',
  'CUTCLIP',
  'PASTECLIP',
  'PASTEBLOCK',
  'SELECT',
  'DBCONNECT',
  'MARKUP',
  'HYPERLINK',
  'QUICKPROPERTIES',
  'TABLET',
  'INFER',
];

export class CommandRegistry {
  private readonly definitions = new Map<string, CommandDefinition>();
  private readonly aliases = new Map<string, string>();
  private readonly undefinedCommands = new Set<string>();

  constructor() {
    for (const name of new Set([
      ...Object.values(defaultAliases).map((value) => parsePrefixes(value).name),
      ...extraCommands,
    ])) {
      this.register({
        name,
        displayName: { 'ko-KR': name, 'en-US': name },
        description: {
          'ko-KR': '후속 단계에서 구현 예정인 명령입니다.',
          'en-US': 'This command is planned for a later phase.',
        },
        flags: { transparent: transparentCommands.has(name) },
      });
    }
    for (const [alias, command] of Object.entries(defaultAliases)) this.aliases.set(alias, command);
  }

  register(definition: CommandDefinition): void {
    const name = definition.name.toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid canonical command: ${name}`);
    this.definitions.set(name, { ...definition, name });
    for (const alias of definition.aliases ?? []) this.aliases.set(alias.toUpperCase(), name);
  }

  get(name: string): CommandDefinition | undefined {
    return this.definitions.get(parsePrefixes(name).name);
  }
  get all(): readonly CommandDefinition[] {
    return [...this.definitions.values()];
  }

  resolve(input: string): CommandResolution | undefined {
    const token = reverseHangulInput(input.trim().split(/\s+/)[0] ?? '');
    const parsed = parsePrefixes(token);
    const aliasKey = parsed.prefixes.commandLine ? `-${parsed.name}` : parsed.name;
    const target = this.aliases.get(aliasKey) ?? this.aliases.get(parsed.name) ?? parsed.name;
    const canonical = parsePrefixes(target);
    const definition = this.definitions.get(canonical.name);
    if (!definition || (!parsed.prefixes.builtin && this.undefinedCommands.has(canonical.name)))
      return undefined;
    return {
      name: canonical.name,
      canonicalName: canonical.name,
      prefixes: {
        ...parsed.prefixes,
        commandLine: parsed.prefixes.commandLine || canonical.prefixes.commandLine,
      },
      definition,
    };
  }

  undefine(name: string): boolean {
    const resolution = this.resolve(`.${name}`);
    if (!resolution) return false;
    this.undefinedCommands.add(resolution.canonicalName);
    return true;
  }

  redefine(name: string): boolean {
    const resolution = this.resolve(`.${name}`);
    return resolution ? this.undefinedCommands.delete(resolution.canonicalName) : false;
  }

  importPgp(source: string): { imported: number; invalidLines: number[] } {
    let imported = 0;
    const invalidLines: number[] = [];
    source
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .forEach((line, index) => {
        const meaningful = line.split(';')[0]?.trim() ?? '';
        if (!meaningful) return;
        const match = /^([\w-]+)\s*,\s*\*\s*([\w-]+)\s*$/.exec(meaningful);
        if (!match?.[1] || !match[2]) {
          invalidLines.push(index + 1);
          return;
        }
        const alias = match[1].toUpperCase();
        const command = match[2].toUpperCase();
        const canonical = parsePrefixes(command).name;
        if (!this.definitions.has(canonical)) {
          this.register({
            name: canonical,
            displayName: { 'ko-KR': canonical, 'en-US': canonical },
            description: {
              'ko-KR': '사용자 별칭에서 등록한 미구현 명령입니다.',
              'en-US': 'Unimplemented command registered from a user alias.',
            },
          });
        }
        this.aliases.set(alias, command);
        imported++;
      });
    return { imported, invalidLines };
  }

  search(prefix: string): CommandDefinition[] {
    const query = reverseHangulInput(prefix);
    return this.all.filter((definition) => definition.name.startsWith(query));
  }
}

export function parsePrefixes(value: string): { name: string; prefixes: CommandPrefixes } {
  const prefixes: CommandPrefixes = {
    global: false,
    builtin: false,
    commandLine: false,
    transparent: false,
  };
  let offset = 0;
  for (const character of value) {
    if (character === '_') prefixes.global = true;
    else if (character === '.') prefixes.builtin = true;
    else if (character === '-') prefixes.commandLine = true;
    else if (character === "'") prefixes.transparent = true;
    else break;
    offset++;
  }
  return { name: value.slice(offset).toUpperCase(), prefixes };
}
