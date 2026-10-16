import { reverseHangulInput } from '@hancad/input';
import { getSystemVariableDefinition, systemVariableDefinitions } from '@hancad/sysvars';
import { parsePrefixes } from './registry';
import type { CommandRegistry } from './registry';

/** Named-object types listed by "Search Content at Command Line", in AutoCAD's default order. */
export const searchContentTypes = [
  'block',
  'layer',
  'hatch',
  'visualStyle',
  'textStyle',
  'dimStyle',
] as const;
export type SearchContentType = (typeof searchContentTypes)[number];

/** INPUTSEARCHOPTIONS settings; AutoCAD keeps them in the profile, not in sysvars. */
export interface InputSearchOptions {
  autoComplete: boolean;
  /** Only effective while AutoComplete is on. */
  midString: boolean;
  /** Frequency of use (true) or alphabetical (false) order. */
  sortByUsage: boolean;
  autoCorrect: boolean;
  /** "Remember Corrections After <n> Mistypes". */
  correctionThreshold: number;
  systemVariables: boolean;
  /** System variables in their own list, reached with Tab. */
  separateSystemVariables: boolean;
  content: boolean;
  contentTypes: readonly { type: SearchContentType; enabled: boolean }[];
}

export const defaultInputSearchOptions: InputSearchOptions = Object.freeze({
  autoComplete: true,
  midString: true,
  sortByUsage: true,
  autoCorrect: true,
  correctionThreshold: 3,
  systemVariables: true,
  separateSystemVariables: false,
  content: true,
  contentTypes: Object.freeze(searchContentTypes.map((type) => ({ type, enabled: true }))),
});

export function normalizeInputSearchOptions(value: unknown): InputSearchOptions {
  const source = typeof value === 'object' && value !== null ? value : {};
  const field = (name: keyof InputSearchOptions): unknown =>
    (source as Record<string, unknown>)[name];
  const flag = (name: keyof InputSearchOptions, fallback: boolean): boolean => {
    const raw = field(name);
    return typeof raw === 'boolean' ? raw : fallback;
  };
  const base = defaultInputSearchOptions;
  const threshold = field('correctionThreshold');
  const types = new Map<SearchContentType, boolean>();
  const rawTypes = field('contentTypes');
  if (Array.isArray(rawTypes))
    for (const item of rawTypes as unknown[]) {
      if (typeof item !== 'object' || item === null) continue;
      const { type, enabled } = item as { type?: unknown; enabled?: unknown };
      if (searchContentTypes.includes(type as SearchContentType) && !types.has(type as never))
        types.set(type as SearchContentType, enabled !== false);
    }
  // Keep the user's order; types missing from stored settings are appended enabled.
  for (const type of searchContentTypes) if (!types.has(type)) types.set(type, true);
  return {
    autoComplete: flag('autoComplete', base.autoComplete),
    midString: flag('midString', base.midString),
    sortByUsage: flag('sortByUsage', base.sortByUsage),
    autoCorrect: flag('autoCorrect', base.autoCorrect),
    correctionThreshold:
      typeof threshold === 'number' && Number.isInteger(threshold)
        ? Math.min(99, Math.max(1, threshold))
        : base.correctionThreshold,
    systemVariables: flag('systemVariables', base.systemVariables),
    separateSystemVariables: flag('separateSystemVariables', base.separateSystemVariables),
    content: flag('content', base.content),
    contentTypes: [...types].map(([type, enabled]) => ({ type, enabled })),
  };
}

export type SuggestionMatch = 'exact' | 'prefix' | 'mid' | 'correction';
export interface Suggestion {
  kind: 'command' | 'sysvar';
  name: string;
  /** Text submitted when the suggestion is accepted, keeping typed prefixes. */
  text: string;
  match: SuggestionMatch;
}
export interface SuggestionResult {
  /** Typed name without prefixes, Hangul reversed to Dubeolsik keys. */
  query: string;
  /** Commands, plus system variables unless they are listed separately. */
  items: Suggestion[];
  /** System variables when "Separate Commands and System Variables" is on. */
  variables: Suggestion[];
  /** The typed text already names a command, alias, external command or system variable. */
  exact: boolean;
}
export interface SuggestionRequest {
  input: string;
  options: InputSearchOptions;
  /** How often a command or system variable was used (frequency order). */
  usage?: (name: string) => number;
  /** Inside a running command only apostrophe input of transparent commands applies. */
  commandActive?: boolean;
  limit?: number;
}

const empty = (query = ''): SuggestionResult => ({ query, items: [], variables: [], exact: false });
const tiers: Readonly<Record<SuggestionMatch, number>> = {
  exact: 0,
  prefix: 1,
  mid: 2,
  correction: 3,
};

