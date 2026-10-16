import { reverseHangulInput } from '@hancad/input';
import { defaultAliases } from './aliases';
import { extendedAliases } from './aliases-extended';
import { commandCatalog } from './catalog';
import { parsePgp } from './pgp';
import type { PgpExternalCommand } from './pgp';
import type { CommandDefinition, CommandPrefixes, CommandResolution } from './types';

export type AliasSource = 'builtin' | 'user' | 'autocorrect';
export interface AliasEntry {
  alias: string;
  command: string;
  source: AliasSource;
}
export interface PgpLoadReport {
  imported: number;
  invalidLines: number[];
  externals: number;
}

export class CommandRegistry {
  private readonly definitions = new Map<string, CommandDefinition>();
  private readonly builtinAliases = new Map<string, string>();
  private readonly userAliases = new Map<string, string>();
  private readonly correctionAliases = new Map<string, string>();
  private readonly removedAliases = new Set<string>();
  private readonly externals = new Map<string, PgpExternalCommand>();
  private readonly undefinedCommands = new Set<string>();

  constructor() {
    for (const entry of commandCatalog.values())
      this.definitions.set(entry.name, {
        name: entry.name,
        globalName: entry.globalName,
        displayName: entry.displayName,
        description: entry.description,
        flags: entry.flags,
        phase: entry.phase,
      });
    for (const [alias, command] of Object.entries({ ...extendedAliases, ...defaultAliases }))
      this.builtinAliases.set(alias, command);
    for (const command of this.builtinAliases.values()) this.ensureCommand(command, 'builtin');
  }

  /** Registers an implementation; catalog metadata stays authoritative for names and help. */
  register(definition: CommandDefinition): void {
    const name = definition.name.toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid canonical command: ${name}`);
    const catalog = commandCatalog.get(name);
    const existing = this.definitions.get(name);
    const merged: CommandDefinition = {
      ...existing,
      ...definition,
      name,
      globalName: name,
      displayName: catalog?.displayName ?? definition.displayName,
      description: catalog?.description ?? definition.description,
      flags: { ...existing?.flags, ...catalog?.flags, ...definition.flags },
    };
    const phase = catalog?.phase ?? definition.phase ?? existing?.phase;
    if (phase !== undefined) merged.phase = phase;
    this.definitions.set(name, merged);
    for (const alias of definition.aliases ?? [])
      this.builtinAliases.set(alias.toUpperCase(), name);
  }

  get(name: string): CommandDefinition | undefined {
    return this.definitions.get(parsePrefixes(name).name);
  }
  get all(): readonly CommandDefinition[] {
    return [...this.definitions.values()];
  }

  /** Effective alias target; user PGP entries win over built-in ones, corrections come last. */
  alias(name: string): string | undefined {
    const key = name.toUpperCase();
    return (
      this.userAliases.get(key) ??
      (this.removedAliases.has(key) ? undefined : this.builtinAliases.get(key)) ??
      this.correctionAliases.get(key)
    );
  }

  resolve(input: string): CommandResolution | undefined {
    const token = reverseHangulInput(input.trim().split(/\s+/)[0] ?? '');
    const parsed = parsePrefixes(token);
    const aliasKey = parsed.prefixes.commandLine ? `-${parsed.name}` : parsed.name;
    const target =
      (parsed.prefixes.commandLine ? this.alias(aliasKey) : undefined) ??
      this.alias(parsed.name) ??
      parsed.name;
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

  /** Adds user PGP entries to the current set (the last definition of an alias wins). */
  importPgp(source: string): PgpLoadReport {
    const document = parsePgp(source);
    for (const entry of document.aliases) {
      this.ensureCommand(entry.command, 'user');
      this.userAliases.set(entry.alias, entry.command);
      this.removedAliases.delete(entry.alias);
    }
    for (const external of document.externals) this.externals.set(external.name, external);
    return {
      imported: document.aliases.length,
      invalidLines: document.invalidLines,
      externals: document.externals.length,
    };
  }

  /** REINIT: discards user PGP state, then reloads the user's file over the built-in table. */
  reloadPgp(source: string | undefined, removed: Iterable<string> = []): PgpLoadReport {
    this.userAliases.clear();
    this.externals.clear();
    this.removedAliases.clear();
    for (const alias of removed) this.removedAliases.add(alias.toUpperCase());
    return source === undefined
      ? { imported: 0, invalidLines: [], externals: 0 }
      : this.importPgp(source);
  }

  /** AutoCorrectUserDB.pgp entries: misspelling, *command. */
  loadCorrections(source: string): number {
    this.correctionAliases.clear();
    const document = parsePgp(source);
    for (const entry of document.aliases)
      if (this.definitions.has(parsePrefixes(entry.command).name))
        this.correctionAliases.set(entry.alias, entry.command);
    return this.correctionAliases.size;
  }

  external(name: string): PgpExternalCommand | undefined {
    return this.externals.get(reverseHangulInput(name.trim()));
  }

  aliasEntries(): AliasEntry[] {
    const entries = new Map<string, AliasEntry>();
    for (const [alias, command] of this.builtinAliases)
      if (!this.removedAliases.has(alias))
        entries.set(alias, { alias, command, source: 'builtin' });
    for (const [alias, command] of this.userAliases)
      entries.set(alias, { alias, command, source: 'user' });
    return [...entries.values()].sort((a, b) =>
      a.alias.replace(/^-/, '').localeCompare(b.alias.replace(/^-/, '')),
    );
  }
  aliasesFor(command: string): string[] {
    const name = parsePrefixes(command).name;
    return this.aliasEntries()
      .filter((entry) => parsePrefixes(entry.command).name === name)
      .map((entry) => entry.alias);
  }
  isBuiltinAlias(alias: string): boolean {
    return this.builtinAliases.has(alias.toUpperCase());
  }
  get externalCommands(): readonly PgpExternalCommand[] {
    return [...this.externals.values()];
  }

  search(prefix: string): CommandDefinition[] {
    const query = reverseHangulInput(prefix);
    return this.all.filter((definition) => definition.name.startsWith(query));
  }

  private ensureCommand(command: string, source: 'builtin' | 'user'): void {
    const canonical = parsePrefixes(command).name;
    if (this.definitions.has(canonical)) return;
    if (source === 'builtin') throw new Error(`Alias target missing from catalog: ${canonical}`);
    this.definitions.set(canonical, {
      name: canonical,
      globalName: canonical,
      displayName: { 'ko-KR': canonical, 'en-US': canonical },
      description: {
        'ko-KR': '사용자 별칭에서 등록한 미구현 명령입니다.',
        'en-US': 'Unimplemented command registered from a user alias.',
      },
    });
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
