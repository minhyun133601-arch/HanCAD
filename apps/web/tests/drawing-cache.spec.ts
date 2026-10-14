import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const drawingKey = 'hancad.active-drawing.v1';
const locationKey = 'hancad.active-drawing.location.v1';
interface CacheGate {
  pending: number;
  release: () => void;
}
const lineDxf = (length: number) =>
  `0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n${length}\n21\n30\n0\nENDSEC\n0\nEOF\n`;

async function quota(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Test storage quota', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, drawingKey);
}

async function open(page: Page, name: string, length: number): Promise<void> {
  await page.getByTestId('cad-file-input').setInputFiles({
    name,
    mimeType: 'application/dxf',
    buffer: Buffer.from(lineDxf(length)),
  });
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText(name);
}

async function waitForCacheGate(page: Page): Promise<void> {
  await expect(page.getByRole('status')).toContainText('복원하고 있습니다');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as typeof globalThis & { __hancadCacheGate?: CacheGate }).__hancadCacheGate
            ?.pending ?? 0,
      ),
    )
    .toBeGreaterThan(0);
}

async function releaseCacheGate(page: Page): Promise<void> {
  await page.evaluate(() => {
    const gate = (globalThis as typeof globalThis & { __hancadCacheGate?: CacheGate })
      .__hancadCacheGate;
    if (!gate) throw new Error('Cache restoration gate is unavailable');
    gate.release();
  });
}

test('drawing cache falls back to IndexedDB on quota and restores report and geometry', async ({
  page,
}) => {
  await quota(page);
  await page.goto('/');
  await open(page, 'local-cache.dxf', 100);
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('로컬 데이터베이스');
  expect(await page.evaluate((key) => localStorage.getItem(key), drawingKey)).toBeNull();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), locationKey))
    .toBe('indexed');
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('local-cache.dxf');
  await expect(page.getByTestId('drawing-import-report')).toContainText('DXF');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('복원했습니다');
  await page
    .getByRole('toolbar', { name: '신속 접근 도구막대' })
    .getByRole('button', { name: '새 도면', exact: true })
    .click();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), locationKey))
    .toBe('indexed');
  // Wait for the newer NEW payload rather than only the prior cache location flag.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('hancad-drawing-cache', 1);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction('drawings');
              const value = transaction.objectStore('drawings').get('active');
              value.onsuccess = () => resolve(JSON.parse(value.result).state.entities.length);
              value.onerror = () => reject(value.error);
              transaction.oncomplete = () => database.close();
            };
            request.onerror = () => reject(request.error);
          }),
      ),
    )
    .toBe(0);
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('Drawing1.dwg');
});

test('failed cache writes preserve the active drawing and prevent restoring an older file', async ({
  page,
}) => {
  await quota(page);
  await page.goto('/');
  await open(page, 'older.dxf', 100);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), locationKey))
    .toBe('indexed');
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Test database quota', 'QuotaExceededError');
    };
  });
  await open(page, 'newer.dxf', 200);
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('DXF 저장으로 보관');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), locationKey))
    .toBe('failed');
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).not.toContainText('older.dxf');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('복원하지 못했습니다');
});

test('new and open actions win over a delayed IndexedDB restoration', async ({ page }) => {
  await quota(page);
  await page.goto('/');
  await open(page, 'cached.dxf', 100);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), locationKey))
    .toBe('indexed');
  await page.addInitScript(() => {
    const waiting: Array<() => void> = [];
    let blocked = true;
    Object.assign(globalThis, {
      __hancadCacheGate: {
        get pending() {
          return waiting.length;
        },
        release() {
          blocked = false;
          for (const resume of waiting.splice(0)) resume();
        },
      },
    });
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, version) {
      const request = original.call(this, name, version);
      Object.defineProperty(request, 'onsuccess', {
        set(handler: IDBOpenDBRequest['onsuccess']) {
          request.addEventListener(
            'success',
            (event) => {
              const resume = () => handler?.call(request, event);
              if (blocked) waiting.push(resume);
              else resume();
            },
            { once: true },
          );
        },
      });
      return request;
    };
  });
  await page.reload();
  await waitForCacheGate(page);
  await page
    .getByRole('toolbar', { name: '신속 접근 도구막대' })
    .getByRole('button', { name: '새 도면', exact: true })
    .click();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await releaseCacheGate(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), locationKey))
    .toBe('indexed');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).not.toContainText('cached.dxf');
  await open(page, 'intermediate.dxf', 120);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), locationKey))
    .toBe('indexed');
  await page.reload();
  await waitForCacheGate(page);
  await open(page, 'replacement.dxf', 240);
  await releaseCacheGate(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), locationKey))
    .toBe('indexed');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('replacement.dxf');
  await page.reload();
  await waitForCacheGate(page);
  await releaseCacheGate(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('replacement.dxf');
});

test('chunked cache restores a CAD drawing when single large records are rejected', async ({
  page,
}) => {
  await quota(page);
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (typeof value === 'string' && value.length > 600000)
        throw new DOMException('Test single-record limit', 'DataCloneError');
      return original.call(this, value, key);
    };
  });
  await page.goto('/');
  const entities = Array.from(
    { length: 5000 },
    (_, index) =>
      `0\nLINE\n8\n0\n10\n${index % 100}\n20\n${Math.floor(index / 100)}\n11\n${(index % 100) + 1}\n21\n${Math.floor(index / 100) + 1}\n`,
  ).join('');
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'line-grid.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from(`0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`),
  });
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5000');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), locationKey))
    .toBe('indexed');
  const manifest = await page.evaluate(
    () =>
      new Promise<{ chunks: number; length: number }>((resolve, reject) => {
        const request = indexedDB.open('hancad-drawing-cache', 1);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('drawings');
          const value = transaction.objectStore('drawings').get('active');
          value.onsuccess = () => resolve(value.result);
          value.onerror = () => reject(value.error);
          transaction.oncomplete = () => database.close();
        };
        request.onerror = () => reject(request.error);
      }),
  );
  expect(manifest.chunks).toBeGreaterThan(1);
  expect(manifest.length).toBeGreaterThan(600000);
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5000');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-entity-count', '5000');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('line-grid.dxf');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('복원했습니다');
});
