import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseFile } from './file-menu';
import { installDwgDiagnostics, readDwgSnapshot, readDwgCacheDiagnostics } from './dwg-diagnostics';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const official = path.join(root, 'vendor', 'example_2000.dwg');
const privateFile = process.env.HANCAD_PRIVATE_DWG;
const output = path.join(root, 'test-artifacts', 'user-drawing');
const replacementDxf =
  '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n30\n0\nENDSEC\n0\nEOF\n';

async function waitForRead(page: Page, timeout = 130000): Promise<void> {
  await expect(page.locator('.drawing-loading')).toHaveCount(0, { timeout });
}

test('the user-specified DWG opens from the actual toolbar without uploading its contents', async ({
  page,
}) => {
  test.skip(!privateFile, 'Set HANCAD_PRIVATE_DWG to inspect the user-provided local drawing.');
  test.setTimeout(240000);
  if (!privateFile) return;
  const file = path.resolve(privateFile);
  const info = await fs.stat(file);
  const handle = await fs.open(file, 'r');
  const header = Buffer.alloc(6);
  await handle.read(header, 0, 6, 0);
  await handle.close();
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  let crashes = 0;
  const externalRequests: string[] = [];
  const stages: { elapsedMs: number; label: string }[] = [];
  let started = Date.now();
  await fs.mkdir(output, { recursive: true });
  await page.exposeFunction('recordDwgReadStage', async (label: string) => {
    const stage = { elapsedMs: Date.now() - started, label };
    stages.push(stage);
    console.log(JSON.stringify({ dwgStage: stage }));
    await fs.writeFile(
      path.join(output, 'read-progress.json'),
      JSON.stringify({ stages }, null, 2),
    );
  });
  await page.addInitScript(() => {
    let last = '';
    const observe = (): void => {
      const update = (): void => {
        const label = document.querySelector('.drawing-loading p')?.textContent?.trim() ?? '';
        if (label === last) return;
        last = label;
        const api = window as typeof window & {
          recordDwgReadStage?: (value: string) => Promise<void>;
        };
        void api.recordDwgReadStage?.(label || 'idle');
      };
      new MutationObserver(update).observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      update();
    };
    document.addEventListener('DOMContentLoaded', observe, { once: true });
  });
  const writeRuntimeErrors = (): void => {
    void fs
      .writeFile(
        path.join(output, 'runtime-errors.json'),
        JSON.stringify({ errors, consoleErrors, crashes }, null, 2),
      )
      .catch(() => undefined);
  };
  page.on('pageerror', (error) => {
    errors.push(error.stack ?? error.message);
    writeRuntimeErrors();
  });
  page.on('crash', () => {
    crashes += 1;
    writeRuntimeErrors();
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    consoleErrors.push(message.text().slice(0, 2000));
    writeRuntimeErrors();
  });
  writeRuntimeErrors();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) &&
      !['blob:', 'data:'].includes(url.protocol)
    )
      externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  page.setDefaultTimeout(20000);
  await page.goto('/');
  await installDwgDiagnostics(page);
  started = Date.now();
  console.log(
    JSON.stringify({
      privateDrawing: path.basename(file),
      bytes: info.size,
      signature: header.toString('ascii'),
      started: true,
    }),
  );
  await chooseFile(page, file);
  await waitForRead(page);
  const snapshot = await readDwgSnapshot(page);
  const summary = {
    fileName: path.basename(file),
    bytes: info.size,
    signature: header.toString('ascii'),
    elapsedMs: Date.now() - started,
    entities: Number(snapshot.entityText),
    report: snapshot.report,
    history: snapshot.history,
    parserMetadata: snapshot.parserMetadata,
    cacheDiagnostics: snapshot.cacheDiagnostics,
    stages,
    errors,
    consoleErrors,
    crashes,
    externalRequests,
  };
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'read-summary.json'), JSON.stringify(summary, null, 2));
  await page.screenshot({ path: path.join(output, 'user-dwg-view.png') });
  console.log(JSON.stringify(summary));
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(summary.entities).toBeGreaterThan(0);
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText(
    path.basename(file),
  );
  page.setDefaultTimeout(60000);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('hancad.active-drawing.location.v1')), {
      timeout: 60000,
    })
    .not.toBe('pending');
  const initialCache = await readDwgCacheDiagnostics(page);
  await fs.writeFile(
    path.join(output, 'cache-summary.json'),
    JSON.stringify(initialCache, null, 2),
  );
  console.log(JSON.stringify({ dwgInitialCache: initialCache }));
  expect(['local', 'indexed']).toContain(initialCache.location);
  const hiddenNotice = page.locator('.hidden-layers-notice');
  let allLayersExplicitlyEnabled = false;
  if (await hiddenNotice.count()) {
    const profiler = await page.context().newCDPSession(page);
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.setSamplingInterval', { interval: 1000 });
    await profiler.send('Profiler.start');
    try {
      await hiddenNotice.getByRole('button', { name: '모든 도면층 켜기', exact: true }).click();
      allLayersExplicitlyEnabled = true;
    } catch (error) {
      await fs.writeFile(
        path.join(output, 'layon-failure.json'),
        JSON.stringify(
          {
            error: error instanceof Error ? error.message : String(error),
            errors,
            consoleErrors,
            crashes,
          },
          null,
          2,
        ),
      );
      throw error;
    } finally {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          profiler.send('Profiler.stop'),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error('CPU profile did not respond within 10 seconds.')),
              10000,
            );
          }),
        ]);
        await fs.writeFile(path.join(output, 'layon.cpuprofile'), JSON.stringify(result.profile));
      } catch (error) {
        await fs.writeFile(
          path.join(output, 'profile-error.txt'),
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
  }
  const canvas = page.getByTestId('drawing-canvas');
  await page.screenshot({ path: path.join(output, 'user-dwg-view.png') });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('hancad.active-drawing.location.v1')), {
      timeout: 60000,
    })
    .not.toBe('pending');
  const storage = await page.evaluate(async () => {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        storedCharacters: localStorage.getItem('hancad.active-drawing.v1')?.length ?? 0,
        cacheLocation: localStorage.getItem('hancad.active-drawing.location.v1'),
        usageBytes: estimate.usage,
        quotaBytes: estimate.quota,
      };
    } catch {
      return { storedCharacters: 0, readFailed: true };
    }
  });
  await page.evaluate(() => {
    const target = document.querySelector<HTMLCanvasElement>('[data-testid="drawing-canvas"]');
    if (!target) throw new Error('The drawing canvas is missing.');
    const diagnostic = globalThis as typeof globalThis & {
      dwgInteractionTimings?: { wheelMs: number[]; panMs: number[] };
    };
    const timings = { wheelMs: [] as number[], panMs: [] as number[] };
    diagnostic.dwgInteractionTimings = timings;
    let start = 0;
    target.addEventListener(
      'wheel',
      () => {
        start = performance.now();
      },
      { capture: true },
    );
    target.addEventListener('wheel', () => timings.wheelMs.push(performance.now() - start));
    target.addEventListener(
      'pointermove',
      (event) => {
        if (event.buttons === 4) start = performance.now();
      },
      { capture: true },
    );
    target.addEventListener('pointermove', (event) => {
      if (event.buttons === 4) timings.panMs.push(performance.now() - start);
    });
  });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The drawing canvas has no dimensions.');
  const zoomBefore = Number(await canvas.getAttribute('data-zoom'));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-zoom')))
    .toBeGreaterThan(zoomBefore);
  const zoomAfter = Number(await canvas.getAttribute('data-zoom'));
  expect(zoomAfter).toBeGreaterThan(zoomBefore);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30);
  await page.mouse.up({ button: 'middle' });
  await page.screenshot({ path: path.join(output, 'user-dwg-zoomed.png') });
  const timings = await page.evaluate(() => {
    const diagnostic = globalThis as typeof globalThis & {
      dwgInteractionTimings?: { wheelMs: number[]; panMs: number[] };
    };
    return diagnostic.dwgInteractionTimings;
  });
  const visibility = Number(await canvas.getAttribute('data-entity-count'));
  // The user's drawing has distant objects; inspect the floor-plan frame at the right as well.
  await page.getByRole('button', { name: '도면 전체 맞춤', exact: true }).click();
  await page.mouse.move(box.x + box.width * 0.874, box.y + box.height * 0.44);
  await page.mouse.wheel(0, -1000);
  await page.mouse.wheel(0, -1000);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.up({ button: 'middle' });
  await page.screenshot({ path: path.join(output, 'user-dwg-detail.png') });
  const historyAfterInteractions = await page.getByRole('log', { name: '명령 기록' }).textContent();
  const reloadStarted = Date.now();
  await page.reload();
  if (storage.storedCharacters > 0 || storage.cacheLocation === 'indexed') {
    await expect(page.getByTestId('drawing-entity-count')).toHaveText(String(summary.entities), {
      timeout: 60000,
    });
  }
  const reload = {
    elapsedMs: Date.now() - reloadStarted,
    entities: Number(await page.getByTestId('drawing-entity-count').textContent()),
  };
  if (storage.storedCharacters > 0 || storage.cacheLocation === 'indexed')
    expect(reload.entities).toBe(summary.entities);
  const interactions = {
    initialCache,
    allLayersExplicitlyEnabled,
    visibleEntities: visibility,
    zoomBefore,
    zoomAfter,
    timings,
    storage,
    historyAfterInteractions,
    reload,
  };
  await fs.writeFile(
    path.join(output, 'interaction-summary.json'),
    JSON.stringify(interactions, null, 2),
  );
  await fs.writeFile(
    path.join(output, 'read-summary.json'),
    JSON.stringify({ ...summary, interactions }, null, 2),
  );
  console.log(JSON.stringify({ dwgInteractions: interactions }));
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('a cold DWG reader reopens the same Korean-named file and restores it after reload', async ({
  page,
}) => {
  test.setTimeout(180000);
  const bytes = await fs.readFile(official);
  const fixture = { name: '한글 도면 다시 열기.dwg', mimeType: 'application/acad', buffer: bytes };
  await page.goto('/');
  await chooseFile(page, fixture);
  await waitForRead(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70');
  await expect(page.getByTestId('drawing-import-report')).toContainText('134');
  const tabs = page
    .getByRole('navigation', { name: '도면 탭' })
    .getByRole('button', { name: fixture.name, exact: true });
  const reports = page
    .getByRole('log', { name: '명령 기록' })
    .locator('.history-line')
    .filter({ hasText: /70개 객체/ });
  const documentIdentity = () =>
    page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}') as {
        documentId?: string;
      };
      return session.documentId;
    });
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
  await expect(reports).toHaveCount(1);
  const firstDocumentId = await documentIdentity();
  expect(firstDocumentId).toBeTruthy();
  await chooseFile(page, fixture);
  await waitForRead(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70');
  const name = page.getByRole('navigation', { name: '도면 탭' });
  await expect(name).toContainText(fixture.name);
  // Each successful OPEN owns a new document and one import report in its command workspace.
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(reports).toHaveCount(1);
  const secondDocumentId = await documentIdentity();
  expect(secondDocumentId).toBeTruthy();
  expect(secondDocumentId).not.toBe(firstDocumentId);
  await tabs.first().click();
  await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70');
  await expect(page.getByTestId('drawing-import-report')).toContainText('134');
  expect(await documentIdentity()).toBe(firstDocumentId);
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70');
  expect(await documentIdentity()).toBe(secondDocumentId);
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70');
  await expect(name).toContainText(fixture.name);
  await expect(page.getByTestId('drawing-import-report')).toContainText('134');
});

test('an empty file chooser result and cancelling a read preserve the current drawing', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/');
  await chooseFile(page, {
    name: 'previous.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from(replacementDxf),
  });
  await waitForRead(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '파일', exact: true }).click();
  await page.getByRole('menuitem', { name: 'DWG / DXF 열기', exact: true }).click();
  await (await chooser).setFiles([]);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('previous.dxf');
  await chooseFile(page, official);
  await page.getByRole('button', { name: '읽기 취소', exact: true }).click();
  await waitForRead(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('previous.dxf');
});

test('a replacement DXF wins over a DWG still being decoded and can be reopened', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/');
  await chooseFile(page, official);
  await expect(page.locator('.drawing-loading')).toHaveCount(1);
  const replacement = {
    name: 'replacement.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from(replacementDxf),
  };
  await page.getByTestId('cad-file-input').setInputFiles(replacement);
  await waitForRead(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText(replacement.name);
  await chooseFile(page, replacement);
  await waitForRead(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText(replacement.name);
  await expect(page.getByRole('log', { name: '명령 기록' })).not.toContainText(
    'example_2000.dwg: 70',
  );
});