/** Command-line suggestion list for one keystroke state (AutoComplete/AutoCorrect/sysvars). */
export function suggestCommandInput(
  registry: CommandRegistry,
  request: SuggestionRequest,
): SuggestionResult {
  const typed = reverseHangulInput(request.input.trim()).toUpperCase();
  if (!typed || /\s/.test(typed)) return empty();
  const { name: query, prefixes } = parsePrefixes(typed);
  const prefixText = typed.slice(0, typed.length - query.length);
  if (!query || !/^[A-Z0-9_-]+$/.test(query)) return empty(query);
  if (request.commandActive && !prefixes.transparent) return empty(query);
  const options = request.options;
  const resolved = registry.resolve(typed);
  const exactVariable = getSystemVariableDefinition(query);
  const exact = Boolean(resolved || registry.external(query) || exactVariable);
  const ranked: { item: Suggestion; tier: number; distance: number }[] = [];
  const seen = new Set<string>();
  const add = (kind: Suggestion['kind'], name: string, match: SuggestionMatch, distance = 0) => {
    if (seen.has(name)) return;
    seen.add(name);
    // An exact entry keeps what was typed, so aliases and prefixes run unchanged.
    const text = match === 'exact' ? typed : `${prefixText}${name}`;
    ranked.push({ item: { kind, name, text, match }, tier: tiers[match], distance });
  };
  const usable = (name: string): boolean => {
    const definition = registry.resolve(`${name}`)?.definition;
    return Boolean(definition && (!request.commandActive || definition.flags?.transparent));
  };
  if (resolved && (!request.commandActive || resolved.definition.flags?.transparent))
    add('command', resolved.canonicalName, 'exact');
  if (exactVariable) add('sysvar', exactVariable.name, 'exact');
  const classify = (name: string): { match: SuggestionMatch; distance: number } | undefined => {
    if (options.autoComplete && name.startsWith(query)) return { match: 'prefix', distance: 0 };
    if (options.autoComplete && options.midString && name.includes(query))
      return { match: 'mid', distance: 0 };
    if (!options.autoCorrect || query.length < 3) return undefined;
    const distance = editDistance(query, name, maxCorrectionDistance(query));
    return distance <= maxCorrectionDistance(query) ? { match: 'correction', distance } : undefined;
  };
  for (const definition of registry.all) {
    if (seen.has(definition.name) || !usable(definition.name)) continue;
    const match = classify(definition.name);
    if (match) add('command', definition.name, match.match, match.distance);
  }
  if (options.systemVariables)
    for (const definition of systemVariableDefinitions) {
      if (seen.has(definition.name)) continue;
      const match = classify(definition.name);
      if (match) add('sysvar', definition.name, match.match, match.distance);
    }
  const usage = request.usage ?? (() => 0);
  ranked.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.distance - b.distance ||
      (options.sortByUsage ? usage(b.item.name) - usage(a.item.name) : 0) ||
      (a.item.name < b.item.name ? -1 : a.item.name > b.item.name ? 1 : 0),
  );
  const limit = request.limit ?? 100;
  const ordered = ranked.map((entry) => entry.item);
  const separate = options.separateSystemVariables;
  return {
    query,
    exact,
    items: ordered
      .filter((item) => !separate || item.kind === 'command' || item.match === 'exact')
      .slice(0, limit),
    variables: separate
      ? ordered.filter((item) => item.kind === 'sysvar' && item.match !== 'exact').slice(0, limit)
      : [],
  };
}

/**
 * Inline AutoComplete text after the caret: the rest of the top prefix suggestion,
 * appended from the second typed character as AutoCAD's AutoAppend does.
 */
export function inlineCompletion(result: SuggestionResult, options: InputSearchOptions): string {
  const top = result.items[0];
  if (!options.autoComplete || result.exact || result.query.length < 2) return '';
  return top?.match === 'prefix' ? top.name.slice(result.query.length) : '';
}

/** Typing errors tolerated by AutoCorrect: one for short names, two from five letters. */
export function maxCorrectionDistance(query: string): number {
  return query.length >= 5 ? 2 : 1;
}

/** Optimal string alignment distance (Levenshtein plus adjacent transposition). */
export function editDistance(a: string, b: string, cutoff = Number.POSITIVE_INFINITY): number {
  if (Math.abs(a.length - b.length) > cutoff) return cutoff + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, before[j - 2]! + 1);
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > cutoff) return cutoff + 1;
    before = previous;
    previous = current;
  }
  return previous[b.length]!;
}
