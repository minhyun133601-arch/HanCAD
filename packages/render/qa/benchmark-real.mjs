import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { verifyDimensionUndo } from './check-dimension.mjs';
import { createProgress, deadline } from './progress.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const drawing = process.env.HANCAD_PRIVATE_DWG;
assert(drawing, 'Set HANCAD_PRIVATE_DWG to the local drawing.');
const output = path.join(root, 'test-artifacts', 'render-benchmark');
await deadline('Create benchmark output', () => fs.mkdir(output, { recursive: true }));
const result = {
  fileName: path.basename(drawing),
  samples: [],
  pageErrors: [],
  externalRequests: [],
  cacheStages: [],
};
const progress = createProgress(output, result),
  step = progress.step;
let browser, failure;
try {
  browser = await step(
    'browser/launch',
    () => chromium.launch({ channel: 'msedge', headless: true, timeout: 20000 }),
    25000,
  );
  const page = await step('browser/new-page', () =>
    browser.newPage({ viewport: { width: 1600, height: 1000 } }),
  );
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('crash', () => result.pageErrors.push('Browser page crashed'));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) &&
      !['blob:', 'data:'].includes(url.protocol)
    )
      result.externalRequests.push(request.url());
  });
  await step('app/open', () => page.goto('http://127.0.0.1:1420'), 35000);
  const cdp = await step('browser/cdp', () => page.context().newCDPSession(page));
  await step('heap/empty', async () => {
    result.emptyHeap = await cdp.send('Runtime.getHeapUsage');
  });
  const started = Date.now();
  await step('drawing/choose-file', async () => {
    await page.getByRole('button', { name: '파일', exact: true }).click();
    const chooser = page.waitForEvent('filechooser', { timeout: 15000 });
    await page.getByRole('menuitem', { name: 'DWG / DXF 열기', exact: true }).click();
    await (await chooser).setFiles(drawing);
  });
  await step(
    'drawing/import',
    async () => {
      await page.waitForFunction(
        () =>
          !document.querySelector('.drawing-loading') &&
          Number(document.querySelector('[data-testid="drawing-entity-count"]')?.textContent) > 0,
        undefined,
        { timeout: 120000 },
      );
      result.openMs = Date.now() - started;
    },
    125000,
  );
  const cacheSettled = async () => {
    await page.waitForFunction(
      () => {
        const value = localStorage.getItem('hancad.active-drawing.location.v1');
        if (value === 'failed' || value === null)
          throw new Error(`Drawing cache did not save: ${value ?? 'missing marker'}`);
        return value === 'indexed' || value === 'local';
      },
      undefined,
      { timeout: 90000 },
    );
    const location = await page.evaluate(() =>
      localStorage.getItem('hancad.active-drawing.location.v1'),
    );
    result.cacheStages.push({ stage: result.checkpoints.at(-1)?.name, location });
    assert.equal(location, 'indexed', 'The private large drawing must finish saving in IndexedDB.');
  };
  await step('cache/import', cacheSettled, 95000);
  await step(
    'drawing/layers-on',
    async () => {
      if (await page.locator('.hidden-layers-notice').count())
        await page.getByRole('button', { name: '모든 도면층 켜기', exact: true }).click();
    },
    45000,
  );
  await step('cache/layers-on', cacheSettled, 95000);
  await step('heap/loaded', async () => {
    result.loadedHeap = await cdp.send('Runtime.getHeapUsage');
  });
  const canvas = page.getByTestId('drawing-canvas');
  const box = await step('drawing/counts', async () => {
    result.entityCount = Number(await page.getByTestId('drawing-entity-count').textContent());
    result.visibleCount = Number(await canvas.getAttribute('data-entity-count'));
    assert.equal(result.visibleCount, result.entityCount);
    const rectangle = await canvas.boundingBox();
    assert(rectangle);
    return rectangle;
  });
  await step('screenshot/fit', () =>
    page.screenshot({ path: path.join(output, 'fit.png'), timeout: 20000 }),
  );

  async function armProbe(event) {
    await page.evaluate((name) => {
      const canvas = document.querySelector('[data-testid="drawing-canvas"]');
      const frame = canvas.dataset.frame;
      globalThis.renderProbe = new Promise((resolve) => {
        const timer = setTimeout(() => {
          canvas.removeEventListener(name, onEvent, true);
          resolve({ probeError: 'No rendered frame within 15000ms' });
        }, 15000);
        function onEvent() {
          const start = performance.now();
          const check = () => {
            if (canvas.dataset.frame === frame) return requestAnimationFrame(check);
            requestAnimationFrame(() => {
              try {
                const readbackStart = performance.now();
                canvas
                  .getContext('2d')
                  .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1);
                clearTimeout(timer);
                resolve({
                  eventToPaintMs: performance.now() - start,
                  readbackMs: performance.now() - readbackStart,
                  renderMs: Number(canvas.dataset.renderMs),
                  geometryMs: Number(canvas.dataset.geometryMs),
                  drawnEntities: Number(canvas.dataset.drawnEntities),
                  drawCalls: Number(canvas.dataset.drawCalls),
                  frame: Number(canvas.dataset.frame),
                  zoom: Number(canvas.dataset.zoom),
                });
              } catch (error) {
                clearTimeout(timer);
                resolve({ probeError: String(error) });
              }
            });
          };
          requestAnimationFrame(check);
        }
        canvas.addEventListener(name, onEvent, { capture: true, once: true });
      });
    }, event);
  }
  async function record(name) {
    const sample = await page.evaluate(() => globalThis.renderProbe);
    result.samples.push({ name, ...sample });
    assert(!sample.probeError, sample.probeError);
  }
  await step('navigation/position', () =>
    page.mouse.move(box.x + box.width / 2, box.y + box.height / 2),
  );
  for (let index = 0; index < 3; index++) {
    await step(
      `navigation/zoom-${index}`,
      async () => {
        await armProbe('wheel');
        await page.mouse.wheel(0, -120);
        await record(`zoom-${index}`);
      },
      20000,
    );
    await step(
      `navigation/pan-${index}`,
      async () => {
        await page.mouse.down({ button: 'middle' });
        await armProbe('pointermove');
        await page.mouse.move(
          box.x + box.width / 2 + (index + 1) * 30,
          box.y + box.height / 2 + (index + 1) * 10,
        );
        await record(`pan-${index}`);
        await page.mouse.up({ button: 'middle' });
      },
      20000,
    );
  }
  await step('screenshot/navigated', () =>
    page.screenshot({ path: path.join(output, 'navigated.png'), timeout: 20000 }),
  );
  await step('heap/navigated', async () => {
    result.afterNavigationHeap = await cdp.send('Runtime.getHeapUsage');
  });
  result.dimensionEdit = await verifyDimensionUndo(page, result.entityCount, cacheSettled, step);
  await progress.save();
  await step('cache/final-location', async () => {
    result.cacheLocation = await page.evaluate(() =>
      localStorage.getItem('hancad.active-drawing.location.v1'),
    );
  });
  const reloadStarted = Date.now();
  await step('drawing/reload', () => page.reload(), 35000);
  await step(
    'drawing/restored',
    async () => {
      await page.waitForFunction(
        (expected) =>
          !document.querySelector('.drawing-loading') &&
          Number(document.querySelector('[data-testid="drawing-entity-count"]')?.textContent) ===
            expected &&
          Number(document.querySelector('[data-testid="drawing-canvas"]')?.dataset.entityCount) ===
            expected,
        result.entityCount,
        { timeout: 60000 },
      );
      result.restored = {
        elapsedMs: Date.now() - reloadStarted,
        entities: Number(await page.getByTestId('drawing-entity-count').textContent()),
        visible: Number(await canvas.getAttribute('data-entity-count')),
        heap: await cdp.send('Runtime.getHeapUsage'),
      };
      assert.equal(result.restored.entities, result.entityCount);
      assert.equal(result.restored.visible, result.visibleCount);
    },
    65000,
  );
  await step('screenshot/restored', () =>
    page.screenshot({ path: path.join(output, 'restored.png'), timeout: 20000 }),
  );
  await step('acceptance', () => {
    assert.equal(result.entityCount, result.visibleCount);
    assert.deepEqual(result.pageErrors, []);
    assert.deepEqual(result.externalRequests, []);
    assert.equal(result.samples.length, 6);
    assert(
      result.samples.every((sample) => sample.renderMs < 1000),
      'Every cached frame should beat the previous ~1500ms rendering cost.',
    );
    assert(
      result.samples.every((sample) => sample.eventToPaintMs < 1500),
      'Every frame must reach paint and complete GPU readback within 1500ms.',
    );
  });
  result.status = 'passed';
} catch (error) {
  failure = error;
  result.status = 'failed';
  result.error = String(error?.stack ?? error);
} finally {
  await progress.save();
  if (browser) {
    try {
      await deadline('Close benchmark browser', () => browser.close(), 15000);
    } catch (error) {
      result.closeError = String(error);
      await progress.save();
    }
  }
}
console.log(JSON.stringify(result));
if (failure) throw failure;
