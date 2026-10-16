import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { enter, settleView } from './cad-actions';

async function command(page: Page, ...values: string[]) {
  for (const value of values) await enter(page, value);
}
async function zoom(page: Page): Promise<number> {
  return Number(await page.getByTestId('drawing-canvas').getAttribute('data-zoom'));
}
async function variable(page: Page, name: string): Promise<number[]> {
  await command(page, 'GETVAR', name);
  const result = await page
    .getByRole('log', { name: '명령 기록' })
    .locator('.history-line')
    .last()
    .innerText();
  return (result.split(' = ')[1] ?? '').split(',').map(Number);
}
async function ready(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/?devtools=1');
  await command(page, 'VTENABLE', '0', 'L', '0,0', '100,0', '100,100', '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await command(page, 'Z', 'E');
  const bounds = await page.getByTestId('drawing-canvas').boundingBox();
  if (!bounds) throw new Error('Canvas absent');
  await expect.poll(() => zoom(page)).toBeCloseTo((bounds.height * 0.95) / 100);
}

test('ZOOM options share interactive prompts, keyword clicks and previous views', async ({
  page,
}) => {
  await ready(page);
  const extents = await zoom(page);
  await command(page, 'Z', '2X');
  await expect.poll(() => zoom(page)).toBeCloseTo(extents * 2);
  await command(page, 'Z');
  await page.getByRole('button', { name: '이전(P)', exact: true }).click();
  await expect.poll(() => zoom(page)).toBeCloseTo(extents);
  await command(page, 'Z', 'S', '.5X');
  await expect.poll(() => zoom(page)).toBeCloseTo(extents / 2);
  await command(page, 'Z', 'W', '0,0', '50,50');
  const window = await zoom(page);
  await command(page, 'Z', 'C', '50,50', '100');
  await expect.poll(() => zoom(page)).toBeCloseTo(window / 2);
  expect(await variable(page, 'VIEWCTR')).toEqual([50, 50, 0]);
  await command(page, 'Z', 'A');
  await settleView(page);
  const all = await zoom(page);
  expect(all).toBeLessThan(extents);
  await command(page, 'Z', '2');
  await expect.poll(() => zoom(page)).toBeCloseTo((all * 2) / 0.95);
  await command(page, 'Z', 'O', 'ALL', '');
  await expect.poll(() => zoom(page)).toBeCloseTo(extents);
  await command(page, 'Z', 'S', '2XP');
  await expect(page.locator('.command-prompt')).toContainText('축척 비율');
  await page.keyboard.press('Escape');
  const beforeDynamic = await zoom(page);
  await command(page, 'Z', 'D');
  expect(await zoom(page)).toBeLessThan(beforeDynamic);
  await page.keyboard.press('Escape');
  await expect.poll(() => zoom(page)).toBeCloseTo(beforeDynamic);
  await command(page, 'Z', 'D');
  const bounds = await page.getByTestId('drawing-canvas').boundingBox();
  if (!bounds) throw new Error('Canvas absent');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height / 2);
  await settleView(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => zoom(page)).toBeGreaterThan(extents);
  await command(page, 'REGEN', 'REGENALL', 'REDRAW', 'REDRAWALL');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
});

test('interrupted smooth transitions and immediate undo preserve the displayed view', async ({
  page,
}) => {
  await ready(page);
  await command(
    page,
    'UNDO',
    'C',
    'Combine',
    'OFF',
    'VTENABLE',
    '1',
    'VTDURATION',
    '1500',
    'VTFPS',
    '1',
  );
  const initial = await zoom(page);
  await command(page, 'Z', '2X', 'U');
  await expect.poll(() => zoom(page)).toBeCloseTo(initial);
  // A cancelled animation must not restart and overwrite Undo on a later animation frame.
  await page.waitForTimeout(200);
  await expect.poll(() => zoom(page)).toBeCloseTo(initial);
  await command(page, 'Z', '2X');
  await expect.poll(() => zoom(page), { intervals: [20, 20, 20] }).toBeGreaterThan(initial * 1.05);
  const canvas = page.getByTestId('drawing-canvas'),
    bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas absent');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -100);
  const interrupted = await zoom(page);
  expect(interrupted).toBeGreaterThan(initial * 1.6);
  await command(page, 'U');
  const resumed = await zoom(page);
  expect(resumed).toBeGreaterThan(initial);
  expect(resumed).toBeLessThan(interrupted);
  await command(page, 'U');
  await expect.poll(() => zoom(page)).toBeCloseTo(initial);
});

test('realtime zoom, PAN, -PAN and wheel navigation preserve view history', async ({ page }) => {
  await ready(page);
  const canvas = page.getByTestId('drawing-canvas'),
    bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas absent');
  const point = { x: bounds.x + bounds.width * 0.65, y: bounds.y + bounds.height * 0.4 };
  const initial = await zoom(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => zoom(page)).toBeCloseTo(initial * 1.6);
  await command(page, 'Z', 'P');
  await expect.poll(() => zoom(page)).toBeCloseTo(initial);
  await command(page, 'Z', '');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y - 80, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Enter');
  expect(await zoom(page)).toBeGreaterThan(initial);
  const center = await variable(page, 'VIEWCTR');
  await command(page, '-PAN', '0,0', '20,10');
  const moved = await variable(page, 'VIEWCTR');
  expect(moved[0]).toBeCloseTo(center[0]! - 20);
  expect(moved[1]).toBeCloseTo(center[1]! - 10);
  await command(page, 'PAN');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 50, point.y + 25, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Enter');
  expect(await variable(page, 'VIEWCTR')).not.toEqual(moved);
});

test('grid, crosshair, UCS, background options and dev stress stay controllable', async ({
  page,
}) => {
  await ready(page);
  const canvas = page.getByTestId('drawing-canvas');
  await expect(page.getByRole('button', { name: '그리드', exact: true })).toBeEnabled();
  await page.keyboard.press('F7');
  expect(await variable(page, 'GRIDMODE')).toEqual([0]);
  await command(
    page,
    'CURSORSIZE',
    '100',
    'PICKBOX',
    '12',
    'GRIDSTYLE',
    '1',
    'GRIDMODE',
    '1',
    'GRIDDISPLAY',
    '0',
  );
  await command(page, 'UCSICON', 'OFF');
  expect(await variable(page, 'UCSICON')).toEqual([2]);
  await command(page, 'UCSICON', 'ON', 'UCSICON', 'N');
  expect(await variable(page, 'UCSICON')).toEqual([1]);
  await command(page, 'OP');
  const dialog = page.getByRole('dialog', { name: '옵션 — 화면 표시' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '검정', exact: true }).click();
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('hancad.canvas.background'))).toBe(
    '#000000',
  );
  await command(page, 'DEVSTRESS', '1000');
  await expect(canvas).toHaveAttribute('data-stress-count', '1000');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await command(page, 'DEVSTRESS', '0');
  await expect(canvas).toHaveAttribute('data-stress-count', '0');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
