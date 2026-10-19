import { expect, test } from '@playwright/test';
import { drawing, enter } from './cad-actions';

test('all property controls fit in the ribbon and the layer list extends over the canvas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  const panel = page.getByRole('tabpanel', { name: '홈', exact: true });
  const controls = ['색상', '선종류', '선가중치', '투명도'];
  for (const label of controls) {
    const control = panel.getByRole('combobox', { name: `Ribbon ${label}`, exact: true });
    await control.scrollIntoViewIfNeeded();
    const ribbon = await panel.boundingBox(),
      bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(ribbon!.y);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(ribbon!.y + ribbon!.height);
  }
  await panel.getByRole('combobox', { name: 'Ribbon 선가중치', exact: true }).selectOption('50');
  await panel.getByRole('combobox', { name: 'Ribbon 투명도', exact: true }).selectOption('40');
  for (const token of ['LINE', '0,0', '100,0', '']) await enter(page, token);
  expect((await drawing(page)).entities[0]).toMatchObject({ lineweight: 50, transparency: 40 });
  for (const token of ['-LAYER', 'N', 'A,B,C,D,E,F,G,H', '']) await enter(page, token);
  await page.getByRole('button', { name: '도면층 목록', exact: true }).click();
  const list = page.locator('.ribbon-layer-list');
  const listBounds = await list.boundingBox(),
    ribbonBounds = await panel.boundingBox();
  expect(listBounds!.y + listBounds!.height).toBeGreaterThan(
    ribbonBounds!.y + ribbonBounds!.height,
  );
  await list.getByRole('button', { name: 'H', exact: true }).click();
  await expect(page.getByRole('button', { name: '도면층 목록', exact: true })).toHaveText('H ▾');
  await expect(list).toBeHidden();
  await page.screenshot({ path: 'test-artifacts/phase08-ribbon-complete.png' });
});
