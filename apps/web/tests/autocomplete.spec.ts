import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { enter } from './cad-actions';

async function type(page: Page, value: string): Promise<void> {
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  await page.keyboard.type(value);
}
const suggestions = (page: Page) => page.getByRole('listbox', { name: '제안 사항 리스트' });
const prompt = (page: Page) => page.locator('.command-prompt');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    for (const key of [
      'hancad.input-search-options.v1',
      'hancad.command-usage.v1',
      'hancad.autocorrect.v1',
    ])
      localStorage.removeItem(key);
  });
  await page.reload();
});

test('typing OSM lists OSMODE and Enter opens its value prompt', async ({ page }) => {
  await type(page, 'OSM');
  await expect(page.locator('.command-completion')).toHaveText('ODE');
  await expect(
    suggestions(page).getByRole('option', { name: 'OSMODE', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(prompt(page)).toHaveText(/^OSMODE에 대한 새 값 입력 <\d+>:$/);
  await enter(page, '0');
  await enter(page, 'GETVAR');
  await enter(page, 'OSMODE');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('OSMODE = 0');
});

test('inline completion, Backspace, arrows, clicks and Korean IME keys', async ({ page }) => {
  const input = page.getByRole('textbox', { name: '명령 입력', exact: true });
  await input.focus();
  // 한글 mode: the physical keys C, I, R produce ㅊ, ㅑ, ㄱ.
  for (const [key, code] of [
    ['ㅊ', 'KeyC'],
    ['ㅑ', 'KeyI'],
    ['ㄱ', 'KeyR'],
  ] as const)
    await input.dispatchEvent('keydown', { key, code, bubbles: true });
  await expect(input).toContainText('CIR');
  await expect(page.locator('.command-completion')).toHaveText('CLE');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.command-completion')).toHaveCount(0);
  await expect(input).toContainText('CIR');
  await page.keyboard.press('Escape');

  await type(page, 'LINE');
  const list = suggestions(page);
  await expect(list).toBeVisible();
  await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  const second = list.getByRole('option').nth(1);
  await expect(second).toHaveAttribute('aria-selected', 'true');
  const name = (await second.innerText()).trim();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(`명령: ${name}`);
  await page.keyboard.press('Escape');

  await type(page, 'CIRC');
  await list.getByRole('option', { name: 'CIRCLE', exact: true }).click();
  await expect(prompt(page)).toContainText('중심점 지정');
  await page.keyboard.press('Escape');
});

test('AutoCorrect suggests and then remembers a repeated misspelling', async ({ page }) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await type(page, 'CIRLCE');
    await expect(
      suggestions(page).getByRole('option', { name: 'CIRCLE', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(prompt(page)).toContainText('중심점 지정');
    await page.keyboard.press('Escape');
  }
  expect(await page.evaluate(() => localStorage.getItem('hancad.autocorrect.v1'))).toContain(
    'CIRLCE',
  );
  // Remembered corrections resolve at once, without waiting for the list.
  await enter(page, 'CIRLCE');
  await expect(prompt(page)).toContainText('중심점 지정');
  await page.keyboard.press('Escape');
  await page.reload();
  await enter(page, 'CIRLCE');
  await expect(prompt(page)).toContainText('중심점 지정');
});

test('INPUTSEARCHOPTIONS dialog and -INPUTSEARCHOPTIONS change the suggestions', async ({
  page,
}) => {
  await enter(page, 'INPUTSEARCHOPTIONS');
  const dialog = page.getByRole('dialog', { name: '검색 입력 옵션' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: '시스템 변수 검색' }).uncheck();
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await expect(dialog).toBeHidden();
  await type(page, 'OSM');
  await page.waitForTimeout(600);
  await expect(page.getByRole('option', { name: 'OSMODE' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await enter(page, '-INPUTSEARCHOPTIONS');
  await expect(prompt(page)).toContainText('옵션 입력 [자동 완성(A)/');
  await expect(page.locator('.command-name')).toHaveText('-INPUTSEARCHOPTIONS');
  await enter(page, 'A');
  await expect(prompt(page)).toHaveText(
    '사용자가 입력하는 명령을 자동으로 완성하시겠습니까? [예(Y)/아니오(N)] <예>:',
  );
  await enter(page, 'N');
  await enter(page, 'D');
  await enter(page, '50');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(
    'INPUTSEARCHDELAY의 값이 유효하지 않습니다 (100~10000).',
  );
  await enter(page, '1000');
  await enter(page, 'X');
  await expect(page.locator('.command-name')).toHaveCount(0);
  await type(page, 'CIR');
  await expect(page.locator('.command-completion')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await enter(page, 'GETVAR');
  await enter(page, 'INPUTSEARCHDELAY');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(
    'INPUTSEARCHDELAY = 1000',
  );
});

test('the customize menu toggles input settings and opens the dialog', async ({ page }) => {
  await page.getByRole('button', { name: '사용자화', exact: true }).click();
  await page.getByRole('menuitem', { name: '입력 설정' }).hover();
  const autoComplete = page.getByRole('menuitemcheckbox', { name: '자동 완성' });
  await expect(autoComplete).toHaveAttribute('aria-checked', 'true');
  await autoComplete.click();
  await type(page, 'CIR');
  await expect(page.locator('.command-completion')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '사용자화', exact: true }).click();
  await page.getByRole('menuitem', { name: '검색 입력 옵션...' }).click();
  await expect(page.getByRole('dialog', { name: '검색 입력 옵션' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '자동 완성 사용' })).not.toBeChecked();
});
