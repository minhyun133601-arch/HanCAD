import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { compactMetadata } from './check-dimension.mjs';
import { deadline } from './progress.mjs';

const browser = await deadline('Launch metadata QA', () =>
  chromium.launch({ channel: 'msedge', headless: true }),
);
let checks = 0;
try {
  const page = await deadline('Create metadata QA page', () => browser.newPage());
  await deadline('Route synthetic QA document', () =>
    page.route('http://metadata.test/**', (route) =>
      route.fulfill({ body: '<!doctype html><title>Synthetic metadata QA</title>' }),
    ),
  );
  await deadline('Open synthetic QA document', () => page.goto('http://metadata.test/'));
  await deadline('Seed chunked metadata', () =>
    page.evaluate(async () => {
      const dimension = {
        id: 'last',
        type: 'dimension',
        kind: 'horizontal',
        a: { x: 0, y: 0 },
        b: { x: 1000, y: 0 },
        placement: { x: 500, y: -250 },
      };
      const serialized = JSON.stringify({
        state: {
          entities: [{ id: 'bulk', type: 'text', text: 'x'.repeat(1100000) }, dimension],
          layers: [{ name: '도면층0', visible: true, locked: false }],
          selectedIds: [],
          settings: { layer: '도면층0', dimPost: '한글 "{}[]"', dimScale: 2 },
        },
        dimensionStyle: { DIMPOST: '한글 "{}[]"', DIMSCALE: 2 },
      });
      globalThis.synthetic = serialized;
      globalThis.HeechangTool = {
        core: {
          cadEngine: {
            dimensionGeometry: (entity) => ({
              measurement: Math.hypot(entity.b.x - entity.a.x, entity.b.y - entity.a.y),
              label: '1000',
              kind: entity.kind,
            }),
          },
        },
      };
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open('hancad-drawing-cache', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('drawings');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('drawings', 'readwrite'),
          store = transaction.objectStore('drawings');
        const chunks = Math.ceil(serialized.length / 524288);
        store.put({ version: 2, length: serialized.length, chunks }, 'active');
        for (let index = 0; index < chunks; index++)
          store.put(serialized.slice(index * 524288, (index + 1) * 524288), `chunk:${index}`);
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
      });
      db.close();
      localStorage.setItem('hancad.active-drawing.location.v1', 'indexed');
    }),
  );
  const chunked = await compactMetadata(page);
  assert.equal(chunked.dimension.measurement, 1000);
  assert.equal(chunked.diagnostics.chunkCount, 3);
  assert(chunked.diagnostics.tailLength <= 1048576);
  assert.equal(chunked.settings.dimPost, '한글 "{}[]"');
  checks++;
  await deadline('Seed local metadata', () =>
    page.evaluate(() => {
      localStorage.setItem('hancad.active-drawing.v1', globalThis.synthetic);
      localStorage.setItem('hancad.active-drawing.location.v1', 'local');
    }),
  );
  const local = await compactMetadata(page);
  assert.equal(local.dimension.measurement, 1000);
  assert.equal(local.diagnostics.source, 'local');
  checks++;
  await deadline('Seed failed cache marker', () =>
    page.evaluate(() => localStorage.setItem('hancad.active-drawing.location.v1', 'failed')),
  );
  await assert.rejects(compactMetadata(page), /not ready: failed/);
  checks++;
  await deadline('Delete active manifest', () =>
    page.evaluate(async () => {
      localStorage.setItem('hancad.active-drawing.location.v1', 'indexed');
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open('hancad-drawing-cache', 1);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('drawings', 'readwrite');
        transaction.objectStore('drawings').delete('active');
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
      });
      db.close();
    }),
  );
  await assert.rejects(compactMetadata(page), /manifest is missing or invalid/);
  checks++;
  await deadline('Simulate blocked IndexedDB', () =>
    page.evaluate(() => {
      globalThis.realOpen = indexedDB.open.bind(indexedDB);
      indexedDB.open = () => {
        const request = {};
        setTimeout(() => request.onblocked(), 0);
        return request;
      };
    }),
  );
  await assert.rejects(compactMetadata(page), /open is blocked/);
  checks++;
  await deadline('Simulate unresponsive IndexedDB', () =>
    page.evaluate(() => {
      indexedDB.open = () => ({});
    }),
  );
  await assert.rejects(compactMetadata(page, 50), /read timed out/);
  checks++;
  await assert.rejects(
    deadline('Unresponsive browser operation', () => new Promise(() => {}), 50),
    /timed out/,
  );
  checks++;
  console.log(`Compact metadata QA: ${checks}/${checks} passed.`);
} finally {
  await deadline('Close metadata QA browser', () => browser.close(), 15000);
}
