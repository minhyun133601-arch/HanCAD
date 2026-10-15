import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page, value: string): Promise<void> {
  const input = page.getByRole('textbox', { name: /^(명령 입력|Type a command)$/ });
  await input.focus();
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}
async function readVariable(page: Page, name: string): Promise<string> {
  await enter(page, 'GETVAR');
  await enter(page, name);
  const last = page.getByRole('log').locator('.history-line').last();
  await expect(last).toContainText(`${name} = `);
  return ((await last.textContent()) ?? '').replace(`${name} = `, '').trim();
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('wheel zoom and pan are undoable navigation steps reported by VIEWSIZE/VIEWCTR', async ({
  page,
}) => {
  for (const value of ['LINE', '0,0', '200,100', '']) await enter(page, value);
  const initial = await readVariable(page, 'VIEWSIZE');
  await page.getByRole('button', { name: '도면 전체 맞춤', exact: true }).click();
  const canvas = page.getByTestId('drawing-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is not visible.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  const zoomed = await readVariable(page, 'VIEWSIZE');
  expect(Number(zoomed)).not.toBe(Number(initial));
  const center = await readVariable(page, 'VIEWCTR');
  // UNDO Control Combine (default on) merges consecutive zoom/pan into one step.
  await enter(page, 'U');
  expect(await readVariable(page, 'VIEWSIZE')).toBe(initial);
  // GETVAR closed the single-REDO window, so MREDO restores the step.
  await enter(page, 'MREDO');
  await enter(page, '1');
  expect(await readVariable(page, 'VIEWSIZE')).toBe(zoomed);
  expect(await readVariable(page, 'VIEWCTR')).toBe(center);
  for (const value of ['UNDO', 'C', 'C', 'OFF']) await enter(page, value);
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
  await page.mouse.wheel(0, 100);
  const once = await readVariable(page, 'VIEWSIZE');
  await page.mouse.wheel(0, 100);
  await enter(page, 'U');
  expect(await readVariable(page, 'VIEWSIZE')).toBe(once);
  await enter(page, 'U');
  expect(await readVariable(page, 'VIEWSIZE')).toBe(zoomed);
  // The line itself is still one more U back.
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'U');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
});

test('layout tabs, clock and screen values are live and CLAYOUT uses name*handle', async ({
  page,
}) => {
  expect(await readVariable(page, 'CLAYOUT')).toMatch(/^Model\*[0-9A-F]+$/);
  await page.getByRole('tab', { name: '배치1' }).click();
  expect(await readVariable(page, 'CLAYOUT')).toMatch(/^Layout1\*[0-9A-F]+$/);
  await enter(page, 'CLAYOUT');
  await enter(page, 'Model');
  await expect(page.getByRole('tab', { name: '모형' })).toHaveAttribute('aria-selected', 'true');
  expect(await readVariable(page, 'CDATE')).toMatch(/^\d{8}\.\d+$/);
  expect(Number(await readVariable(page, 'DATE'))).toBeGreaterThan(2_460_000);
  expect(await readVariable(page, 'SCREENSIZE')).toMatch(/^\d+(\.\d+)?,\d+(\.\d+)?$/);
  expect(await readVariable(page, 'LOCALE')).toBe('KOR');
  expect((await readVariable(page, 'EXTMIN')).split(',').map(Number)).toEqual([1e20, 1e20, 1e20]);
});
