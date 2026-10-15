import type { DatabaseObject, Handle, JsonValue } from './types';

export type UndoCategory = 'command' | 'navigation' | 'layer';
export type UndoMode = 'all' | 'one' | 'none';
export interface ChangeSet {
  label: string;
  category: UndoCategory;
  objects: Map<Handle, { before: DatabaseObject | undefined; after: DatabaseObject | undefined }>;
  variables: Map<string, { before: JsonValue | undefined; after: JsonValue | undefined }>;
  beforeSeed: Handle;
  afterSeed: Handle;
}

export class UndoStateError extends Error {
  constructor(readonly code: 'disabled' | 'limited' | 'no-group') {
    super(
      code === 'disabled'
        ? 'Undo is disabled.'
        : code === 'limited'
          ? 'This option requires full undo.'
          : 'No undo group is active.',
    );
    this.name = 'UndoStateError';
  }
}

/** History settings are session state; drawing snapshots contain only drawing data. */
export class UndoJournal {
  private undoEntries: ChangeSet[] = [];
  private redoEntries: ChangeSet[] = [];
  private groupStart: number | undefined;
  private groupMarkStart = 0;
  private marks: number[] = [];
  private mode: UndoMode = 'all';
  private auto = true;
  private combine = true;
  private layer = true;
  reachedMark = false;

  get undoCount(): number {
    return this.undoEntries.length;
  }
  get redoCount(): number {
    return this.redoEntries.length;
  }
  get markCount(): number {
    return this.marks.length;
  }
  get groupActive(): boolean {
    return this.groupStart !== undefined;
  }
  get autoEnabled(): boolean {
    return this.mode === 'all' && this.auto;
  }
  get control(): number {
    if (this.mode === 'none') return 0;
    return (
      1 |
      (this.mode === 'one' ? 2 : this.auto ? 4 : 0) |
      (this.groupActive ? 8 : 0) |
      (this.combine ? 16 : 0) |
      (this.layer ? 32 : 0)
    );
  }

  record(changes: ChangeSet): void {
    this.redoEntries = [];
    if (this.mode === 'none') return;
    const previous = this.undoEntries.at(-1);
    const combine =
      changes.category === 'navigation' ? this.combine : changes.category === 'layer' && this.layer;
    const boundary =
      this.groupStart === this.undoEntries.length || this.marks.includes(this.undoEntries.length);
    if (previous && combine && previous.category === changes.category && !boundary)
      this.undoEntries[this.undoEntries.length - 1] = mergeChanges([previous, changes]);
    else this.undoEntries.push(changes);
    if (this.mode === 'one') this.undoEntries = this.undoEntries.slice(-1);
  }

  undo(count: number, ignoreMarks = false): ChangeSet[] {
    this.assertCount(count);
    this.reachedMark = false;
    if (this.mode === 'none' || count === 0) return [];
    let floor = this.groupStart ?? 0;
    if (!ignoreMarks) {
      // A second U crosses a mark reached by the preceding operation.
      this.marks = this.marks.filter((position) => position !== this.undoEntries.length);
      floor = Math.max(floor, this.marks.at(-1) ?? 0);
    }
    const result: ChangeSet[] = [];
    while (result.length < count && this.undoEntries.length > floor) {
      const changes = this.undoEntries.pop();
      if (!changes) break;
      this.redoEntries.push(changes);
      result.push(changes);
    }
    this.reachedMark = this.marks.includes(this.undoEntries.length);
    this.marks = this.marks.filter((position) => position <= this.undoEntries.length);
    return result;
  }

  redo(count: number): ChangeSet[] {
    this.assertCount(count);
    const result: ChangeSet[] = [];
    while (result.length < count && this.redoEntries.length) {
      const changes = this.redoEntries.pop();
      if (!changes) break;
      this.undoEntries.push(changes);
      result.push(changes);
    }
    return result;
  }

  begin(): void {
    this.requireFull();
    if (this.groupActive) this.end();
    this.groupStart = this.undoEntries.length;
    this.groupMarkStart = this.marks.length;
  }
  end(): void {
    if (this.groupStart === undefined) throw new UndoStateError('no-group');
    const start = this.groupStart;
    this.groupStart = undefined;
    const entries = this.undoEntries.splice(start);
    if (entries.length) this.undoEntries.push(mergeChanges(entries));
    this.marks = this.marks.slice(0, this.groupMarkStart).filter((position) => position <= start);
    this.redoEntries = [];
  }
  mark(): void {
    this.requireFull();
    this.marks.push(this.undoEntries.length);
  }
  back(): ChangeSet[] | undefined {
    this.requireFull();
    const target = this.marks.pop();
    if (target === undefined) return undefined;
    return this.undo(this.undoEntries.length - target, true);
  }
  configure(mode: UndoMode): void {
    if (this.groupActive) this.end();
    this.mode = mode;
    this.marks = [];
    if (mode === 'none') this.clear();
    else if (mode === 'one') this.undoEntries = this.undoEntries.slice(-1);
    this.redoEntries = [];
  }
  setOption(option: 'auto' | 'combine' | 'layer', value: boolean): void {
    if (option === 'auto') this.requireFull();
    this[option] = value;
  }
  clear(): void {
    this.undoEntries = [];
    this.redoEntries = [];
    this.groupStart = undefined;
    this.groupMarkStart = 0;
    this.marks = [];
    this.reachedMark = false;
  }
  private requireFull(): void {
    if (this.mode !== 'all')
      throw new UndoStateError(this.mode === 'none' ? 'disabled' : 'limited');
  }
  private assertCount(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error('Undo count must be a non-negative integer.');
  }
}

/** First before-state and final after-state make one atomic, reversible command group. */
function mergeChanges(entries: readonly ChangeSet[]): ChangeSet {
  const first = entries[0],
    last = entries.at(-1);
  if (!first || !last) throw new Error('Cannot merge an empty undo group.');
  const result: ChangeSet = {
    ...first,
    label: entries.map((entry) => entry.label).join('; '),
    category: 'command',
    objects: new Map(),
    variables: new Map(),
    afterSeed: last.afterSeed,
  };
  for (const entry of entries) {
    for (const [handle, change] of entry.objects) {
      const prior = result.objects.get(handle);
      result.objects.set(handle, {
        before: prior ? prior.before : change.before,
        after: change.after,
      });
    }
    for (const [name, change] of entry.variables) {
      const prior = result.variables.get(name);
      result.variables.set(name, {
        before: prior ? prior.before : change.before,
        after: change.after,
      });
    }
  }
  if (entries.every((entry) => entry.category === first.category)) result.category = first.category;
  return result;
}
