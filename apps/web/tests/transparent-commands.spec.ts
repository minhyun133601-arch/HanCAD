import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { enter } from './cad-actions';

const log = (page: Page) => page.getByRole('log', { name: '명령 기록' });
const prompt = (page: Page) => page.locator('.command-prompt');
const name = (page: Page) => page.locator('.command-name');
const linePrompt = '다음 점 지정 또는 [명령 취소(U)]:';

async function startLine(page: Page): Promise<void> {
  await page.goto('/');
  await enter(page, 'L');
  await enter(page, '0,0');
  await expect(prompt(page)).toHaveText(linePrompt);
}

test("'Z runs transparently with >> prompts and resumes LINE at its prompt", async ({ page }) => {
  await startLine(page);
  await enter(page, "'Z");
  await expect(log(page)).toContainText(`${linePrompt} 'Z`);
  await expect(name(page)).toHaveText("'ZOOM");
  await expect(prompt(page)).toHaveText(/^>>윈도우 구석 지정, 축척 비율/);
  await enter(page, 'E');
  await expect(log(page)).toContainText('LINE 명령 재개 중.');
  await expect(name(page)).toHaveText('LINE');
  await expect(prompt(page)).toHaveText(linePrompt);
  await enter(page, '100,0');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  // The transparent command does not replace the command that Enter repeats.
  await enter(page, '');
  await expect(prompt(page)).toHaveText('첫 번째 점 지정:');
  await page.keyboard.press('Escape');
});

test("'OSMODE and 'SETVAR set variables with >> prompts inside LINE", async ({ page }) => {
  await startLine(page);
  await enter(page, "'OSMODE");
  await expect(prompt(page)).toHaveText(/^>>OSMODE에 대한 새 값 입력 <\d+>:$/);
  await enter(page, '0');
  await expect(log(page)).toContainText('LINE 명령 재개 중.');
  await expect(prompt(page)).toHaveText(linePrompt);
  await enter(page, "'SETVAR");
  await expect(prompt(page)).toHaveText(/^>>/);
  await enter(page, 'ORTHOMODE');
  await expect(prompt(page)).toHaveText(/^>>ORTHOMODE에 대한 새 값 입력 <0>:$/);
  await enter(page, '1');
  await expect(prompt(page)).toHaveText(linePrompt);
  await enter(page, '50,0');
  await enter(page, '');
  await enter(page, 'GETVAR');
  await enter(page, 'OSMODE');
  await expect(log(page)).toContainText('OSMODE = 0');
  await enter(page, 'GETVAR');
  await enter(page, 'ORTHOMODE');
  await expect(log(page)).toContainText('ORTHOMODE = 1');
});

test('non-transparent and nested transparent entries are refused without ending LINE', async ({
  page,
}) => {
  await startLine(page);
  await enter(page, "'CIRCLE");
  await expect(log(page)).toContainText('** 해당 명령은 투명하게 호출할 수 없습니다 **');
  await expect(prompt(page)).toHaveText(linePrompt);
  await enter(page, "'Z");
  await enter(page, "'P");
  await expect(log(page).locator('.history-line').last()).toHaveText(
    '** 해당 명령은 투명하게 호출할 수 없습니다 **',
  );
  await expect(prompt(page)).toHaveText(/^>>윈도우 구석 지정/);
  // Esc ends the transparent command together with LINE.
  await page.keyboard.press('Escape');
  await expect(name(page)).toHaveCount(0);
  await expect(log(page).locator('.history-line').filter({ hasText: '*취소*' })).toHaveCount(1);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
});

test("'DIST measures inside LINE and an unimplemented 'CAL reports and resumes", async ({
  page,
}) => {
  await startLine(page);
  await enter(page, "'DIST");
  await expect(prompt(page)).toHaveText(/^>>/);
  await enter(page, '0,0');
  await enter(page, '30,40');
  await expect(log(page)).toContainText('50');
  await expect(log(page)).toContainText('LINE 명령 재개 중.');
  await expect(prompt(page)).toHaveText(linePrompt);
  await enter(page, "'CAL");
  await expect(log(page).locator('.history-line').nth(-2)).toContainText('CAL');
  await expect(log(page).locator('.history-line').last()).toHaveText('LINE 명령 재개 중.');
  await enter(page, '10,10');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});
