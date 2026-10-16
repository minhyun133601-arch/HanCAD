import { expect, test } from '@playwright/test';
import { enter } from './cad-actions';

test('Alt keytips navigate tabs and run a tool macro while Escape backs out without cancelling LINE', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '명령 입력', exact: true });
  await input.focus();
  await page.keyboard.press('Alt');
  await expect(page.locator('[data-ribbon-keytip-badge="F"]')).toBeVisible();
  await expect(page.locator('[data-ribbon-keytip-badge="H"]')).toBeVisible();
  await expect(page.locator('[data-ribbon-keytip-badge="IN"]')).toBeVisible();
  await page.keyboard.type('IN');
  await expect(page.getByRole('tab', { name: '삽입', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-ribbon-keytip-badge="B"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.type('H');
  await expect(page.locator('[data-ribbon-keytip-badge="LI"]')).toBeVisible();
  await page.keyboard.type('LI');
  await expect(page.locator('.command-prompt')).toHaveText('첫 번째 점 지정:');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('명령: _LINE');
  await expect(page.locator('.ribbon-keytips')).toHaveCount(0);

  await page.keyboard.press('Alt');
  await page.keyboard.type('H');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ribbon-keytip-badge="H"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ribbon-keytips')).toHaveCount(0);
  await expect(page.locator('.command-prompt')).toHaveText('첫 번째 점 지정:');
  await expect(input).toHaveText('');
});

test('Alt+F opens the application menu and keytips return to the ribbon on Escape', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  await page.keyboard.press('Alt+KeyF');
  await expect(page.getByRole('menu', { name: '파일', exact: true })).toBeVisible();
  await expect(page.locator('[data-ribbon-keytip-badge="N"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: '파일', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-ribbon-keytip-badge="H"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ribbon-keytips')).toHaveCount(0);
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
});

test('text input, modal dialogs, AltGr and MENUBAR retain keyboard priority over keytips', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '명령 입력', exact: true });
  await enter(page, 'MODEMACRO');
  await expect(input).toHaveJSProperty('tagName', 'INPUT');
  await page.keyboard.press('Alt');
  await expect(page.locator('.ribbon-keytips')).toHaveCount(0);
  await input.fill('한글');
  await page.keyboard.press('Enter');

  await enter(page, 'LINE');
  await page.keyboard.press('Control+F2');
  const dialog = page.getByRole('dialog', { name: /HanCAD 문자 윈도우/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Alt');
  await expect(page.locator('.ribbon-keytips')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Escape');
  await input.dispatchEvent('keydown', {
    code: 'AltRight',
    key: 'AltGraph',
    ctrlKey: true,
    altKey: true,
  });
  await expect(page.locator('.ribbon-keytips')).toHaveCount(0);
  await enter(page, 'MENUBAR');
  await enter(page, '1');
  await page.keyboard.press('Alt');
  await expect(page.locator('.ribbon-keytips')).toHaveCount(0);
});
