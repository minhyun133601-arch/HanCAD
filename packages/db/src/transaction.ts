import type { DrawingDatabase } from './database';
import type { DatabaseObject, Handle, JsonValue, NewDatabaseObject } from './types';

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
