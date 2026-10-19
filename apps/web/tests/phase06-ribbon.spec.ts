import { expect, test } from '@playwright/test';
import { drawing, enter } from './cad-actions';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(process.env.HANCAD_RIBBON_TEST_URL ?? '/');
  for (const [name, value] of [
    ['OSMODE', '0'],
    ['ORTHOMODE', '0'],
    ['DYNMODE', '0'],
  ] as const) {
    await enter(page, name);
    await enter(page, value);
  }
});

test('the ARC construction menu pauses at the real point prompts and creates the expected arc', async ({
  page,
}, testInfo) => {
  await page.locator('[data-draw-methods="ARC"]').click();
  const menu = page.getByRole('menu', { name: '호 작성 방법', exact: true });
  await expect(menu.getByRole('menuitem')).toHaveCount(11);
  await menu.getByRole('menuitem', { name: '시작점, 중심, 각도', exact: true }).click();
  await expect(page.locator('.command-prompt')).toContainText('시작점');
  await enter(page, '0,0');
  await expect(page.locator('.command-prompt')).toContainText('중심점');
  await enter(page, '0,10');
  await expect(page.locator('.command-prompt')).toContainText('사이각');
  await enter(page, '90');
  await expect.poll(async () => (await drawing(page)).entities).toHaveLength(1);
  const arc = (await drawing(page)).entities[0];
  if (arc?.type !== 'arc') throw new Error('Expected an ARC');
  expect(arc.center).toMatchObject({ x: 0, y: -10 });
  expect(arc.radius).toBeCloseTo(10, 9);
  await enter(page, 'ZOOM');
  await enter(page, 'E');
  await page.screenshot({ path: testInfo.outputPath('arc-method-result.png') });
});

test('drawing method menus switch to English and route tangent circles and multiple points canonically', async ({
  page,
}, testInfo) => {
  await page.locator('.language-select').selectOption('en-US');
  await page.locator('[data-draw-methods="CIRCLE"]').click();
  const menu = page.getByRole('menu', { name: 'Circle construction methods', exact: true });
  await expect(menu.getByRole('menuitem')).toHaveCount(6);
  await menu.getByRole('menuitem', { name: 'Tan, Tan, Tan', exact: true }).click();
  await expect(page.locator('.command-prompt')).toContainText('first');
  await page.keyboard.press('Escape');
  await page.locator('[data-draw-methods="MORE"]').click();
  const more = page.getByRole('menu', { name: 'More drawing commands', exact: true });
  await expect(more.getByRole('menuitem', { name: 'Multiple Points', exact: true })).toBeVisible();
  await expect(more.getByRole('menuitem', { name: 'Multiline Style', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('english-draw-method-menu.png') });
  await more.getByRole('menuitem', { name: 'Multiple Points', exact: true }).click();
  await expect(page.locator('.command-prompt')).toContainText('point');
  const input = page.getByRole('textbox', { name: 'Type a command', exact: true });
  for (const coordinate of ['0,0', '10,0']) {
    await input.focus();
    await page.keyboard.type(coordinate);
    await page.keyboard.press('Enter');
  }
  await expect.poll(async () => (await drawing(page)).entities.length).toBe(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.command-prompt')).toHaveText('Command:');
});
