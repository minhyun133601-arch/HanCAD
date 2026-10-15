import { createMetricSnapshot } from './defaults';
import { EventBus } from './events';
import { cloneJson, cloneVariableMap } from './json-clone';
import { normalizeHandle } from './types';
import { assertJson, assertObject, assertSnapshot, validateSnapshot } from './validation';
import type {
  DatabaseEvent,
  DatabaseObject,
  DatabaseSnapshot,
  Handle,
  JsonObject,
  JsonValue,
  NewDatabaseObject,
  SymbolTableName,
} from './types';
import { UndoJournal } from './history';
import type { ChangeSet, UndoCategory, UndoMode } from './history';

export class DrawingDatabase {
  readonly events = new EventBus<DatabaseEvent>();
  readonly tables: Readonly<Record<SymbolTableName, Handle>>;
  readonly namedObjectDictionary: Handle;
  private readonly objects = new Map<Handle, DatabaseObject>();
  private readonly variables: JsonObject;
  private readonly metadata: JsonObject;
  private nextHandle: bigint;
  private readonly history = new UndoJournal();
  private lastErased: Handle[] = [];
  private lastUndoSize = 0;
  private active: ChangeSet | undefined;

  constructor(snapshot: DatabaseSnapshot = createMetricSnapshot()) {
    validateSnapshot(snapshot);
    this.tables = Object.freeze(structuredClone(snapshot.tables));
    this.namedObjectDictionary = snapshot.namedObjectDictionary;
    this.variables = cloneVariableMap(snapshot.drawingVariables);
    this.metadata = structuredClone(snapshot.metadata);
    this.nextHandle = BigInt(`0x${snapshot.handseed}`);
    for (const object of snapshot.objects) this.objects.set(object.handle, structuredClone(object));
  }

  get handseed(): Handle {
    return this.nextHandle.toString(16).toUpperCase();
  }
  get undoCount(): number {
    return this.history.undoCount;
  }
  get redoCount(): number {
    return this.history.redoCount;
  }
  get undoControl(): number {
    return this.history.control;
  }
  get undoMarkCount(): number {
    return this.history.markCount;
  }
  get undoReachedMark(): boolean {
    return this.history.reachedMark;
  }

  get(handle: Handle, includeErased = false): DatabaseObject | undefined {
    const object = this.objects.get(normalizeHandle(handle));
    return object && (!object.erased || includeErased) ? structuredClone(object) : undefined;
  }

  all(includeErased = false): DatabaseObject[] {
    return [...this.objects.values()]
      .filter((object) => includeErased || !object.erased)
      .map((object) => structuredClone(object));
  }

  find(type: string, name?: string): DatabaseObject | undefined {
    return this.all().find(
      (object) => object.type === type && (name === undefined || object.name === name),
    );
  }

  getVariable(name: string): JsonValue | undefined {
    const value = this.variables[name.toUpperCase()];
    return cloneJson(value);
  }

  transaction<Result>(
    label: string,
    operation: (transaction: DatabaseTransaction) => Result,
    category: UndoCategory = 'command',
  ): Result {
    if (this.active)
      throw new Error(
        'Nested transactions are not supported; reuse the active command transaction.',
      );
    const changes: ChangeSet = {
      label,
      category,
      objects: new Map(),
      variables: new Map(),
      beforeSeed: this.handseed,
      afterSeed: this.handseed,
    };
    this.active = changes;
    const transaction = new DatabaseTransaction(this);
    let result: Result;
    try {
      result = operation(transaction);
      if (result instanceof Promise)
        throw new Error(
          'Database transactions must be synchronous; collect command input before committing.',
        );
      changes.afterSeed = this.handseed;
      transaction.close();
      this.active = undefined;
    } catch (error) {
      transaction.close();
      this.restore(changes, 'before');
      this.active = undefined;
      throw error;
    }
    if (changes.objects.size || changes.variables.size) {
      const erased = [...changes.objects.entries()]
        .filter(([, entry]) => !entry.before?.erased && entry.after?.erased)
        .map(([handle]) => handle);
      if (erased.length) this.lastErased = erased;
      this.history.record(changes);
      this.publishChanges(changes, 'after');
    }
    return result;
  }

