import assert from 'node:assert/strict';
import { deadline } from './progress.mjs';

/** Read at most the final two chunks; never return the drawing graph through CDP. */
export async function compactMetadata(page, timeoutMs = 12000) {
  return deadline(
    'Read compact drawing metadata',
    () =>
      page.evaluate(async (limitMs) => {
        const cache = localStorage.getItem('hancad.active-drawing.location.v1');
        if (cache !== 'local' && cache !== 'indexed')
          throw new Error(`Drawing cache is not ready: ${cache ?? 'missing'}`);
        let source = 'local',
          chunkCount = 0;
        const tail =
          cache === 'local'
            ? localStorage.getItem('hancad.active-drawing.v1')?.slice(-1048576)
            : await new Promise((resolve, reject) => {
                source = 'indexed';
                let db,
                  transaction,
                  settled = false;
                const finish = (error, value) => {
                  if (settled) return;
                  settled = true;
                  clearTimeout(timer);
                  if (error) {
                    try {
                      transaction?.abort();
                    } catch {
                      /* Already completed or aborted. */
                    }
                  }
                  db?.close();
                  if (error) reject(error);
                  else resolve(value);
                };
                const timer = setTimeout(
                  () => finish(new Error('IndexedDB metadata read timed out')),
                  limitMs,
                );
                const open = indexedDB.open('hancad-drawing-cache', 1);
                open.onerror = () => finish(open.error ?? new Error('IndexedDB open failed'));
                open.onblocked = () => finish(new Error('IndexedDB metadata open is blocked'));
                open.onupgradeneeded = () => {
                  open.transaction.abort();
                  finish(new Error('The drawing cache database does not exist'));
                };
                open.onsuccess = () => {
                  db = open.result;
                  if (settled) {
                    db.close();
                    return;
                  }
                  try {
                    db.onversionchange = () =>
                      finish(new Error('Drawing cache database version changed'));
                    transaction = db.transaction('drawings', 'readonly');
                    transaction.onabort = () =>
                      finish(transaction.error ?? new Error('Metadata transaction aborted'));
                    transaction.onerror = () =>
                      finish(transaction.error ?? new Error('Metadata transaction failed'));
                    transaction.oncomplete = () => {
                      if (!settled)
                        finish(new Error('Metadata transaction completed without a valid tail'));
                    };
                    const store = transaction.objectStore('drawings');
                    const active = store.get('active');
                    active.onerror = () =>
                      finish(active.error ?? new Error('Active metadata read failed'));
                    active.onsuccess = () => {
                      try {
                        const value = active.result;
                        if (typeof value === 'string') {
                          finish(null, value.slice(-1048576));
                          return;
                        }
                        if (
                          !value ||
                          value.version !== 2 ||
                          !Number.isSafeInteger(value.chunks) ||
                          value.chunks < 1 ||
                          value.chunks > 4096 ||
                          !Number.isSafeInteger(value.length) ||
                          value.length < 1 ||
                          Math.ceil(value.length / 524288) !== value.chunks
                        )
                          throw new Error('Active drawing chunk manifest is missing or invalid');
                        chunkCount = value.chunks;
                        const last = value.chunks - 1,
                          first = Math.max(0, last - 1),
                          pieces = [];
                        let pending = last - first + 1;
                        for (let index = first; index <= last; index++) {
                          const read = store.get(`chunk:${index}`);
                          read.onerror = () =>
                            finish(read.error ?? new Error(`Chunk ${index} read failed`));
                          read.onsuccess = () => {
                            try {
                              if (typeof read.result !== 'string')
                                throw new Error(`Chunk ${index} is missing`);
                              const expected =
                                index === last ? value.length - index * 524288 : 524288;
                              if (read.result.length !== expected)
                                throw new Error(`Chunk ${index} length is invalid`);
                              pieces[index - first] = read.result;
                              if (--pending === 0) finish(null, pieces.join(''));
                            } catch (error) {
                              finish(error);
                            }
                          };
                        }
                      } catch (error) {
                        finish(error);
                      }
                    };
                  } catch (error) {
                    finish(error);
                  }
                };
              });
        if (typeof tail !== 'string' || !tail.length)
          throw new Error('No cached drawing metadata tail');
        function property(key) {
          const marker = `"${key}":`,
            offset = tail.lastIndexOf(marker);
          if (offset < 0) return null;
          const start = offset + marker.length;
          if (tail.startsWith('null', start)) return null;
          if (!['{', '['].includes(tail[start]))
            throw new Error(`Expected composite metadata ${key}`);
          let quoted = false,
            escaped = false,
            depth = 0;
          for (let index = start; index < tail.length; index++) {
            const character = tail[index];
            if (quoted) {
              if (escaped) escaped = false;
              else if (character === '\\') escaped = true;
              else if (character === '"') quoted = false;
            } else if (character === '"') quoted = true;
            else if (character === '{' || character === '[') depth++;
            else if ((character === '}' || character === ']') && --depth === 0)
              return JSON.parse(tail.slice(start, index + 1));
          }
          throw new Error(`Incomplete metadata ${key} in the final cache chunks`);
        }
        const settings = property('settings'),
          layers = property('layers');
        if (!settings || !Array.isArray(layers))
          throw new Error('Cached settings or layers are missing');
        const currentLayer = layers.find((layer) => layer.name === settings.layer);
        const boundary = tail.lastIndexOf('],"layers":');
        if (boundary < 0) throw new Error('Cached entity/layer boundary is missing');
        const entries = tail.slice(0, boundary),
          last = entries.lastIndexOf('{"id":');
        const entity = last >= 0 ? JSON.parse(entries.slice(last)) : null;
        const dimension =
          entity?.type === 'dimension'
            ? globalThis.HeechangTool.core.cadEngine.dimensionGeometry(entity)
            : null;
        return {
          currentLayer: currentLayer && {
            name: currentLayer.name,
            visible: currentLayer.visible,
            locked: currentLayer.locked,
          },
          settings,
          dimension: dimension && {
            measurement: dimension.measurement,
            label: dimension.label,
            kind: dimension.kind,
          },
          style: property('dimensionStyle'),
          cache,
          diagnostics: {
            source,
            chunkCount,
            tailLength: tail.length,
            lastEntityType: entity?.type ?? null,
          },
        };
      }, timeoutMs),
    timeoutMs + 6000,
  );
}

