import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

const menu = (page: Page) => page.getByRole('menu', { name: '도면 바로 가기 메뉴', exact: true });
async function setVariable(page: Page, name: string, value: string): Promise<void> {
  await enter(page, name);
  await enter(page, value);
}
async function rightClick(page: Page, delay = 0): Promise<void> {
  await page
    .getByTestId('drawing-canvas')
    .click({ button: 'right', position: { x: 300, y: 180 }, delay });
}

test('configured right-click is Enter, repeats at idle and completes LINE', async ({ page }) => {
  await page.goto('/');
  await setVariable(page, 'SHORTCUTMENU', '0');
  await enter(page, 'L');
  await enter(page, '0,0');
  await enter(page, '10,0');
  await rightClick(page);
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await expect(menu(page)).toHaveCount(0);
  await rightClick(page);
  await expect(page.locator('.command-prompt')).toHaveText('첫 번째 점 지정:');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});

test('default, edit and command menus invoke commands and prompt keywords', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await rightClick(page);
  await expect(menu(page).getByRole('menuitem', { name: '옵션(N)...', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: '명령 입력', exact: true })).toBeFocused();
  await enter(page, 'L');
  // Default 11 uses bit 8: no options at LINE's first prompt means Enter.
  await rightClick(page);
  await expect(menu(page)).toHaveCount(0);
  await enter(page, '0,0');
  await enter(page, '100,0');
  await rightClick(page);
  await expect(
    menu(page).getByRole('menuitem', { name: '명령 취소(U)', exact: true }),
  ).toBeVisible();
  await menu(page).getByRole('menuitem', { name: '명령 취소(U)', exact: true }).click();
  await expect(page.locator('.command-prompt')).toContainText('다음 점 지정');
  await enter(page, '100,0');
  await enter(page, '');
  expect((await drawing(page)).entities).toMatchObject([
    { type: 'line', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
  ]);
  await enter(page, 'L');
  await enter(page, '0,0');
  await enter(page, '0,100');
  await enter(page, '');
  await setVariable(page, 'VTENABLE', '0');
  const view = await mapping(page);
  await point(page, view, 50, 0);
  await expect(page.locator('.draft-selection-count')).toContainText('1');
  await rightClick(page);
  await expect(menu(page).getByRole('menuitem', { name: '이동(M)', exact: true })).toBeVisible();
  await menu(page).getByRole('menuitem', { name: '지우기(E)', exact: true }).click();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});

test('time-sensitive clicks use duration, and middle-button snap menu honors MBUTTONPAN', async ({
  page,
}) => {
  await page.goto('/');
  await setVariable(page, 'SHORTCUTMENU', '16');
  await setVariable(page, 'SHORTCUTMENUDURATION', '150');
  await enter(page, 'L');
  await enter(page, '0,0');
  await enter(page, '10,0');
  await rightClick(page, 10);
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await rightClick(page, 220);
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await setVariable(page, 'MBUTTONPAN', '0');
  await page
    .getByTestId('drawing-canvas')
    .click({ button: 'middle', position: { x: 300, y: 180 } });
  await expect(page.getByRole('menu', { name: '객체 스냅 메뉴', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await setVariable(page, 'MBUTTONPAN', '1');
  await page
    .getByTestId('drawing-canvas')
    .click({ button: 'middle', position: { x: 300, y: 180 } });
  await expect(page.getByRole('menu', { name: '객체 스냅 메뉴', exact: true })).toHaveCount(0);
});

test('bit 4 opens command menus without keywords; Shift right-click ignores SHORTCUTMENU', async ({
  page,
}) => {
  await page.goto('/');
  await setVariable(page, 'SHORTCUTMENU', '4');
  await enter(page, 'L');
  await rightClick(page);
  await expect(menu(page).getByRole('menuitem', { name: '입력(E)', exact: true })).toBeVisible();
  await menu(page).getByRole('menuitem', { name: '취소(C)', exact: true }).click();
  await setVariable(page, 'SHORTCUTMENU', '0');
  await page
    .getByTestId('drawing-canvas')
    .click({ button: 'right', modifiers: ['Shift'], position: { x: 300, y: 180 } });
  await expect(page.getByRole('menu', { name: '객체 스냅 메뉴', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '끝점', exact: true }).click();
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(
    '알 수 없는 명령 "ENDP"',
  );
});
