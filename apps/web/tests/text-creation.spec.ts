import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';
import { chooseFile, saveFromFileMenu } from './file-menu';

const output = fileURLToPath(new URL('../../../test-artifacts/text-creation', import.meta.url));
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function heightVariable(page: Page, value: string): Promise<void> {
  await enter(page, 'GETVAR');
  await enter(page, 'TEXTSIZE');
  await expect(
    page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last(),
  ).toHaveText(`TEXTSIZE = ${value}`);
}

test('DT enters Korean lines in place, ignores composition Enter and groups undo with remembered height', async ({
  page,
}) => {
  await enter(page, 'DT');
  await enter(page, '10,20');
  await enter(page, '5');
  await enter(page, '30');
  const input = page.getByRole('textbox', { name: '도면 문자 입력', exact: true });
  await expect(input).toBeFocused();
  await input.dispatchEvent('compositionstart', { data: '' });
  await input.fill('한');
  await input.dispatchEvent('compositionupdate', { data: '한' });
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('한');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '0');
  await input.dispatchEvent('compositionend', { data: '한' });
  await input.fill('한글 도면 A');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '1');
  await input.fill('두 번째 기준선');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  const accepted = (await drawing(page)).entities;
  expect(accepted[0]).toMatchObject({
    type: 'text',
    text: '한글 도면 A',
    point: { x: 10, y: -20 },
    textSize: 5,
  });
  const second = accepted[1];
  if (second?.type !== 'text') throw new Error('Expected a second TEXT entity.');
  expect(second.text).toBe('두 번째 기준선');
  expect(second.rotation).toBeCloseTo(-Math.PI / 6);
  expect(second.point.x).toBeCloseTo(13.125);
  expect(second.point.y).toBeCloseTo(-20 + Math.cos(Math.PI / 6) * 6.25);
  await heightVariable(page, '5');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await heightVariable(page, '2.5');
  await enter(page, 'MREDO');
  await enter(page, '1');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await heightVariable(page, '5');
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect((await drawing(page)).entities).toEqual(accepted);
  await heightVariable(page, '5');
  await page.evaluate(() => {
    localStorage.setItem(
      'hancad.drafting-variables.v1',
      JSON.stringify({ documentId: crypto.randomUUID(), values: { TEXTSIZE: 99 } }),
    );
  });
  await page.reload();
  await heightVariable(page, '5');
  expect((await drawing(page)).entities).toEqual(accepted);
});

test('mouse insertion, height and rotation preserve accepted Korean text when Escape discards a partial line', async ({
  page,
}) => {
  await enter(page, 'L');
  await enter(page, '0,0');
  await enter(page, '100,100');
  await enter(page, '');
  const view = await mapping(page);
  await enter(page, 'OSMODE');
  await enter(page, '1');
  await enter(page, 'TEXT');
  await point(page, view, 0, 0);
  await point(page, view, 0, 5, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '1');
  await point(page, view, 0, 5);
  await point(page, view, 20, 0);
  const input = page.getByRole('textbox', { name: '도면 문자 입력', exact: true });
  await expect(input).toBeFocused();
  await input.fill('확정 문자');
  await page.keyboard.press('Enter');
  await input.fill('버릴 문자');
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '0');
  const text = (await drawing(page)).entities[1];
  expect(text).toMatchObject({ type: 'text', text: '확정 문자', point: { x: 0, y: 0 } });
  if (text?.type !== 'text') throw new Error('Expected accepted text after Escape.');
  expect(text.textSize).toBeCloseTo(5, 0);
  expect(text.rotation).toBeCloseTo(0, 1);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'mouse-text-escape.png') });
});

test('TEXT remembers an accepted height without lines and Korean TEXT saves and reopens through actual DXF', async ({
  page,
}) => {
  await enter(page, 'TEXT');
  await enter(page, '0,0');
  await enter(page, '6');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await heightVariable(page, '6');
  await enter(page, 'U');
  await heightVariable(page, '2.5');
  await enter(page, 'MREDO');
  await enter(page, '1');
  await heightVariable(page, '6');
  await page.reload();
  await heightVariable(page, '6');
  await enter(page, 'DTEXT');
  await enter(page, '12,24');
  await expect(page.locator('.command-prompt')).toHaveText('높이 지정 <6>:');
  await enter(page, '');
  await enter(page, '0');
  const input = page.getByRole('textbox', { name: '도면 문자 입력', exact: true });
  await input.fill('한글 DXF 문자');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const source = (await drawing(page)).entities[0];
  expect(source).toMatchObject({ type: 'text', textSize: 6, text: '한글 DXF 문자' });
  await fs.mkdir(output, { recursive: true });
  const download = await saveFromFileMenu(page, 'DXF 저장');
  const target = path.join(output, 'korean-text.dxf');
  await download.saveAs(target);
  const dxf = await fs.readFile(target, 'utf8');
  expect(dxf).toMatch(/\r?\nTEXT\r?\n/);
  expect(dxf).toContain('한글 DXF 문자');
  await enter(page, 'NEW');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await chooseFile(page, target);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const imported = (await drawing(page)).entities[0];
  expect(imported).toMatchObject({
    type: 'text',
    text: '한글 DXF 문자',
    point: { x: 12, y: -24 },
    textSize: 6,
  });
  if (imported?.type !== 'text') throw new Error('Expected DXF TEXT.');
  expect(imported.rotation).toBeCloseTo(0);
  await enter(page, 'TEXTSIZE');
  await enter(page, '9');
  await page.reload();
  await heightVariable(page, '9');
  expect((await drawing(page)).entities[0]).toMatchObject({ textSize: 6, text: '한글 DXF 문자' });
});
