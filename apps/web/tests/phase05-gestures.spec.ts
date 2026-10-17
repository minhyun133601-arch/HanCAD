import { expect, test, type Page } from '@playwright/test';
import { enter, mapping, point, type CanvasMapping } from './cad-actions';

async function drag(
  page: Page,
  view: CanvasMapping,
  points: readonly [number, number][],
): Promise<void> {
  const start = points[0]!;
  await point(page, view, start[0], start[1], false);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await point(page, view, x, y, false);
  await page.mouse.up();
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  for (const value of ['LINE', '0,0', '40,0', '', 'LINE', '80,20', '120,20', ''])
    await enter(page, value);
  await enter(page, 'QPMODE');
  await enter(page, '0');
});
test('window, crossing, Shift removal and two-click PICKDRAG retain directional selection', async ({
  page,
}) => {
  await enter(page, 'PICKAUTO');
  await enter(page, '1');
  const view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas');
  await drag(page, view, [
    [-10, -10],
    [50, 10],
  ]);
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await page.keyboard.press('Escape');
  await drag(page, view, [
    [100, 30],
    [20, -10],
  ]);
  await expect(canvas).toHaveAttribute('data-selection-count', '2');
  await page.keyboard.down('Shift');
  await point(page, view, 10, 0);
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await page.keyboard.press('Escape');
  await enter(page, 'PICKDRAG');
  await enter(page, '0');
  await point(page, view, -10, -10);
  await point(page, view, 50, 10, false);
  await expect(canvas).toHaveAttribute('data-selection-area', 'window');
  await point(page, view, 50, 10);
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
});
test('default press-drag lasso keeps its path and supports enclosed selection', async ({
  page,
}) => {
  const view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas');
  await point(page, view, -10, 10, false);
  await page.mouse.down();
  for (const [x, y] of [
    [50, 10],
    [50, -10],
    [-10, -10],
  ] as const)
    await point(page, view, x, y, false);
  await expect(canvas).toHaveAttribute('data-selection-area', 'lasso');
  await page.screenshot({ path: 'test-artifacts/phase05-production/lasso.png' });
  await point(page, view, -10, 10, false);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await expect(canvas).toHaveAttribute('data-grip-count', '3');
});
test('overlapping objects show a selection cycling list and the chosen entity becomes selected', async ({
  page,
}) => {
  for (const value of ['LINE', '0,0', '40,0', '', 'SELECTIONCYCLING', '2'])
    await enter(page, value);
  const view = await mapping(page);
  await point(page, view, 10, 0);
  const list = page.getByRole('listbox', { name: '선택 순환' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('option')).toHaveCount(2);
  await list.getByRole('option').nth(1).click();
  await expect(list).toBeHidden();
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
});
test('PICKFIRST zero blocks idle picking and Ctrl+A while command selection still accepts Ctrl+A', async ({
  page,
}) => {
  const view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas');
  await enter(page, 'PICKFIRST');
  await enter(page, '0');
  await point(page, view, 10, 0);
  await page.keyboard.press('Control+a');
  await expect(canvas).toHaveAttribute('data-selection-count', '0');
  await enter(page, 'MOVE');
  await canvas.focus();
  await page.keyboard.press('Control+a');
  await expect(canvas).toHaveAttribute('data-selection-count', '2');
  await enter(page, '');
  await enter(page, '0,0');
  await enter(page, '@10,0');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
});
test('an implied second corner accepts typed coordinates and Esc cancels before clearing selection', async ({
  page,
}) => {
  const view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas');
  await point(page, view, -10, -10);
  await expect(page.locator('.command-prompt')).toHaveText('반대 구석 지정:');
  await enter(page, '50,10');
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await expect(canvas).toHaveAttribute('data-selection-area', '');
  await point(page, view, 60, -10);
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('data-selection-count', '0');
});
