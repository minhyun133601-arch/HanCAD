import { AutoCorrectMemory, normalizeInputSearchOptions } from '@hancad/commands';
import type { InputSearchOptions } from '@hancad/commands';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

const keys = {
  options: 'hancad.input-search-options.v1',
  usage: 'hancad.command-usage.v1',
  autoCorrect: 'hancad.autocorrect.v1',
} as const;

function read(storage: Storage | undefined, key: string): unknown {
  try {
    const raw = (storage ?? localStorage).getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
function write(storage: Storage | undefined, key: string, value: unknown): void {
  try {
    (storage ?? localStorage).setItem(key, JSON.stringify(value));
  } catch {
    // Profile preferences stay in memory when browser storage is unavailable.
  }
}

/**
 * Profile-wide AutoComplete state shared by every open drawing: INPUTSEARCHOPTIONS
 * settings, command usage counts for frequency order and AutoCorrect learning.
 */
export class InputSearchStore {
  private current: InputSearchOptions;
  private readonly usage = new Map<string, number>();
  readonly autoCorrect: AutoCorrectMemory;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage?: Storage) {
    this.current = normalizeInputSearchOptions(read(storage, keys.options));
    const usage = read(storage, keys.usage);
    if (typeof usage === 'object' && usage !== null)
      for (const [name, count] of Object.entries(usage))
        if (/^[A-Z0-9_-]+$/.test(name) && Number.isSafeInteger(count) && (count as number) > 0)
          this.usage.set(name, count as number);
    this.autoCorrect = new AutoCorrectMemory(read(storage, keys.autoCorrect));
  }

  get(): InputSearchOptions {
    return this.current;
  }
  set(options: InputSearchOptions): void {
    this.current = normalizeInputSearchOptions(options);
    write(this.storage, keys.options, this.current);
    this.notify();
  }

  usageOf(name: string): number {
    return this.usage.get(name) ?? 0;
  }
  recordUsage(name: string): void {
    const key = name.toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(key)) return;
    this.usage.set(key, this.usageOf(key) + 1);
    write(this.storage, keys.usage, Object.fromEntries(this.usage));
  }

  /** Counts one correction; returns true when it became a remembered AutoCorrect entry. */
  recordCorrection(mistyped: string, command: string): boolean {
    const learned = this.autoCorrect.record(mistyped, command, this.current.correctionThreshold);
    write(this.storage, keys.autoCorrect, this.autoCorrect.toJSON());
    if (learned) this.notify();
    return learned;
  }

  /** ALIASEDIT's AutoCorrect list: replaces the remembered corrections. */
  replaceCorrections(pgp: string): void {
    this.autoCorrect.load(pgp);
    write(this.storage, keys.autoCorrect, this.autoCorrect.toJSON());
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

let shared: InputSearchStore | undefined;
/** The browser profile's store, created on first use. */
export function inputSearchStore(): InputSearchStore {
  shared ??= new InputSearchStore();
  return shared;
}
