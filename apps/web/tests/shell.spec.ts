import { expect, test } from '@playwright/test';

test('Korean shell is local, readable, and uses the required canvas background', async ({
  page,
}) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) &&
      !['data:', 'blob:'].includes(url.protocol)
    )
      externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page).toHaveTitle('HanCAD');
  await expect(page.getByRole('tab', { name: '홈', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('navigation', { name: '도면 탭' })).toContainText('Drawing1.dwg');
  await expect(page.locator('.file-actions')).toHaveCount(0);
  await page.getByRole('button', { name: '파일', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'DWG / DXF 열기', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await expect(page.getByRole('tab', { name: '모형', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('textbox', { name: '명령 입력', exact: true })).toHaveAttribute(
    'contenteditable',
    'false',
  );
  const background = await page.getByTestId('drawing-canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected a drawing canvas.');
    return Array.from(canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data ?? []);
  });
  expect(background).toEqual([33, 40, 48, 255]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-artifacts/hancad-shell-ko.png' });
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('physical US keys, unknown commands, history, repeat, and cancel work', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '명령 입력', exact: true });
  await input.focus();
  await page.keyboard.type('NOTACAD');
  await page.keyboard.press('Enter');
  const history = page.getByRole('log', { name: '명령 기록' });
  await expect(history).toContainText('NOTACAD');
  await expect(history).toContainText('알 수 없는 명령');
  await page.keyboard.press('ArrowUp');
  await expect(input).toContainText('NOTACAD');
  await page.keyboard.press('Escape');
  await expect(history).toContainText('*취소*');
  await page.keyboard.press('Space');
  await expect(history.locator('.history-line.echo')).toHaveCount(2);
  await input.dispatchEvent('keydown', { key: 'ㅣ', code: 'KeyL', bubbles: true });
  await input.dispatchEvent('keydown', { key: 'ㅑ', code: 'KeyI', bubbles: true });
  await input.dispatchEvent('keydown', { key: 'ㅜ', code: 'KeyN', bubbles: true });
  await input.dispatchEvent('keydown', { key: 'ㄷ', code: 'KeyE', bubbles: true });
  await expect(input).toContainText('LINE');
  await page.keyboard.press('Enter');
  await expect(history).toContainText('LINE');
  await expect(page.locator('.command-prompt')).toHaveText('첫 번째 점 지정:');
  await page.keyboard.press('Escape');
});

test('ribbon tools report pending commands and bilingual tabs and status switches work', async ({
  page,
}) => {
  await page.goto('/');
  const history = page.getByRole('log', { name: '명령 기록' });
  await page.getByRole('button', { name: '모깎기', exact: true }).click();
  await expect(history).toContainText('FILLET');
  await expect(history).toContainText(/구현|미구현|알 수 없는/);
  const grid = page.getByRole('button', { name: '그리드', exact: true });
  await expect(grid).toBeDisabled();
  const ortho = page.getByRole('button', { name: '직교 모드', exact: true });
  const before = await ortho.getAttribute('aria-pressed');
  await ortho.click();
  await expect(ortho).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await page.keyboard.press('F8');
  await expect(ortho).toHaveAttribute('aria-pressed', before ?? 'false');
  await page.getByRole('tab', { name: '배치1', exact: true }).click();
  await expect(page.getByRole('tab', { name: '배치1', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.foundation-note')).toContainText('뷰포트는 아직 구현되지 않았습니다');
  await page.getByRole('combobox', { name: '언어' }).selectOption('en-US');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('tab', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Layout1', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Output', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Page Setup Manager', exact: true })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Type a command', exact: true });
  await input.focus();
  await page.keyboard.type('NEVERACOMMAND');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('log', { name: 'Command history' })).toContainText(
    /unknown command/i,
  );
  await page.screenshot({ path: 'test-artifacts/hancad-shell-en.png' });
});

test('F2 and Ctrl+9 control the command surface without making it editable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  await page.keyboard.press('F2');
  await expect(page.locator('.command-line')).toHaveClass(/expanded/);
  await page.keyboard.press('Control+9');
  await expect(page.getByRole('textbox', { name: '명령 입력', exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+9');
  await expect(page.getByRole('textbox', { name: '명령 입력', exact: true })).toHaveAttribute(
    'contenteditable',
    'false',
  );
});

test('SETVAR and GETVAR collect prompt input, cancel safely, and accept Korean free text', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '명령 입력', exact: true });
  const history = page.getByRole('log', { name: '명령 기록' });
  await input.focus();
  await page.keyboard.type('SETVAR');
  await page.keyboard.press('Enter');
  await expect(page.locator('.command-prompt')).toHaveText('변수 이름 입력:');
  await page.keyboard.type('LUPREC');
  await page.keyboard.press('Space');
  await expect(page.locator('.command-prompt')).toContainText('LUPREC에 대한 새 값 입력');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await page.keyboard.type('GETVAR');
  await page.keyboard.press('Enter');
  await page.keyboard.type('LUPREC');
  await page.keyboard.press('Enter');
  await expect(history).toContainText('LUPREC = 2');
  await page.keyboard.type('LUPREC');
  await page.keyboard.press('Enter');
  await page.keyboard.type('3');
  await page.keyboard.press('Escape');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await page.keyboard.type('GETVAR');
  await page.keyboard.press('Enter');
  await page.keyboard.type('LUPREC');
  await page.keyboard.press('Enter');
  await expect(history.locator('.history-line').last()).toHaveText('LUPREC = 2');
  await page.keyboard.type('SETVAR');
  await page.keyboard.press('Enter');
  await page.keyboard.type('MODEMACRO');
  await page.keyboard.press('Enter');
  await expect(input).toHaveJSProperty('tagName', 'INPUT');
  await input.fill('한글 상태 표시');
  await page.keyboard.press('Enter');
  await expect(input).toHaveAttribute('contenteditable', 'false');
  await page.keyboard.type('GETVAR');
  await page.keyboard.press('Enter');
  await page.keyboard.type('MODEMACRO');
  await page.keyboard.press('Enter');
  await expect(history).toContainText('MODEMACRO = 한글 상태 표시');
  await page.keyboard.type('LTS');
  await page.keyboard.press('Enter');
  await expect(page.locator('.command-prompt')).toContainText('LTSCALE에 대한 새 값 입력');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
});

test('focused ribbon controls keep their normal keyboard activation', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: '선', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('LINE');
  await page.getByRole('tab', { name: '출력', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '페이지 설정 관리자', exact: true })).toBeVisible();
});

test('English command diagnostics localize invalid, read-only, and unknown system variables', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: '언어' }).selectOption('en-US');
  const input = page.getByRole('textbox', { name: 'Type a command', exact: true });
  const output = page.getByRole('log', { name: 'Command history' }).locator('.history-line').last();
  const submit = async (value: string) => {
    await input.focus();
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  };
  await submit('SETVAR');
  await submit('OSMODE');
  await submit('99999');
  await expect(output).toHaveText('Invalid value for OSMODE (0–32767).');
  await page.keyboard.press('Escape');
  await submit('GETVAR');
  await submit('OSMODE');
  await expect(output).toHaveText('OSMODE = 4133');
  await submit('SETVAR');
  await submit('CMDACTIVE');
  await submit('1');
  await expect(output).toHaveText('CMDACTIVE is a read-only system variable.');
  await page.keyboard.press('Escape');
  await submit('GETVAR');
  await submit('NONEXISTENT');
  await expect(output).toHaveText('Unknown system variable "NONEXISTENT".');
  await page.keyboard.press('Escape');
  await expect(page.locator('.command-prompt')).toHaveText('Command:');
});
