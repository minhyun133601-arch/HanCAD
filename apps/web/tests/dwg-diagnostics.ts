import type { Page } from '@playwright/test';

export async function installDwgDiagnostics(page: Page): Promise<void> {
  await page.evaluate(() => {
    type ParsedEntity = Record<string, unknown> & { type?: string };
    type ParsedDocument = {
      entities: ParsedEntity[];
      layers: Map<string, unknown>;
      blocks: Map<string, { entities: ParsedEntity[] }>;
    };
    const diagnostic = globalThis as typeof globalThis & {
      CadDxf: { parseDxf: (text: string) => ParsedDocument };
      dwgParserMetadata?: Record<string, unknown>;
      dwgCacheDiagnostics?: { putCharacters: number[]; errors: string[] };
    };
    const cacheDiagnostics = { putCharacters: [] as number[], errors: [] as string[] };
    diagnostic.dwgCacheDiagnostics = cacheDiagnostics;
    const put = IDBObjectStore.prototype.put;
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<typeof transaction>
    ): IDBTransaction {
      const result = transaction.apply(this, args);
      result.addEventListener('abort', () => {
        cacheDiagnostics.errors.push(
          `transaction abort ${result.error?.name}: ${result.error?.message}`,
        );
      });
      return result;
    };
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey): IDBRequest {
      if (typeof value === 'string') cacheDiagnostics.putCharacters.push(value.length);
      try {
        const request = key === undefined ? put.call(this, value) : put.call(this, value, key);
        request.addEventListener('error', () => {
          cacheDiagnostics.errors.push(`${request.error?.name}: ${request.error?.message}`);
        });
        return request;
      } catch (error) {
        cacheDiagnostics.errors.push(
          error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        );
        throw error;
      }
    };
    const parse = diagnostic.CadDxf.parseDxf;
    diagnostic.CadDxf.parseDxf = (text: string): ParsedDocument => {
      const parsed = parse(text);
      const topTypes: Record<string, number> = {};
      const blockTypes: Record<string, number> = {};
      let blockEntities = 0;
      const inserts = { count: 0, maximumRows: 0, maximumColumns: 0, totalInstances: 0 };
      const countEntities = (entities: ParsedEntity[], types: Record<string, number>): void => {
        for (const entity of entities) {
          const type = typeof entity.type === 'string' ? entity.type : 'UNKNOWN';
          types[type] = (types[type] ?? 0) + 1;
          if (type !== 'INSERT') continue;
          const rows = Math.max(1, Number(entity.rowCount) || 1);
          const columns = Math.max(1, Number(entity.columnCount) || 1);
          inserts.count += 1;
          inserts.maximumRows = Math.max(inserts.maximumRows, rows);
          inserts.maximumColumns = Math.max(inserts.maximumColumns, columns);
          inserts.totalInstances += rows * columns;
        }
      };
      countEntities(parsed.entities, topTypes);
      for (const block of parsed.blocks.values()) {
        blockEntities += block.entities.length;
        countEntities(block.entities, blockTypes);
      }
      const blockMemo = new Map<string, { count: number; guarded: boolean }>();
      let recursionGuards = 0;
      const blockEstimate = (name: string, path: string[]): { count: number; guarded: boolean } => {
        if (path.includes(name) || path.length >= 32) {
          recursionGuards += 1;
          return { count: 0, guarded: true };
        }
        const cached = blockMemo.get(name);
        if (cached) return cached;
        const block = parsed.blocks.get(name);
        if (!block) return { count: 0, guarded: false };
        let count = 0;
        let guarded = false;
        for (const entity of block.entities) {
          const estimate = entityEstimate(entity, [...path, name]);
          count += estimate.count;
          guarded ||= estimate.guarded;
        }
        const estimate = { count, guarded };
        if (!guarded) blockMemo.set(name, estimate);
        return estimate;
      };
      const entityEstimate = (
        entity: ParsedEntity,
        path: string[],
      ): { count: number; guarded: boolean } => {
        if (entity.type === 'INSERT') {
          const block = blockEstimate(String(entity.blockName ?? ''), path);
          const instances =
            Math.max(1, Number(entity.rowCount) || 1) *
            Math.max(1, Number(entity.columnCount) || 1);
          const attributes = Array.isArray(entity.attribs) ? entity.attribs.length : 0;
          return { count: block.count * instances + attributes, guarded: block.guarded };
        }
        if (entity.type === 'HATCH' && Array.isArray(entity.boundaryPaths)) {
          let count = 0;
          for (const value of entity.boundaryPaths as Record<string, unknown>[]) {
            count +=
              value.type === 'polyline' ? 1 : Array.isArray(value.edges) ? value.edges.length : 0;
          }
          return { count: Math.max(1, count), guarded: false };
        }
        if (entity.type === 'DIMENSION' && typeof entity.blockName === 'string') {
          const graphics = blockEstimate(entity.blockName, path);
          return { count: Math.max(1, graphics.count), guarded: graphics.guarded };
        }
        return { count: 1, guarded: false };
      };
      let expandedUpperEstimate = 0;
      const topInserts = [];
      for (const entity of parsed.entities) {
        const estimate = entityEstimate(entity, []);
        expandedUpperEstimate += estimate.count;
        if (entity.type !== 'INSERT') continue;
        const name = String(entity.blockName ?? '');
        topInserts.push({
          blockName: name,
          directBlockEntities: parsed.blocks.get(name)?.entities.length ?? 0,
          expandedBlockEntities: blockEstimate(name, []).count,
          attachedAttributes: Array.isArray(entity.attribs) ? entity.attribs.length : 0,
          totalEstimate: estimate.count,
        });
      }
      diagnostic.dwgParserMetadata = {
        sourceEntities: parsed.entities.length,
        layers: parsed.layers.size,
        blocks: parsed.blocks.size,
        blockEntities,
        topTypes,
        blockTypes,
        inserts,
        expandedUpperEstimate,
        topInserts,
        recursionGuards,
        memoizedBlocks: blockMemo.size,
      };
      return parsed;
    };
  });
}

