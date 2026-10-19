import type { DrawingDatabase } from '@hancad/db';

const memories = new WeakMap<DrawingDatabase, Map<string, number | string>>();

/** Command defaults follow a live document across tab remounts without entering its file. */
export function drawingCommandMemory(database: DrawingDatabase): Map<string, number | string> {
  let memory = memories.get(database);
  if (!memory) {
    memory = new Map();
    memories.set(database, memory);
  }
  return memory;
}
