import { formatPgp, parsePgp } from './pgp';

/** Persisted AutoCorrect learning: pending mistype counts and remembered corrections. */
export interface AutoCorrectState {
  /** "MISTYPED>COMMAND" -> times the user corrected that mistype. */
  counts: Record<string, number>;
  /** AutoCorrectUserDB.pgp contents (MISTYPED, *COMMAND). */
  pgp: string;
}

const namePattern = /^[A-Z0-9_-][A-Z0-9_.-]*$/;

/**
 * Learns corrections the way AutoCAD's AutoCorrect does: once a mistype has been
 * corrected to the same command "n" times it is remembered in AutoCorrectUserDB.pgp,
 * after which the command line resolves the mistype directly.
 */
export class AutoCorrectMemory {
  private readonly counts = new Map<string, number>();
  private readonly learned = new Map<string, string>();

  constructor(state?: unknown) {
    if (typeof state !== 'object' || state === null) return;
    const { counts, pgp } = state as Partial<Record<keyof AutoCorrectState, unknown>>;
    if (typeof counts === 'object' && counts !== null)
      for (const [key, value] of Object.entries(counts))
        if (/^[^>]+>[^>]+$/.test(key) && Number.isInteger(value) && (value as number) > 0)
          this.counts.set(key, value as number);
    if (typeof pgp === 'string') this.load(pgp);
  }

  /** Replaces remembered corrections, e.g. after the user edits the PGP file. */
  load(pgp: string): void {
    this.learned.clear();
    for (const entry of parsePgp(pgp).aliases) this.learned.set(entry.alias, entry.command);
  }

  /**
   * Records one correction of `mistyped` to `command`.
   * Returns true when this correction has just become a remembered entry.
   */
  record(mistyped: string, command: string, threshold: number): boolean {
    const wrong = mistyped.trim().toUpperCase(),
      right = command.trim().toUpperCase();
    if (!namePattern.test(wrong) || !namePattern.test(right) || wrong === right) return false;
    if (this.learned.get(wrong) === right) return false;
    const key = `${wrong}>${right}`;
    const count = (this.counts.get(key) ?? 0) + 1;
    if (count < Math.max(1, threshold)) {
      this.counts.set(key, count);
      return false;
    }
    this.counts.delete(key);
    this.learned.set(wrong, right);
    return true;
  }

  correction(mistyped: string): string | undefined {
    return this.learned.get(mistyped.trim().toUpperCase());
  }

  get entries(): readonly { alias: string; command: string }[] {
    return [...this.learned]
      .map(([alias, command]) => ({ alias, command }))
      .sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));
  }

  toPgp(): string {
    return formatPgp(this.entries, [], ['HanCAD AutoCorrect user database (MISTYPED, *COMMAND)']);
  }

  toJSON(): AutoCorrectState {
    return { counts: Object.fromEntries(this.counts), pgp: this.toPgp() };
  }
}
