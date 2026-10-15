import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { drawing } from './cad-actions';
import { saveFromFileMenu } from './file-menu';

async function enter(page: Page, value: string): Promise<void> {
  const input = page.getByRole('textbox', { name: /^(명령 입력|Type a command)$/ });
  await input.focus();
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}
async function variable(page: Page, name: string, value: string): Promise<void> {
  await enter(page, 'SETVAR');
  await enter(page, name);
  await enter(page, value);
  await expect(page.locator('.command-prompt')).toHaveText(/^(명령:|Command:)$/);
}
async function expectVariable(page: Page, name: string, value: string): Promise<void> {
  await enter(page, 'GETVAR');
  await enter(page, name);
  await expect(page.getByRole('log').locator('.history-line').last()).toHaveText(
    `${name} = ${value}`,
  );
}
async function line(page: Page, first: string, second: string): Promise<void> {
  for (const value of ['LINE', first, second, '']) await enter(page, value);
}
async function multipleRedo(page: Page): Promise<void> {
  await enter(page, 'MREDO');
  await enter(page, '1');
}
async function expectDistance(page: Page, value: string): Promise<void> {
  for (const input of ['DIST', '0,0', '12.34596,0']) await enter(page, input);
  await expect(page.getByRole('log').locator('.history-line').last()).toContainText(
    `거리 = ${value},`,
  );
}
async function undoOption(page: Page, ...values: string[]): Promise<void> {
  await enter(page, 'UNDO');
  await expect(page.locator('.command-prompt')).toContainText('<1>');
  for (const value of values) await enter(page, value);
  await expect(page.locator('.command-prompt')).toHaveText(/^(명령:|Command:)$/);
}
async function activate(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: /^(도면 탭|Drawing tabs)$/ })
    .getByRole('button', { name, exact: true })
    .click();
  await expect(page.locator('.file-tab[aria-current="page"]')).toHaveText(name);
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

