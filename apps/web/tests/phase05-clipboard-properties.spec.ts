import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { drawing, enter, mapping, point } from './cad-actions';
import { saveFromFileMenu } from './file-menu';

async function line(page: Page): Promise<void> {
  for (const value of ['LINE', '10,10', '30,10', '']) await enter(page, value);
}
async function selectAll(page: Page): Promise<void> {
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
}
async function completeClipboard(page: Page): Promise<void> {
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
}
test.beforeEach(async ({ page, context }) => {
  // Exercise the documented shared-origin fallback deterministically; the native
  // bridge separately carries the registered format, PNG and standard CF_DIB.
  await context.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        read: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
        write: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      },
      configurable: true,
    }),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
});

test('Ctrl+Shift+C then Ctrl+V in another drawing uses the chosen COPYBASE point and one undo step', async ({
  page,
}) => {
  await line(page);
  await selectAll(page);
  await page.keyboard.press('Control+Shift+c');
  await expect(page.locator('.command-prompt')).toHaveText('기준점 지정:');
  await enter(page, '20,30');
  await completeClipboard(page);
  await enter(page, 'NEW');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+v');
  await expect(page.locator('.command-prompt')).toHaveText('삽입점 지정:');
  await enter(page, '100,100');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities[0]).toMatchObject({
    a: { x: 90, y: -80 },
    b: { x: 110, y: -80 },
  });
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});

test('independent HanCAD browser windows share clipboard data without sharing a controller', async ({
  page,
  context,
}) => {
  await line(page);
  await selectAll(page);
  await enter(page, 'COPYBASE');
  await enter(page, '10,10');
  await completeClipboard(page);
  const other = await context.newPage();
  await other.setViewportSize({ width: 1600, height: 1000 });
  await other.goto('/');
  await enter(other, 'NEW');
  await enter(other, 'PASTECLIP');
  await expect(other.locator('.command-prompt')).toHaveText('삽입점 지정:');
  await enter(other, '200,150');
  await expect(other.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(other)).entities[0]).toMatchObject({
    a: { x: 200, y: -150 },
    b: { x: 220, y: -150 },
  });
  await other.close();
});

test('CUTCLIP, PASTEORIG and PASTEBLOCK retain precise original geometry, block membership and history', async ({
  page,
}) => {
  await line(page);
  const original = (await drawing(page)).entities[0]!;
  await selectAll(page);
  await page.keyboard.press('Control+x');
  await completeClipboard(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'PASTEORIG');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect((await drawing(page)).entities[1]).toMatchObject({
    a: { x: 10, y: -10 },
    b: { x: 30, y: -10 },
  });
  expect((await drawing(page)).entities[1]?.id).not.toBe(original.id);
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+Shift+v');
  await expect(page.locator('.command-prompt')).toHaveText('삽입점 지정:');
  await enter(page, '50,50');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  const block = (await drawing(page)).clipboardBlocks?.[0];
  expect(block?.entityIds).toHaveLength(1);
  expect(block?.basePoint).toEqual({ x: 50, y: -50 });
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  expect((await drawing(page)).clipboardBlocks?.[0]).toEqual(block);
  const download = await saveFromFileMenu(page, 'DXF 저장');
  const target = test.info().outputPath('clipboard-block.dxf');
  await download.saveAs(target);
  const bytes = await fs.readFile(target);
  expect(bytes.toString('utf8')).toContain('\r\nINSERT\r\n');
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'clipboard-block.dxf',
    mimeType: 'application/dxf',
    buffer: bytes,
  });
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  await expect.poll(async () => (await drawing(page)).clipboardBlocks?.length).toBe(1);
  expect((await drawing(page)).clipboardBlocks?.[0]?.basePoint).toEqual(block?.basePoint);
});

test('Ctrl+1 Properties edits WCS coordinates and Quick Properties follows its toggle', async ({
  page,
}) => {
  await line(page);
  const view = await mapping(page);
  await point(page, view, 20, 10);
  await page.keyboard.press('Control+1');
  const palette = page.getByTestId('properties-palette');
  await expect(palette).toBeVisible();
  await expect(
    palette.getByRole('combobox', { name: '선가중치', exact: true }).locator('option:checked'),
  ).toHaveText('ByLayer');
  await expect(
    palette.getByRole('combobox', { name: '투명도', exact: true }).locator('option:checked'),
  ).toHaveText('ByLayer');
  await palette.getByRole('combobox', { name: '선가중치', exact: true }).selectOption('25');
  await expect(
    palette.getByRole('combobox', { name: '선가중치', exact: true }).locator('option:checked'),
  ).toHaveText('0.25 mm');
  await expect(palette.getByRole('textbox', { name: '시작 Y', exact: true })).toHaveValue('10');
  await palette.getByRole('textbox', { name: '시작 Y', exact: true }).fill('25');
  await palette.getByRole('textbox', { name: '시작 Y', exact: true }).press('Enter');
  await expect
    .poll(async () => (await drawing(page)).entities[0])
    .toMatchObject({ a: { x: 10, y: -25 } });
  await palette.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+Shift+p');
  await expect(page.getByTestId('quick-properties')).toBeVisible();
  await page
    .getByTestId('quick-properties')
    .getByRole('button', { name: '닫기', exact: true })
    .click();
  await expect(page.getByTestId('quick-properties')).toBeHidden();
});

test('the browser system clipboard carries both exact HanCAD data and a PNG image', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });
  await line(page);
  await selectAll(page);
  await enter(page, 'COPYBASE');
  await enter(page, '10,10');
  await completeClipboard(page);
  const clipboard = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items[0];
    if (!item) throw new Error('System clipboard is empty');
    const text = await (await item.getType('text/plain')).text();
    const image = await item.getType('image/png');
    return {
      data: JSON.parse(text) as { format: string; basePoint: { x: number; y: number } },
      types: item.types,
      imageBytes: image.size,
    };
  });
  expect(clipboard.data).toMatchObject({ format: 'HanCAD.Drawing', basePoint: { x: 10, y: -10 } });
  expect(clipboard.types).toContain('image/png');
  expect(clipboard.imageBytes).toBeGreaterThan(100);
});