  undo(count = 1): number {
    this.assertHistoryIdle();
    return this.applyHistory(this.history.undo(count), 'before');
  }

  redo(count = 1): number {
    this.assertHistoryIdle();
    return this.applyHistory(this.history.redo(count), 'after');
  }
  redoLastUndo(): number {
    return this.lastUndoSize ? this.redo(this.lastUndoSize) : 0;
  }
  invalidateSingleRedo(): void {
    this.lastUndoSize = 0;
  }

  beginUndoGroup(): void {
    this.assertHistoryIdle();
    this.history.begin();
    this.publishHistory();
  }
  endUndoGroup(): void {
    this.assertHistoryIdle();
    this.history.end();
    this.publishHistory();
  }
  markUndo(): void {
    this.assertHistoryIdle();
    this.history.mark();
    this.publishHistory();
  }
  backUndo(confirmAll = false): number | undefined {
    this.assertHistoryIdle();
    const changes = this.history.back();
    if (changes) return this.applyHistory(changes, 'before');
    return confirmAll
      ? this.applyHistory(this.history.undo(this.undoCount, true), 'before')
      : undefined;
  }
  configureUndo(mode: UndoMode): void {
    this.assertHistoryIdle();
    this.history.configure(mode);
    this.publishHistory();
  }
  setUndoOption(option: 'auto' | 'combine' | 'layer', value: boolean): void {
    this.assertHistoryIdle();
    this.history.setOption(option, value);
    this.publishHistory();
  }
  oops(): number {
    const handles = this.lastErased.filter((handle) => this.get(handle, true)?.erased);
    if (!handles.length) return 0;
    this.transaction('OOPS', (transaction) => {
      for (const handle of handles) transaction.unerase(handle);
    });
    return handles.length;
  }

  clearHistory(): void {
    if (this.active) throw new Error('Cannot clear history inside a transaction.');
    this.history.clear();
    this.lastUndoSize = 0;
    this.lastErased = [];
    this.publishHistory();
  }

  snapshot(): DatabaseSnapshot {
    return {
      format: 'HanCAD.Database',
      version: 1,
      handseed: this.handseed,
      objects: this.all(true).sort((a, b) =>
        BigInt(`0x${a.handle}`) < BigInt(`0x${b.handle}`) ? -1 : 1,
      ),
      tables: structuredClone(this.tables),
      namedObjectDictionary: this.namedObjectDictionary,
      drawingVariables: cloneVariableMap(this.variables),
      metadata: structuredClone(this.metadata),
    };
  }

  serialize(): string {
    return JSON.stringify(this.snapshot());
  }

  static deserialize(json: string): DrawingDatabase {
    const value: unknown = JSON.parse(json);
    assertSnapshot(value);
    return new DrawingDatabase(value);
  }

  /** Internal mutation entry points are guarded by the command transaction. */
  createObject(input: NewDatabaseObject): DatabaseObject {
    const changes = this.requireActive();
    const handle = input.handle === undefined ? this.handseed : normalizeHandle(input.handle);
    if (this.objects.has(handle)) throw new Error(`Duplicate handle: ${handle}`);
    const numeric = BigInt(`0x${handle}`);
    if (numeric >= this.nextHandle) this.nextHandle = numeric + 1n;
    const object: DatabaseObject = {
      handle,
      owner: input.owner ?? null,
      type: input.type,
      erased: input.erased ?? false,
      reactors: input.reactors ?? [],
      extensionDictionary: input.extensionDictionary ?? null,
      xdata: input.xdata ?? {},
      groups: input.groups ?? [],
      fields: input.fields ?? {},
    };
    if (input.name !== undefined) object.name = input.name;
    assertObject(object);
    if (object.owner !== null && !this.objects.has(object.owner))
      throw new Error(`Unknown owner: ${object.owner}`);
    changes.objects.set(handle, { before: undefined, after: structuredClone(object) });
    this.objects.set(handle, structuredClone(object));
    return structuredClone(object);
  }

