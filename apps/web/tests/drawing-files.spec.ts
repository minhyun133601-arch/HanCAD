import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { chooseFile, saveFromFileMenu } from './file-menu';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const fixture = path.join(root, 'vendor', 'example_2000.dwg');
const output = path.join(root, 'test-artifacts', 'newexports');

test('official DWG opens locally, zooms, persists, and exports real PDF and images', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [],
    externalRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) &&
      !['blob:', 'data:'].includes(url.protocol)
    )
      externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await chooseFile(page, fixture);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70', { timeout: 90000 });
  await expect(page.getByTestId('drawing-import-report')).toContainText('134');
  await expect(page.getByTestId('drawing-import-report')).toContainText('18');
  await page.getByRole('button', { name: '모든 도면층 켜기', exact: true }).click();
  const canvas = page.getByTestId('drawing-canvas');
  await expect(canvas).toHaveAttribute('data-entity-count', /[1-9]\d*/);
  expect(
    await canvas.evaluate((node) => {
      if (!(node instanceof HTMLCanvasElement)) throw new Error('Expected a canvas.');
      const gl = node.getContext('webgl2');
      if (!gl) throw new Error('Expected WebGL2.');
      const pixels = new Uint8Array(node.width * node.height * 4);
      gl.readPixels(0, 0, node.width, node.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let marks = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] !== 33 || pixels[i + 1] !== 40 || pixels[i + 2] !== 48) marks++;
      return marks;
    }),
  ).toBeGreaterThan(100);
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'view-example_2000.png') });
  const zoom = Number(await canvas.getAttribute('data-zoom'));
  await canvas.hover();
  await page.mouse.wheel(0, -200);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-zoom')))
    .toBeGreaterThan(zoom);
  const beforePan = await canvas.screenshot();
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds) throw new Error('Drawing canvas is missing.');
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2,
  );
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2 + 80,
    canvasBounds.y + canvasBounds.height / 2 + 50,
  );
  await page.mouse.up({ button: 'middle' });
  expect((await canvas.screenshot()).equals(beforePan)).toBe(false);
  await page.getByRole('button', { name: '도면 전체 맞춤', exact: true }).click();
  for (const [label, extension, magic] of [
    ['PDF 저장', 'pdf', '%PDF-1.'],
    ['PNG 저장', 'png', 'PNG'],
    ['JPG 저장', 'jpg', ''],
    ['SVG 저장', 'svg', '<svg'],
    ['DXF 저장', 'dxf', ''],
  ] as const) {
    const download = await saveFromFileMenu(page, label);
    expect(download.suggestedFilename()).toBe(`example_2000.${extension}`);
    const target = path.join(output, download.suggestedFilename());
    await download.saveAs(target);
    const bytes = await fs.readFile(target);
    expect(bytes.length).toBeGreaterThan(500);
    if (extension === 'dxf') {
      expect(bytes.toString('utf8')).toContain('ENTITIES');
      expect(bytes.toString('utf8').trimEnd()).toMatch(/EOF$/);
    } else if (magic) expect(bytes.toString('latin1').slice(0, 300)).toContain(magic);
    else expect(Array.from(bytes.subarray(0, 2))).toEqual([255, 216]);
  }
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70');
  await expect(page.getByTestId('drawing-import-report')).toContainText('134');
  await expect(page.getByTestId('drawing-import-report')).toContainText('18');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('example_2000.dwg');
  const zoomBeforeError = await canvas.getAttribute('data-zoom');
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'broken.dwg',
    mimeType: 'application/acad',
    buffer: Buffer.from('invalid DWG bytes'),
  });
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(
    /DWG 파일 서명|DWG.*오류|명령 실행 오류/,
  );
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('example_2000.dwg');
  await expect(canvas).toHaveAttribute('data-zoom', zoomBeforeError ?? '');
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'broken.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from('broken input'),
  });
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(
    /손상|올바르|찾을 수 없|오류/,
  );
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('example_2000.dwg');
  await page.getByRole('button', { name: '개발 현황', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '개발 현황', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('tbody tr')).toHaveCount(26);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('70');
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('cancelling a DWG import keeps the previous drawing', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    class PausedDwgWorker extends NativeWorker {
      private readonly paused: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.paused = options?.name === 'local-dwg-reader';
      }
      override postMessage(
        message: unknown,
        transfer: Transferable[] | StructuredSerializeOptions = [],
      ): void {
        // Keep the actual reader cancellable instead of racing its tiny fixture's decoding time.
        if (this.paused) return;
        if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    globalThis.Worker = PausedDwgWorker;
  });
  await page.goto('/');
  const dxf =
    '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n30\n0\nENDSEC\n0\nEOF\n';
  await page
    .getByTestId('cad-file-input')
    .setInputFiles({ name: 'previous.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) });
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await page.getByTestId('cad-file-input').setInputFiles(fixture);
  await page.getByRole('button', { name: '읽기 취소', exact: true }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('previous.dxf');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('취소');
});

test('a small Korean drawing exports readable text and circle geometry', async ({ page }) => {
  const synthetic = path.join(output, 'synthetic');
  const dxf = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1024',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '0',
    '20',
    '0',
    '11',
    '100',
    '21',
    '0',
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '100',
    '20',
    '0',
    '11',
    '100',
    '21',
    '100',
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '100',
    '20',
    '100',
    '11',
    '0',
    '21',
    '100',
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '0',
    '20',
    '100',
    '11',
    '0',
    '21',
    '0',
    '0',
    'CIRCLE',
    '8',
    '0',
    '10',
    '40',
    '20',
    '40',
    '40',
    '12',
    '0',
    'TEXT',
    '8',
    '0',
    '10',
    '10',
    '20',
    '65',
    '40',
    '5',
    '1',
    '한글 도면 테스트',
    '0',
    'ENDSEC',
    '0',
    'EOF',
    '',
  ].join('\n');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'korean_sample.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from(dxf, 'utf8'),
  });
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('6');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-entity-count', '6');
  await fs.mkdir(synthetic, { recursive: true });
  await page.screenshot({ path: path.join(synthetic, 'view-korean_sample.png') });
  for (const [label, extension] of [
    ['PDF 저장', 'pdf'],
    ['PNG 저장', 'png'],
    ['JPG 저장', 'jpg'],
    ['SVG 저장', 'svg'],
  ] as const) {
    const download = await saveFromFileMenu(page, label);
    expect(download.suggestedFilename()).toBe(`korean_sample.${extension}`);
    await download.saveAs(path.join(synthetic, download.suggestedFilename()));
  }
  await page.getByRole('combobox', { name: '언어' }).selectOption('en-US');
  await page.getByRole('button', { name: 'Development progress', exact: true }).click();
  const progress = page.getByRole('dialog', { name: 'Development progress', exact: true });
  await expect(progress.locator('tbody tr')).toHaveCount(26);
  await expect(progress.locator('tbody tr').first()).toContainText('Bootstrap');
  expect(await progress.locator('tbody tr').first().innerText()).not.toMatch(/[가-힣]/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('6');
});

