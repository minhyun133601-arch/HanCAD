import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { saveFromFileMenu } from './file-menu';
import { mapping } from './cad-actions';

const output = fileURLToPath(new URL('../../../test-artifacts/basic-cad', import.meta.url));
async function enter(page: Page, value: string): Promise<void> {
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  for (const character of value) {
    if (character === '@') await page.keyboard.press('Shift+Digit2');
    else if (character === '<') await page.keyboard.press('Shift+Comma');
    else if (character === '#') await page.keyboard.press('Shift+Digit3');
    else await page.keyboard.type(character);
  }
  await page.keyboard.press('Enter');
}
async function state(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}').state,
  );
}
async function point(page: Page, view: Awaited<ReturnType<typeof mapping>>, x: number, y: number) {
  await page.mouse.click(
    view.x + view.width / 2 + (x - view.originX) * view.zoom,
    view.y + view.height / 2 + (-y - view.originY) * view.zoom,
  );
}

test('basic drafting, selection, whole-command undo, DXF save, and reload work', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page
    .getByRole('toolbar', { name: '신속 접근 도구막대' })
    .getByRole('button', { name: '새 도면', exact: true })
    .click();
  await enter(page, 'L');
  await enter(page, '10,10');
  await enter(page, '110,10');
  await enter(page, '110,110');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await enter(page, 'C');
  await enter(page, '180,80');
  await enter(page, '0');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('반지름은 0보다');
  await enter(page, '25');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  await enter(page, 'REC');
  await enter(page, '20,140');
  await enter(page, '@60,70');
  await enter(page, 'PL');
  await enter(page, '0,250');
  await enter(page, '100,250');
  await enter(page, '@0,30');
  await enter(page, 'C');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5');
  const draft = await state(page);
  expect(draft.entities[0].a).toEqual({ x: 10, y: -10 });
  expect(draft.entities[1].b).toEqual({ x: 110, y: -110 });
  expect(draft.entities[3].points).toEqual([
    { x: 20, y: -140 },
    { x: 80, y: -140 },
    { x: 80, y: -210 },
    { x: 20, y: -210 },
  ]);
  expect(draft.entities[4].points).toEqual([
    { x: 0, y: -250 },
    { x: 100, y: -250 },
    { x: 100, y: -280 },
  ]);
  expect(draft.entities[4].closed).toBe(true);
  const view = await mapping(page);
  await point(page, view, 60, 10);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  const usableView = path.join(output, '../drafting');
  await fs.mkdir(usableView, { recursive: true });
  await page.screenshot({ path: path.join(usableView, 'usable-view.png') });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  const before = JSON.stringify((await state(page)).entities);
  await fs.mkdir(output, { recursive: true });
  const download = await saveFromFileMenu(page, 'DXF 저장');
  const target = path.join(output, 'basic-drawing.dxf');
  await download.saveAs(target);
  const dxf = await fs.readFile(target, 'utf8');
  expect(dxf).toContain('CIRCLE');
  expect(dxf).toContain('LWPOLYLINE');
  expect(dxf.trimEnd()).toMatch(/EOF$/);
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  expect(JSON.stringify((await state(page)).entities)).toBe(before);
  await page.screenshot({ path: path.join(output, 'basic-drawing.png') });
  expect(errors).toEqual([]);
});

test('mouse points preview all four shapes, preserve the view, and cancel correctly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await enter(page, 'L');
  await enter(page, '50,50');
  await enter(page, '150,50');
  await enter(page, '');
  let view = await mapping(page);
  const zoomBefore = await page.getByTestId('drawing-canvas').getAttribute('data-zoom');
  await page.getByRole('button', { name: '원', exact: true }).click();
  await point(page, view, 100, 50);
  await page.mouse.move(
    view.x + view.width / 2 + (120 - view.originX) * view.zoom,
    view.y + view.height / 2 + (-50 - view.originY) * view.zoom,
  );
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute(
    'data-preview-count',
    /[1-9]\d*/,
  );
  await point(page, view, 120, 50);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-zoom', zoomBefore ?? '');
  view = await mapping(page);
  await page.getByRole('button', { name: '직사각형', exact: true }).click();
  await point(page, view, 65, 30);
  await point(page, view, 140, 70);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  view = await mapping(page);
  await page.getByRole('button', { name: '폴리선', exact: true }).click();
  await point(page, view, 70, 40);
  await point(page, view, 130, 40);
  await point(page, view, 130, 65);
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  view = await mapping(page);
  await page.getByRole('button', { name: '선', exact: true }).click();
  await point(page, view, 55, 60);
  await point(page, view, 145, 60);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await enter(page, 'L');
  await enter(page, '1,1');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '0');
});
