import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drawing, enter } from './cad-actions';

const log = (page: Page) => page.getByRole('log', { name: '명령 기록' });
const prompt = (page: Page) => page.locator('.command-prompt');
const count = (page: Page) => page.getByTestId('drawing-entity-count');
const linePrompt = '다음 점 지정 또는 [명령 취소(U)]:';

async function macro(page: Page, text: string): Promise<void> {
  await enter(page, 'DEVMACRO');
  await expect(prompt(page)).toHaveText('매크로 입력:');
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).fill(text);
  await page.keyboard.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?devtools=1');
});

test('ribbon buttons run ^C^C macros and the extents button zooms transparently', async ({
  page,
}) => {
  await enter(page, 'L');
  await enter(page, '0,0');
  await page.getByRole('button', { name: '도면 전체 맞춤', exact: true }).click();
  await expect(log(page)).toContainText(`${linePrompt} '_zoom`);
  await expect(log(page)).toContainText('LINE 명령 재개 중.');
  await expect(prompt(page)).toHaveText(linePrompt);
  await page.getByRole('button', { name: '원', exact: true }).click();
  await expect(log(page)).toContainText('*취소*');
  await expect(log(page)).toContainText('명령: _CIRCLE');
  await expect(prompt(page)).toContainText('중심점 지정');
  await page.keyboard.press('Escape');
});

test('macros enter values, evaluate $M= DIESEL and pause for user input', async ({ page }) => {
  await macro(page, '^C^C_CIRCLE;0,0;$M=$(*,10,2.5)');
  await expect(count(page)).toHaveText('1');
  const circle = (await drawing(page)).entities[0];
  expect(circle).toMatchObject({ type: 'circle' });
  expect(circle?.type === 'circle' ? circle.radius : 0).toBeCloseTo(25, 6);

  await macro(page, '^C^C_LINE;\\100,0;;');
  await expect(prompt(page)).toHaveText('첫 번째 점 지정:');
  await enter(page, '0,0');
  await expect(count(page)).toHaveText('2');
});

test('*^C^C repeats after each completed command until Esc', async ({ page }) => {
  await macro(page, '*^C^C_CIRCLE;\\5;');
  await expect(prompt(page)).toContainText('중심점 지정');
  await enter(page, '0,0');
  await expect(count(page)).toHaveText('1');
  await expect(prompt(page)).toContainText('중심점 지정');
  await enter(page, '20,0');
  await expect(count(page)).toHaveText('2');
  await expect(prompt(page)).toContainText('중심점 지정');
  await page.keyboard.press('Escape');
  await expect(page.locator('.command-name')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page.locator('.command-name')).toHaveCount(0);
  await expect(count(page)).toHaveText('2');
});

test('^P hides the macro echo and MODEMACRO shows DIESEL in the status bar', async ({ page }) => {
  await macro(page, '^C^C^P_CIRCLE;0,0;5');
  await expect(count(page)).toHaveText('1');
  await expect(log(page)).not.toContainText('명령: _CIRCLE');
  await enter(page, 'ORTHOMODE');
  await enter(page, '0');
  await enter(page, 'MODEMACRO');
  await page
    .getByRole('textbox', { name: '명령 입력', exact: true })
    .fill('L:$(getvar,clayer) $(if,$(getvar,orthomode),ORTHO,-)');
  await page.keyboard.press('Enter');
  const status = page.getByTestId('modemacro');
  await expect(status).toHaveText('L:0 -');
  await page.keyboard.press('F8');
  await expect(status).toHaveText('L:0 ORTHO');
  await enter(page, 'MODEMACRO');
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).fill('$(+,1');
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('$?');
});