test('turning on distant large objects fits before rendering and remains undoable', async ({
  page,
}) => {
  const dxf = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1024',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'TABLES',
    '0',
    'TABLE',
    '2',
    'LAYER',
    '70',
    '1',
    '0',
    'LAYER',
    '2',
    '0',
    '70',
    '0',
    '62',
    '-7',
    '6',
    'CONTINUOUS',
    '0',
    'ENDTAB',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '100000000',
    '20',
    '100000000',
    '11',
    '101000000',
    '21',
    '100000000',
    '0',
    'TEXT',
    '8',
    '0',
    '10',
    '100000000',
    '20',
    '100100000',
    '40',
    '10000',
    '1',
    '큰 도면의 문자',
    '0',
    'ENDSEC',
    '0',
    'EOF',
    '',
  ].join('\n');
  await page.goto('/');
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'large-hidden.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from(dxf, 'utf8'),
  });
  const canvas = page.getByTestId('drawing-canvas');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await expect(canvas).toHaveAttribute('data-entity-count', '0');
  const hiddenZoom = Number(await canvas.getAttribute('data-zoom'));
  await page
    .getByRole('button', { name: '모든 도면층 켜기', exact: true })
    .click({ timeout: 5000 });
  await expect(canvas).toHaveAttribute('data-entity-count', '2');
  expect(Number(await canvas.getAttribute('data-zoom'))).toBeLessThan(hiddenZoom / 100);
  await page.keyboard.type('U');
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-entity-count', '0');
  await page.keyboard.type('REDO');
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-entity-count', '2');
  await page.reload();
  await expect(canvas).toHaveAttribute('data-entity-count', '2');
  expect(Number(await canvas.getAttribute('data-zoom'))).toBeLessThan(hiddenZoom / 100);
});