export async function readDwgSnapshot(page: Page) {
  return await page.evaluate(() => {
    const diagnostic = globalThis as typeof globalThis & {
      dwgParserMetadata?: Record<string, unknown>;
      dwgCacheDiagnostics?: { putCharacters: number[]; errors: string[] };
    };
    return {
      entityText:
        document.querySelector('[data-testid="drawing-entity-count"]')?.textContent ?? '0',
      report: document.querySelector('[data-testid="drawing-import-report"]')?.textContent ?? '',
      history: document.querySelector('[role="log"]')?.textContent ?? '',
      parserMetadata: diagnostic.dwgParserMetadata ?? null,
      cacheDiagnostics: diagnostic.dwgCacheDiagnostics ?? null,
    };
  });
}

export async function readDwgCacheDiagnostics(page: Page) {
  return await page.evaluate(async () => {
    const diagnostic = globalThis as typeof globalThis & {
      dwgCacheDiagnostics?: { putCharacters: number[]; errors: string[] };
    };
    const cache = diagnostic.dwgCacheDiagnostics;
    const location = localStorage.getItem('hancad.active-drawing.location.v1');
    let manifest: unknown;
    if (location === 'indexed') {
      manifest = await new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('hancad-drawing-cache', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('drawings', 'readonly').objectStore('drawings').get('active');
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            db.close();
            const value: unknown = read.result;
            if (typeof value === 'string') resolve({ legacyCharacters: value.length });
            else if (typeof value === 'object' && value !== null) {
              const record = value as Record<string, unknown>;
              resolve({
                version: typeof record.version === 'number' ? record.version : undefined,
                length: typeof record.length === 'number' ? record.length : undefined,
                chunks: typeof record.chunks === 'number' ? record.chunks : undefined,
              });
            } else resolve(null);
          };
        };
      });
    }
    return {
      location,
      manifest,
      putCount: cache?.putCharacters.length,
      putMaximumCharacters: Math.max(0, ...(cache?.putCharacters ?? [])),
      putTotalCharacters: cache?.putCharacters.reduce((sum, length) => sum + length, 0),
      errors: cache?.errors,
    };
  });
}
