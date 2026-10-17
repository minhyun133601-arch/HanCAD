import { expect, test, type Page } from '@playwright/test';
import { drawing, enter } from './cad-actions';

const commandInput = (page: Page) => page.getByRole('textbox', { name: '명령 입력', exact: true });
const overlay = (page: Page) => page.getByTestId('dynamic-input');
const dialog = (page: Page) => page.getByRole('dialog', { name: '제도 설정', exact: true });

async function variable(page: Page, name: string, value: string): Promise<void> {
  await enter(page, name);
  await enter(page, value);
}
async function cursor(page: Page): Promise<void> {
  const canvas = page.getByTestId('drawing-canvas');
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Drawing canvas is missing');
  await page.mouse.move(rect.x + rect.width * 0.2, rect.y + rect.height * 0.2);
  await canvas.focus();
}

test('physical numeric keys keep IME inactive while Tab locks length and angle for a mouse pick', async ({
  page,
}) => {
  await page.goto('/');
  await variable(page, 'OSMODE', '0');
  await variable(page, 'SNAPMODE', '0');
  await variable(page, 'DYNMODE', '3');
  await enter(page, 'L');
  await enter(page, '0,0');
  await cursor(page);
  await expect(overlay(page).locator('[data-field="distance"]')).toBeVisible();
  for (const code of ['Digit1', 'Digit0', 'Digit0']) {
    await page
      .getByTestId('drawing-canvas')
      .dispatchEvent('keydown', { key: 'Process', code, bubbles: true });
  }
  await expect(commandInput(page)).toContainText('100');
  await page.keyboard.press('Tab');
  await expect(overlay(page).locator('[data-field="distance"]')).toHaveAttribute(
    'data-locked',
    'true',
  );
  await expect(overlay(page).locator('[data-field="angle"]')).toHaveClass(/active/);
  await expect(commandInput(page)).toHaveJSProperty('tagName', 'DIV');
  await page.keyboard.press('Shift+Comma');
  await expect(overlay(page).locator('[data-field="angle"]')).toHaveClass(/active/);
  await page.keyboard.type('30');
  await page.keyboard.press('Tab');
  await expect(overlay(page).locator('[data-field="angle"]')).toHaveAttribute(
    'data-locked',
    'true',
  );
  const rect = await page.getByTestId('drawing-canvas').boundingBox();
  if (!rect) throw new Error('Drawing canvas is missing');
  await page.mouse.click(rect.x + rect.width / 2 + 160, rect.y + rect.height / 2 - 130);
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const line = (await drawing(page)).entities[0];
  expect(line?.type).toBe('line');
  if (!line || line.type !== 'line') throw new Error('Expected LINE');
  expect(line.b.x).toBeCloseTo(100 * Math.cos(Math.PI / 6), 9);
  expect(line.b.y).toBeCloseTo(-50, 9);
});

test('pointer comma fields accept explicit absolute coordinates and Down options submit LINE keywords', async ({
  page,
}) => {
  await page.goto('/');
  await variable(page, 'DYNMODE', '1');
  await variable(page, 'DYNPIFORMAT', '1');
  await enter(page, 'L');
  await enter(page, '10,10');
  await cursor(page);
  await page.keyboard.press('Shift+Digit3');
  await page.keyboard.type('100');
  await page.keyboard.press('Comma');
  await expect(overlay(page).locator('[data-field="y"]')).toHaveClass(/active/);
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  const options = overlay(page).getByRole('menu', { name: '동적 입력 옵션' });
  await expect(options).toBeVisible();
  await options.getByRole('menuitem', { name: '명령 취소(U)', exact: true }).click();
  await expect(page.locator('.command-prompt')).toHaveText('다음 점 지정 또는 [명령 취소(U)]:');
  await enter(page, '100,50');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities[0]).toMatchObject({
    a: { x: 10, y: -10 },
    b: { x: 100, y: -50 },
  });
});

