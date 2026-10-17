import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

const lastLine = (page: Page) =>
  page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last();
const status = (page: Page, name: string) =>
  page.getByRole('toolbar', { name: '상태막대' }).getByRole('button', { name, exact: true });

async function variable(page: Page, name: string): Promise<string> {
  await enter(page, 'GETVAR');
  await enter(page, name);
  await expect(lastLine(page)).toContainText(`${name} = `);
  return (await lastLine(page).innerText()).split(' = ')[1] ?? '';
}
async function press(page: Page, key: string, message: string): Promise<void> {
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  await page.keyboard.press(key);
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(message);
}

test('F3, F7-F12 and Ctrl+B/E/F/G/L/U/W flip the right variables and buttons', async ({ page }) => {
  await page.goto('/');
  const grid = status(page, '그리드');
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await press(page, 'F7', '<그리드 끄기>');
  await expect(grid).toHaveAttribute('aria-pressed', 'false');
  await press(page, 'Control+G', '<그리드 켜기>');
  await expect(grid).toHaveAttribute('aria-pressed', 'true');

  await press(page, 'F8', '<직교 켜기>');
  await expect(status(page, '직교 모드')).toHaveAttribute('aria-pressed', 'true');
  // Ortho on turned polar tracking off, as in AutoCAD.
  await expect(status(page, '극좌표 추적')).toHaveAttribute('aria-pressed', 'false');
  await press(page, 'Control+L', '<직교 끄기>');
  await press(page, 'F10', '<극좌표 켜기>');
  await press(page, 'Control+U', '<극좌표 끄기>');
  await expect(status(page, '극좌표 추적')).toHaveAttribute('aria-pressed', 'false');

  await press(page, 'F9', '<스냅 켜기>');
  await expect(page.getByRole('log', { name: '명령 기록' })).not.toContainText(
    '스냅 기능은 아직 구현되지 않았습니다',
  );
  await expect(status(page, '스냅')).toHaveAttribute('aria-pressed', 'true');
  await press(page, 'Control+B', '<스냅 끄기>');
  await press(page, 'F3', '<객체 스냅 끄기>');
  await expect(status(page, '객체 스냅')).toHaveAttribute('aria-pressed', 'false');
  await press(page, 'Control+F', '<객체 스냅 켜기>');
  await press(page, 'F11', '<객체 스냅 추적 끄기>');
  await press(page, 'F12', '<동적 입력 끄기>');
  await expect(status(page, '동적 입력')).toHaveAttribute('aria-pressed', 'false');
  await press(page, 'Control+E', '<등각평면 위쪽>');
  await press(page, 'Control+W', '<선택 순환 켜기>');

  expect(await variable(page, 'GRIDMODE')).toBe('1');
  expect(await variable(page, 'ORTHOMODE')).toBe('0');
  expect(await variable(page, 'SNAPMODE')).toBe('0');
  expect(await variable(page, 'OSMODE')).toBe('4133');
  expect(await variable(page, 'AUTOSNAP')).toBe(String(63 & ~8 & ~16));
  expect(await variable(page, 'DYNMODE')).toBe('-3');
  expect(await variable(page, 'SNAPISOPAIR')).toBe('1');
  expect(await variable(page, 'SELECTIONCYCLING')).toBe('2');
});

test('Ctrl shortcuts run macros, repeat commands and report commands not built yet', async ({
  page,
}) => {
  await page.goto('/');
  await press(page, 'Control+1', '명령 "PROPERTIES"은(는) 아직 구현되지 않았습니다.');
  await press(page, 'Control+8', '명령 "QUICKCALC"은(는) 아직 구현되지 않았습니다.');
  await enter(page, 'L');
  await enter(page, '0,0');
  await enter(page, '10,0');
  await enter(page, '');
  await page.keyboard.press('Control+J');
  await expect(page.locator('.command-prompt')).toHaveText('첫 번째 점 지정:');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Z');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await page.keyboard.press('Control+Y');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});

test('holding Shift overrides Ortho and Shift+D disables snaps at point prompts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await enter(page, 'ORTHOMODE');
  await enter(page, '0');
  for (const [from, to] of [
    ['0,0', '100,0'],
    ['0,0', '0,100'],
  ]) {
    await enter(page, 'L');
    await enter(page, from!);
    await enter(page, to!);
    await enter(page, '');
  }
  const view = await mapping(page);
  await enter(page, 'L');
  await enter(page, '0,40');
  // Shift held: Ortho is on until release, so a diagonal pick becomes horizontal.
  await point(page, view, 60, 70, false);
  await page.keyboard.down('Shift');
  await point(page, view, 60, 70);
  await page.keyboard.up('Shift');
  // Shift+D held: snaps are off, so a pick beside an endpoint stays where it is.
  await point(page, view, 100.6, 0.6, false);
  await page.keyboard.down('Shift');
  await page.keyboard.down('KeyD');
  await point(page, view, 100.6, 0.6);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('Shift');
  // Without an override a pick beside the other endpoint snaps to it.
  await point(page, view, 0.6, 99.4, false);
  await point(page, view, 0.6, 99.4);
  await enter(page, '');
  const lines = (await drawing(page)).entities.filter((entity) => entity.type === 'line');
  expect(lines).toHaveLength(5);
  const [, , first, second, third] = lines;
  if (first?.type !== 'line' || second?.type !== 'line' || third?.type !== 'line')
    throw new Error('Expected three new lines');
  expect(first.a).toEqual({ x: 0, y: -40 });
  expect(first.b.y).toBeCloseTo(-40, 6);
  expect(first.b.x).toBeGreaterThan(50);
  expect(Math.abs(second.b.x - 100)).toBeGreaterThan(0.05);
  expect(third.b).toEqual({ x: 0, y: -100 });
});
