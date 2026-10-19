import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { enter } from './cad-actions';

const toolbar = (page: Page) => page.getByRole('toolbar', { name: '상태막대', exact: true });
const button = (page: Page, name: string) =>
  toolbar(page).getByRole('button', { name, exact: true });
const customize = (page: Page) =>
  page.getByRole('button', { name: '상태막대 사용자화', exact: true });
const prompt = (page: Page) => page.locator('.command-prompt');

async function showItem(page: Page, name: string): Promise<void> {
  await customize(page).click();
  await page.getByRole('menuitemcheckbox', { name, exact: true }).click();
}

test('status customization exposes all shortcut toggles with original icons and persists visibility', async ({
  page,
}) => {
  await page.goto('/');
  for (const name of [
    '3D 객체 스냅',
    '동적 UCS',
    '등각평면',
    '선택 순환',
    '그룹',
    '구속조건 추론',
    '빠른 특성',
    '태블릿',
  ]) {
    await showItem(page, name);
    const item = button(page, name);
    await expect(item.locator('svg')).toBeVisible();
    if (name !== '등각평면') {
      const before = await item.getAttribute('aria-pressed');
      await item.click();
      await expect(item).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    }
  }
  await showItem(page, '그리드');
  await expect(button(page, '그리드')).toHaveCount(0);
  await page.reload();
  await expect(button(page, '그리드')).toHaveCount(0);
  await expect(button(page, '동적 UCS')).toBeVisible();
  await showItem(page, '그리드');
  await expect(button(page, '그리드')).toBeVisible();
});

test('status settings run transparently and keep the active LINE prompt and osnap bits', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page, 'OSMODE');
  await enter(page, '1');
  await enter(page, 'L');
  await enter(page, '0,0');
  const originalPrompt = await prompt(page).innerText();
  await button(page, '객체 스냅').click({ button: 'right' });
  await page.getByRole('menuitemcheckbox', { name: '중간점', exact: true }).click();
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('LINE 명령 재개 중.');
  await expect(prompt(page)).toHaveText(originalPrompt);
  await button(page, '극좌표 추적').click({ button: 'right' });
  await page.getByRole('menuitemcheckbox', { name: '45°', exact: true }).click();
  await expect(prompt(page)).toHaveText(originalPrompt);
  await enter(page, '20,0');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'GETVAR');
  await enter(page, 'OSMODE');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('OSMODE = 3');
  await enter(page, 'GETVAR');
  await enter(page, 'POLARANG');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('POLARANG = 45');
});

test('coordinates retain accepted typed points, update dynamically and cycle into relative polar mode', async ({
  page,
}) => {
  await page.goto('/');
  const coords = page.getByTestId('status-coordinates');
  await expect(coords).toHaveCount(0);
  await showItem(page, '좌표');
  await enter(page, 'COORDS');
  await enter(page, '0');
  await enter(page, 'L');
  await enter(page, '10,20');
  await expect(coords).toHaveText('10.0000, 20.0000, 0.0000');
  const canvas = await page.getByTestId('drawing-canvas').boundingBox();
  if (!canvas) throw new Error('Canvas is missing');
  await page.mouse.move(canvas.x + canvas.width / 2 + 50, canvas.y + canvas.height / 2 - 60);
  await expect(coords).toHaveText('10.0000, 20.0000, 0.0000');
  await coords.click();
  await expect(coords).toHaveAttribute('data-coords-mode', '1');
  await expect(coords).not.toHaveText('10.0000, 20.0000, 0.0000');
  await coords.click();
  await expect(coords).toHaveAttribute('data-coords-mode', '2');
  await expect(coords).toContainText('<');
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  await page.keyboard.press('Control+I');
  await expect(coords).toHaveAttribute('data-coords-mode', '0');
  await coords.click({ button: 'right' });
  await expect(
    page.getByRole('menuitemcheckbox', { name: '지리적(G)', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(prompt(page)).toHaveText('다음 점 지정 또는 [명령 취소(U)]:');
  await enter(page, '30,20');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});

test('F1 shows Korean registry help for the interrupted command and Escape resumes it', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page, 'L');
  await enter(page, '0,0');
  await page.keyboard.press('F1');
  const help = page.getByRole('complementary', { name: '명령 도움말', exact: true });
  await expect(help.getByRole('heading')).toContainText('LINE');
  await expect(help).toContainText('별칭:');
  await expect(help).toContainText('직선 세그먼트를 작성합니다.');
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await expect(prompt(page)).toHaveText('다음 점 지정 또는 [명령 취소(U)]:');
  await enter(page, '100,0');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'HELP');
  await expect(help.getByRole('heading')).toContainText('HELP');
  await help.getByRole('searchbox', { name: '명령 도움말 검색', exact: true }).fill('FILLET');
  await help.getByRole('button', { name: /^FILLET ·/ }).click();
  await expect(help.getByRole('heading')).toContainText('FILLET');
  await expect(help).toContainText('두 객체의 모서리를 둥글게 하거나 모깎기합니다.');
  await expect(help).not.toContainText('이 명령은 아직 구현되지 않았습니다.');
  await help.getByRole('searchbox', { name: '명령 도움말 검색', exact: true }).fill('HATCH');
  await help.getByRole('button', { name: /^HATCH ·/ }).click();
  await expect(help.getByRole('heading')).toContainText('HATCH');
  await expect(help).toContainText('이 명령은 아직 구현되지 않았습니다.');
  await help.getByRole('button', { name: '도움말 닫기', exact: true }).click();
  await page.getByRole('combobox', { name: '언어', exact: true }).selectOption('en-US');
  await page.keyboard.press('F1');
  await expect(
    page.getByRole('complementary', { name: 'Command help', exact: true }),
  ).toBeVisible();
});