test('typed LINE Undo and explicit angle overrides take priority over locked dynamic fields', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page, 'L');
  await enter(page, '0,0');
  await enter(page, '100,0');
  await enter(page, '100,100');
  await cursor(page);
  await page.keyboard.press('Tab');
  await page.keyboard.type('30');
  await page.keyboard.press('Tab');
  await expect(overlay(page).locator('[data-field="angle"]')).toHaveAttribute(
    'data-locked',
    'true',
  );
  await page.keyboard.type('UNDO');
  await page.keyboard.press('Enter');
  await expect(page.locator('.command-prompt')).toHaveText('다음 점 지정 또는 [명령 취소(U)]:');
  await enter(page, '<30');
  const rect = await page.getByTestId('drawing-canvas').boundingBox();
  if (!rect) throw new Error('Drawing canvas is missing');
  await page.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height * 0.2);
  await enter(page, '100');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect((await drawing(page)).entities[0]).toMatchObject({
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
  });
  const second = (await drawing(page)).entities[1];
  if (!second || second.type !== 'line') throw new Error('Expected the angle-locked LINE segment');
  expect(second.b.x).toBeCloseTo(100 + 100 * Math.cos(Math.PI / 6), 9);
  expect(second.b.y).toBeCloseTo(-50, 9);
});

test('drafting settings remembers its tab, parses SNAPANG and routes status settings to their tab', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page, 'DS');
  await expect(dialog(page).getByRole('tab')).toHaveCount(7);
  await dialog(page).getByLabel('스냅 각도', { exact: true }).fill('45');
  await dialog(page).getByRole('tab', { name: '동적 입력', exact: true }).click();
  await dialog(page).getByRole('button', { name: '확인', exact: true }).click();
  await enter(page, 'DS');
  await expect(dialog(page).getByRole('tab', { name: '동적 입력', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await dialog(page).getByRole('button', { name: '취소', exact: true }).click();
  await enter(page, 'GETVAR');
  await enter(page, 'SNAPANG');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(
    'SNAPANG = 0.7853981633974483',
  );
  await page
    .getByRole('toolbar', { name: '상태막대', exact: true })
    .getByRole('button', { name: '객체 스냅', exact: true })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: '설정...', exact: true }).click();
  await expect(dialog(page).getByRole('tab', { name: '객체 스냅', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await dialog(page).getByRole('button', { name: '취소', exact: true }).click();
});

test('tooltip appearance applies only to value fields when DYNTOOLTIPS is zero and stays inside the viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await variable(page, 'DYNTOOLTIPS', '0');
  await variable(page, 'TOOLTIPSIZE', '3');
  await variable(page, 'TOOLTIPTRANSPARENCY', '50');
  await cursor(page);
  await page.keyboard.type('L');
  await expect(overlay(page).locator('.dynamic-command-text')).toHaveText('L');
  await page.keyboard.press('Enter');
  await enter(page, '0,0');
  const canvas = page.getByTestId('drawing-canvas');
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Drawing canvas is missing');
  await page.mouse.move(rect.x + rect.width - 8, rect.y + 20);
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page).locator('.dynamic-fields')).toHaveCSS('font-size', '15px');
  await expect(overlay(page).locator('.dynamic-fields')).toHaveCSS('opacity', '0.5');
  await expect(overlay(page).locator('.dynamic-prompt')).toHaveCSS('font-size', '12px');
  await expect(overlay(page).locator('.dynamic-prompt')).toHaveCSS('opacity', '1');
  const tooltip = await overlay(page).boundingBox();
  if (!tooltip) throw new Error('Dynamic tooltip is missing');
  expect(tooltip.x).toBeGreaterThanOrEqual(rect.x);
  expect(tooltip.x + tooltip.width).toBeLessThanOrEqual(rect.x + rect.width);
  await page.screenshot({ path: testInfo.outputPath('dynamic-tooltip.png') });
});