export async function verifyDimensionUndo(page, originalCount, cacheSettled, step = deadline) {
  const before = await step('dimension/read-before', () => compactMetadata(page), 20000);
  assert(before.currentLayer, 'Cached drawing metadata must identify the current layer.');
  if (before.currentLayer.locked || !before.currentLayer.visible) {
    return {
      skipped: true,
      reason: 'The current layer is hidden or locked; it was not changed.',
      currentLayer: before.currentLayer,
      diagnostics: before.diagnostics,
    };
  }
  async function enter(value) {
    await step(
      `dimension/input-${value}`,
      async () => {
        await page
          .getByRole('textbox', { name: '명령 입력', exact: true })
          .focus({ timeout: 15000 });
        await page.keyboard.type(value);
        await page.keyboard.press('Enter');
      },
      20000,
    );
  }
  const started = Date.now();
  for (const value of ['DLI', '0,0', '1000,0', '500,250']) await enter(value);
  await step(
    'dimension/created-count',
    () =>
      page.waitForFunction(
        (count) =>
          Number(document.querySelector('[data-testid="drawing-entity-count"]')?.textContent) ===
          count,
        originalCount + 1,
        { timeout: 60000 },
      ),
    65000,
  );
  await step('dimension/created-cache', cacheSettled, 95000);
  const created = await step('dimension/read-created', () => compactMetadata(page), 20000);
  assert.equal(created.dimension?.measurement, 1000);
  const history = await step(
    'dimension/history',
    () => page.getByRole('log', { name: '명령 기록', exact: true }).textContent({ timeout: 15000 }),
    20000,
  );
  await enter('U');
  await step(
    'dimension/undo-count',
    () =>
      page.waitForFunction(
        (count) =>
          Number(document.querySelector('[data-testid="drawing-entity-count"]')?.textContent) ===
          count,
        originalCount,
        { timeout: 60000 },
      ),
    65000,
  );
  await step('dimension/undo-cache', cacheSettled, 95000);
  const undone = await step('dimension/read-undone', () => compactMetadata(page), 20000);
  assert.deepEqual(undone.settings, before.settings);
  assert.deepEqual(undone.style, before.style);
  assert.equal(undone.cache, before.cache);
  return {
    currentLayer: before.currentLayer,
    createdCount: originalCount + 1,
    measurement: created.dimension.measurement,
    elapsedMs: Date.now() - started,
    undoCount: originalCount,
    styleBefore: before.style,
    styleAfterUndo: undone.style,
    diagnostics: {
      before: before.diagnostics,
      created: created.diagnostics,
      undone: undone.diagnostics,
    },
    history,
  };
}
