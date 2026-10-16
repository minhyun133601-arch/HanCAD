import { expect, test } from '@playwright/test';
import { enter } from './cad-actions';

test('COMMANDLINEHIDE, TEXTSCR, Ctrl+F2 and the close confirmation drive the command window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '명령 입력', exact: true });
  await enter(page, 'COMMANDLINEHIDE');
  await expect(input).toHaveCount(0);
  await page.keyboard.press('Control+9');
  await expect(input).toBeVisible();

  await enter(page, 'TEXTSCR');
  const textWindow = page.getByRole('dialog', { name: /HanCAD 문자 윈도우/ });
  await expect(textWindow).toBeVisible();
  await expect(textWindow.locator('pre')).toContainText('TEXTSCR');
  await page.keyboard.press('Escape');
  await expect(textWindow).toBeHidden();
  await input.focus();
  await page.keyboard.press('Control+F2');
  await expect(textWindow).toBeVisible();
  await textWindow.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(textWindow).toBeHidden();

  const bar = page.locator('.command-line');
  await bar.getByRole('button', { name: '닫기', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '명령행 - 윈도우 닫기' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '아니오', exact: true }).click();
  await expect(input).toBeVisible();
  await bar.getByRole('button', { name: '닫기', exact: true }).click();
  await confirm.getByRole('button', { name: '예', exact: true }).click();
  await expect(input).toHaveCount(0);
  await page.keyboard.press('Control+9');
  await expect(input).toBeVisible();
});

test('dragging the grip below the drawing area docks the window and F2 then opens the text window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  const bar = page.locator('.command-line');
  await expect(bar).toHaveClass(/floating/);
  const canvas = page.getByTestId('drawing-canvas');
  const floatingHeight = (await canvas.boundingBox())?.height ?? 0;
  const grip = page.getByRole('button', { name: '명령행 이동 및 고정', exact: true });
  const box = await grip.boundingBox();
  if (!box) throw new Error('Command line grip is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(bar).toHaveClass(/docked/);
  // A docked window takes its height from the drawing area instead of covering it.
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0)
    .toBeLessThan(floatingHeight);
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  await page.keyboard.press('F2');
  await expect(page.getByRole('dialog', { name: /HanCAD 문자 윈도우/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.command-line')).toHaveClass(/docked/);
});

test('right-click on the bar opens the command line menu with recent commands', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page, 'GETVAR');
  await enter(page, 'OSMODE');
  await page.locator('.command-input-row').click({ button: 'right' });
  const menu = page.getByRole('menu').first();
  await expect(menu.getByRole('menuitem', { name: '기록 복사' })).toBeVisible();
  await menu.getByRole('menuitem', { name: '최근 명령' }).hover();
  await expect(page.getByRole('menuitem', { name: 'GETVAR', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});
