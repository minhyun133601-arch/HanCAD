import { expect, test, type Page } from '@playwright/test';
import { enter } from './cad-actions';

function commandInput(page: Page) {
  return page.getByRole('textbox', { name: '명령 입력', exact: true });
}
/** Playwright's dispatchEvent cannot create CompositionEvent, so build the real event. */
async function compose(page: Page, data: string): Promise<void> {
  await commandInput(page).evaluate((node, text) => {
    node.dispatchEvent(new CompositionEvent('compositionend', { data: text, bubbles: true }));
  }, data);
}
async function koreanKey(page: Page, key: string, code: string): Promise<void> {
  // A Windows IME in 한글 mode reports the jamo (or "Process") but keeps the physical code.
  await commandInput(page).dispatchEvent('keydown', { key, code, bubbles: true });
}

test('한글 mode physical keys start ZOOM and reversed jamo resolve to aliases', async ({
  page,
}) => {
  await page.goto('/');
  const history = page.getByRole('log', { name: '명령 기록' });
  await koreanKey(page, 'ㅋ', 'KeyZ');
  await expect(commandInput(page)).toContainText('Z');
  await koreanKey(page, 'Enter', 'Enter');
  await expect(page.locator('.command-prompt')).toContainText('윈도우 구석 지정');
  await page.keyboard.press('Escape');
  for (const [jamo, prompt] of [
    ['ㅣ', '첫 번째 점 지정:'],
    ['ㅊ', '원에 대한 중심점 지정'],
  ] as const) {
    await compose(page, jamo);
    await page.keyboard.press('Enter');
    await expect(page.locator('.command-prompt')).toContainText(prompt);
    await page.keyboard.press('Escape');
  }
  await compose(page, '채');
  await expect(commandInput(page)).toContainText('CO');
  await page.keyboard.press('Enter');
  await expect(history).toContainText('명령: CO');
  await page.keyboard.press('Escape');
});

test('Space accepts command syntax but stays text inside free-text values', async ({ page }) => {
  await page.goto('/');
  await commandInput(page).focus();
  await page.keyboard.type('OSMODE');
  await page.keyboard.press('Space');
  await expect(page.locator('.command-prompt')).toContainText('OSMODE에 대한 새 값 입력');
  await page.keyboard.type('33');
  await page.keyboard.press('Space');
  await enter(page, 'GETVAR');
  await enter(page, 'OSMODE');
  const history = page.getByRole('log', { name: '명령 기록' });
  await expect(history).toContainText('OSMODE = 33');
  await enter(page, 'MODEMACRO');
  const text = page.getByRole('textbox', { name: '명령 입력', exact: true });
  await expect(text).toHaveJSProperty('tagName', 'INPUT');
  await text.pressSequentially('도면 A');
  await page.keyboard.press('Enter');
  await enter(page, 'GETVAR');
  await enter(page, 'MODEMACRO');
  await expect(history).toContainText('MODEMACRO = 도면 A');
});

test('Ctrl+[ cancels like Esc', async ({ page }) => {
  await page.goto('/');
  await enter(page, 'LINE');
  await expect(page.locator('.command-prompt')).toHaveText('첫 번째 점 지정:');
  await page.keyboard.press('Control+BracketLeft');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('*취소*');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
});