test('NEW creates independent drawing variables, geometry and journals while profile settings stay shared', async ({
  page,
}) => {
  await expectVariable(page, 'LUPREC', '4');
  await expectVariable(page, 'OSMODE', '4133');
  await variable(page, 'LUPREC', '2');
  await expectDistance(page, '12.35');
  await variable(page, 'OSMODE', '1');
  await line(page, '10,0', '30,0');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'NEW');
  await expect(page.locator('.file-tab')).toHaveCount(2);
  await expect(page.locator('.file-tab[aria-current="page"]')).toHaveText('Drawing2.dwg');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await expectVariable(page, 'LUPREC', '4');
  await expectDistance(page, '12.3460');
  await expectVariable(page, 'OSMODE', '1');
  await variable(page, 'LUPREC', '6');
  await line(page, '0,20', '40,20');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');

  await activate(page, 'Drawing1.dwg');
  await expectVariable(page, 'LUPREC', '2');
  await expectVariable(page, 'OSMODE', '1');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await expectVariable(page, 'LUPREC', '2');
  await activate(page, 'Drawing2.dwg');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expectVariable(page, 'LUPREC', '6');
  await variable(page, 'OSMODE', '5');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await activate(page, 'Drawing1.dwg');
  await expectVariable(page, 'OSMODE', '5');
  await multipleRedo(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expectVariable(page, 'LUPREC', '2');
  await activate(page, 'Drawing2.dwg');
  await multipleRedo(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expectVariable(page, 'LUPREC', '6');
  await page.screenshot({ path: 'test-artifacts/database-foundations/multiple-documents.png' });
});

test('interactive UNDO groups, marks, numeric undo, control and Auto update UNDOCTL', async ({
  page,
}) => {
  await expectVariable(page, 'UNDOCTL', '53');
  await undoOption(page, 'BE');
  await expectVariable(page, 'UNDOCTL', '61');
  await line(page, '0,0', '10,0');
  await line(page, '0,10', '10,10');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await undoOption(page, 'E');
  await expectVariable(page, 'UNDOCTL', '53');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await undoOption(page, 'M');
  await line(page, '0,20', '10,20');
  await line(page, '0,30', '10,30');
  await undoOption(page, 'B');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await enter(page, 'MREDO');
  await expect(page.locator('.command-prompt')).toContainText('<1>');
  await enter(page, '2');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await undoOption(page, '2');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');

  await undoOption(page, 'C', 'None');
  await expectVariable(page, 'UNDOCTL', '0');
  await line(page, '0,40', '10,40');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  await undoOption(page, 'C', 'All');
  await expectVariable(page, 'UNDOCTL', '53');
  await enter(page, 'UNDO');
  await enter(page, 'A');
  await expect(page.locator('.command-prompt')).toContainText('[켜기(ON)/끄기(OFF)]');
  await page.getByRole('combobox', { name: '언어' }).selectOption('en-US');
  await expect(page.locator('.command-prompt')).toHaveText('Enter [ON/OFF] <ON>:');
  await enter(page, 'OFF');
  await expectVariable(page, 'UNDOCTL', '49');
  await undoOption(page, 'A', 'ON');
  await expectVariable(page, 'UNDOCTL', '53');
  await undoOption(page, 'C', 'One');
  await expectVariable(page, 'UNDOCTL', '51');
  await line(page, '0,50', '10,50');
  await line(page, '0,60', '10,60');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await multipleRedo(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5');
  await undoOption(page, 'C', 'All');
  await undoOption(page, 'C', 'Combine', 'OFF');
  await expectVariable(page, 'UNDOCTL', '37');
  await undoOption(page, 'C', 'Layer', 'OFF');
  await expectVariable(page, 'UNDOCTL', '5');
  await undoOption(page, 'C', 'Combine', 'ON');
  await undoOption(page, 'C', 'Layer', 'ON');
  await expectVariable(page, 'UNDOCTL', '53');
});

test('OOPS restores the last erasure after later drawing and remains a separate undo group', async ({
  page,
}) => {
  await line(page, '0,0', '10,0');
  await line(page, '0,20', '10,20');
  const original = (await drawing(page)).entities;
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await enter(page, 'ERASE');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await line(page, '0,40', '10,40');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const later = (await drawing(page)).entities;
  await enter(page, 'OOPS');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  const restored = (await drawing(page)).entities;
  expect(restored).toEqual([...original, ...later]);
  for (const entity of original) expect(restored).toContainEqual(entity);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
});

test('HANSAVE downloads a real HCD and opening it in a new tab restores drawing and settings after reload', async ({
  page,
}, testInfo) => {
  await variable(page, 'LUPREC', '2');
  await variable(page, 'TEXTSIZE', '6');
  await line(page, '10,10', '60,10');
  const original = (await drawing(page)).entities;
  const download = await saveFromFileMenu(page, 'HCD 저장');
  expect(download.suggestedFilename()).toBe('Drawing1.hcd');
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const bytes = await fs.readFile(file);
  expect([...bytes.subarray(0, 2)]).toEqual([80, 75]);
  expect(bytes.length).toBeGreaterThan(1000);
  await enter(page, 'NEW');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await expectVariable(page, 'LUPREC', '4');
  await page.getByTestId('cad-file-input').setInputFiles(file);
  await expect(page.locator('.file-tab')).toHaveCount(3);
  await expect(page.locator('.file-tab[aria-current="page"]')).toHaveText('Drawing1.hcd');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities).toEqual(original);
  await expectVariable(page, 'LUPREC', '2');
  await expectVariable(page, 'TEXTSIZE', '6');
  await variable(page, 'TEXTSIZE', '9');
  await activate(page, 'Drawing2.dwg');
  await expectVariable(page, 'TEXTSIZE', '2.5');
  await activate(page, 'Drawing1.hcd');
  await expectVariable(page, 'TEXTSIZE', '9');
  await enter(page, 'U');
  await expectVariable(page, 'TEXTSIZE', '6');
  await page.reload();
  await expect(page.locator('.file-tab[aria-current="page"]')).toHaveText('Drawing1.hcd');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities).toEqual(original);
  await expectVariable(page, 'LUPREC', '2');
  await expectVariable(page, 'TEXTSIZE', '6');
});

test('unavailable writable variables report localized errors and leave commands, drawing and undo usable', async ({
  page,
}) => {
  await line(page, '0,0', '100,20');
  const original = (await drawing(page)).entities;
  const serialized = await page.evaluate(() => localStorage.getItem('hancad.active-drawing.v1'));
  for (const locale of ['ko-KR', 'en-US'] as const) {
    await page.getByRole('combobox', { name: /^(언어|Language)$/ }).selectOption(locale);
    const latest = page.getByRole('log').locator('.history-line').last();
    const expected =
      locale === 'ko-KR'
        ? 'ACTRECPATH의 초기값은 현재 환경에서 아직 확인할 수 없습니다.'
        : 'The initial value of ACTRECPATH is not available in this environment.';
    await enter(page, 'ACTRECPATH');
    await expect(latest).toContainText(expected);
    await expect(page.locator('.command-prompt')).toHaveText(
      locale === 'ko-KR' ? '명령:' : 'Command:',
    );
    await enter(page, 'SETVAR');
    await enter(page, 'ACTRECPATH');
    await expect(latest).toContainText(expected);
    await expect(page.locator('.command-prompt')).toHaveText(
      locale === 'ko-KR' ? '명령:' : 'Command:',
    );
    await enter(page, 'NOTACAD');
    await expect(latest).toContainText(locale === 'ko-KR' ? '알 수 없는 명령' : /unknown command/i);
    await expectVariable(page, 'LUPREC', '4');
    await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
    expect((await drawing(page)).entities).toEqual(original);
    expect(await page.evaluate(() => localStorage.getItem('hancad.active-drawing.v1'))).toBe(
      serialized,
    );
  }
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await multipleRedo(page);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});