  updateObject(handle: Handle, update: (object: DatabaseObject) => void): DatabaseObject {
    const changes = this.requireActive();
    handle = normalizeHandle(handle);
    const current = this.objects.get(handle);
    if (!current) throw new Error(`Unknown object: ${handle}`);
    const changed = structuredClone(current);
    update(changed);
    if (changed.handle !== handle) throw new Error('Persistent handles cannot be changed.');
    assertObject(changed);
    if (changed.owner !== null && !this.objects.has(changed.owner))
      throw new Error(`Unknown owner: ${changed.owner}`);
    const prior = changes.objects.get(handle);
    changes.objects.set(handle, {
      before: prior ? prior.before : structuredClone(current),
      after: structuredClone(changed),
    });
    this.objects.set(handle, changed);
    return structuredClone(changed);
  }

  writeVariable(name: string, value: JsonValue): void {
    const changes = this.requireActive();
    assertJson(value);
    name = name.toUpperCase();
    const prior = changes.variables.get(name);
    const current = this.getVariable(name);
    changes.variables.set(name, {
      before: prior ? prior.before : current,
      after: cloneJson(value),
    });
    this.variables[name] = cloneJson(value);
  }

  private requireActive(): ChangeSet {
    if (!this.active) throw new Error('Database modifications require a command transaction.');
    return this.active;
  }

  private assertHistoryIdle(): void {
    if (this.active) throw new Error('Cannot change history inside a transaction.');
  }
  private applyHistory(entries: readonly ChangeSet[], state: 'before' | 'after'): number {
    if (state === 'before') this.lastUndoSize = entries.length;
    else this.lastUndoSize = 0;
    for (const changes of entries) {
      this.restore(changes, state);
      this.publishChanges(changes, state);
    }
    return entries.length;
  }
  private publishHistory(): void {
    this.events.publish({
      type: 'history-changed',
      undoCount: this.undoCount,
      redoCount: this.redoCount,
    });
  }

  private restore(changes: ChangeSet, state: 'before' | 'after'): void {
    this.nextHandle = BigInt(`0x${state === 'before' ? changes.beforeSeed : changes.afterSeed}`);
    for (const [handle, entry] of changes.objects) {
      const object = entry[state];
      if (object) this.objects.set(handle, structuredClone(object));
      else this.objects.delete(handle);
    }
    for (const [name, entry] of changes.variables) {
      const value = entry[state];
      if (value === undefined) delete this.variables[name];
      else this.variables[name] = cloneJson(value);
    }
  }

  private publishChanges(changes: ChangeSet, state: 'before' | 'after'): void {
    for (const entry of changes.objects.values()) {
      const object = entry[state];
      const previous = entry[state === 'before' ? 'after' : 'before'];
      const type =
        object === undefined || object.erased
          ? 'object-erased'
          : previous === undefined
            ? 'object-added'
            : previous.erased
              ? 'object-unerased'
              : 'object-modified';
      const payload = object ?? previous;
      if (payload) this.events.publish({ type, object: structuredClone(payload) });
    }
    for (const [name, entry] of changes.variables) {
      this.events.publish({
        type: 'sysvar-changed',
        name,
        before: cloneJson(entry[state === 'before' ? 'after' : 'before']),
        value: cloneJson(entry[state]),
      });
    }
    this.events.publish({
      type: 'history-changed',
      undoCount: this.undoCount,
      redoCount: this.redoCount,
    });
  }
}

export class DatabaseTransaction {
  private open = true;
  constructor(private readonly database: DrawingDatabase) {}
  add(input: NewDatabaseObject): DatabaseObject {
    this.assertOpen();
    return this.database.createObject(input);
  }
  get(handle: Handle, includeErased = false): DatabaseObject | undefined {
    this.assertOpen();
    return this.database.get(handle, includeErased);
  }
  modify(handle: Handle, update: (object: DatabaseObject) => void): DatabaseObject {
    this.assertOpen();
    return this.database.updateObject(handle, update);
  }
  erase(handle: Handle): void {
    this.modify(handle, (object) => {
      object.erased = true;
    });
  }
  unerase(handle: Handle): void {
    this.modify(handle, (object) => {
      object.erased = false;
    });
  }
  setVariable(name: string, value: JsonValue): void {
    this.assertOpen();
    this.database.writeVariable(name, value);
  }
  close(): void {
    this.open = false;
  }
  private assertOpen(): void {
    if (!this.open) throw new Error('Transaction is already closed.');
  }
}
