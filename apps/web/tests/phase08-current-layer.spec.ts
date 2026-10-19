import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, settleView } from './cad-actions';

async function tokens(page: Page, values: readonly string[]): Promise<void> {
  for (const value of values) await enter(page, value);
}

test('locked and off current layers allow LINE creation while a rejected frozen CLAYER adds no Undo entry', async ({
  page,
}) => {
  test.setTimeout(45000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await tokens(page, ['OSMODE', '0', 'ORTHOMODE', '0', 'SNAPMODE', '0', 'DYNMODE', '0']);

  await tokens(page, ['-LAYER', 'M', 'CURRENT_WORK', 'LO', 'CURRENT_WORK', '']);
  expect((await drawing(page)).layers.find((layer) => layer.name === 'CURRENT_WORK')).toMatchObject(
    { visible: true, locked: true },
  );
  await tokens(page, ['L', '0,0', '100,0', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const lockedGeometry = (await drawing(page)).entities;
  expect(lockedGeometry[0]).toMatchObject({
    type: 'line',
    layer: 'CURRENT_WORK',
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
  });
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  expect((await drawing(page)).layers.find((layer) => layer.name === 'CURRENT_WORK')?.locked).toBe(
    true,
  );
  await enter(page, 'REDO');
  expect((await drawing(page)).entities).toEqual(lockedGeometry);

  await tokens(page, ['-LAYER', 'OFF', 'CURRENT_WORK', '']);
  await expect(page.locator('.drawing-tools').getByText('표시 0', { exact: true })).toBeVisible();
  await settleView(page);
  const renderOnly = { style: '[aria-label="명령행"] { visibility: hidden !important; }' };
  const hiddenBefore = await page.getByTestId('drawing-canvas').screenshot(renderOnly);
  await tokens(page, ['L', '0,50', '100,50', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  const offDrawing = await drawing(page);
  expect(offDrawing.settings.layer).toBe('CURRENT_WORK');
  expect(offDrawing.entities[1]).toMatchObject({
    type: 'line',
    layer: 'CURRENT_WORK',
    a: { x: 0, y: -50 },
    b: { x: 100, y: -50 },
  });
  expect(offDrawing.layers.find((layer) => layer.name === 'CURRENT_WORK')).toMatchObject({
    visible: false,
    locked: true,
  });
  await expect(page.locator('.drawing-tools').getByText('표시 0', { exact: true })).toBeVisible();
  await settleView(page);
  expect(
    (await page.getByTestId('drawing-canvas').screenshot(renderOnly)).equals(hiddenBefore),
  ).toBe(true);

  await tokens(page, ['-LAYER', 'N', 'FROZEN_TARGET', 'F', 'FROZEN_TARGET', '']);
  const beforeRejectedCurrent = await drawing(page);
  expect(beforeRejectedCurrent.layers.find((layer) => layer.name === 'FROZEN_TARGET')?.frozen).toBe(
    true,
  );
  await tokens(page, ['CLAYER', 'FROZEN_TARGET']);
  await expect(page.locator('.command-prompt')).toContainText('CLAYER');
  expect((await drawing(page)).settings.layer).toBe('CURRENT_WORK');
  expect((await drawing(page)).entities).toEqual(beforeRejectedCurrent.entities);
  expect((await drawing(page)).layers).toEqual(beforeRejectedCurrent.layers);
  await page.keyboard.press('Escape');
  await enter(page, 'U');
  expect((await drawing(page)).layers).toEqual(offDrawing.layers);
  expect((await drawing(page)).entities).toEqual(offDrawing.entities);
  expect(errors).toEqual([]);
});
