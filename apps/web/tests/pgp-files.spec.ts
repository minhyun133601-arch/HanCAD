import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { enter } from './cad-actions';

const prompt = (page: Page) => page.locator('.command-prompt');
const log = (page: Page) => page.getByRole('log', { name: '명령 기록' });
const editor = (page: Page) => page.getByRole('dialog', { name: '별칭 편집' });

/** A fake file on disk behind the File System Access API picker. */
async function mockDiskFile(page: Page, contents: string): Promise<void> {
  await page.addInitScript((initial) => {
    const host = globalThis as typeof globalThis & { diskPgp: string };
    host.diskPgp = initial;
    Object.defineProperty(globalThis, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [
        {
          name: 'acad.pgp',
          getFile: async () => new File([host.diskPgp], 'acad.pgp'),
          queryPermission: async () => 'granted',
          requestPermission: async () => 'granted',
        },
      ],
    });
  }, contents);
}
async function clearProfile(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('hancad.user-pgp.v1');
    localStorage.removeItem('hancad.autocorrect.v1');
  });
  await page.reload();
}

test('my acad.pgp imports and its changed aliases work right after REINIT', async ({ page }) => {
  await mockDiskFile(page, '; my aliases\r\nZZ,  *ZOOM\r\n');
  await page.goto('/');
  await clearProfile(page);
  await enter(page, 'ALIASEDIT');
  await editor(page).getByRole('button', { name: '파일 선택...' }).click();
  await expect(editor(page)).toContainText('acad.pgp (디스크 파일과 연결됨)');
  await expect(editor(page).getByRole('option', { name: /^ZZ\s*ZOOM/ })).toBeVisible();
  await editor(page).getByRole('button', { name: '확인', exact: true }).click();
  await enter(page, 'ZZ');
  await expect(prompt(page)).toContainText('윈도우 구석 지정');
  await page.keyboard.press('Escape');

  // Edit the file on disk, then REINIT with the PGP file option.
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { diskPgp: string }).diskPgp = 'ZZ, *LINE\r\nBAD LINE\r\n';
  });
  await enter(page, 'ZZ');
  await expect(prompt(page)).toContainText('윈도우 구석 지정');
  await page.keyboard.press('Escape');
  await enter(page, 'REINIT');
  const reinit = page.getByRole('dialog', { name: '재초기화' });
  await reinit.getByRole('checkbox', { name: 'PGP 파일' }).check();
  await reinit.getByRole('button', { name: '확인', exact: true }).click();
  await expect(log(page)).toContainText('acad.pgp: 다음 줄을 해석할 수 없습니다: 2');
  await enter(page, 'ZZ');
  await expect(prompt(page)).toHaveText('첫 번째 점 지정:');
  await page.keyboard.press('Escape');

  // RE-INIT 16 reloads too, and the copy survives a restart.
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { diskPgp: string }).diskPgp = 'ZZ, *CIRCLE\r\n';
  });
  await enter(page, 'RE-INIT');
  await enter(page, '16');
  await enter(page, 'ZZ');
  await expect(prompt(page)).toContainText('중심점 지정');
  await page.keyboard.press('Escape');
  await page.reload();
  await enter(page, 'ZZ');
  await expect(prompt(page)).toContainText('중심점 지정');
});

test('a Korean ANSI acad.pgp loads from the file input when no picker exists', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(globalThis, 'showOpenFilePicker', {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto('/');
  await clearProfile(page);
  await enter(page, 'ALIASEDIT');
  // "; 원" in CP949 followed by an alias line.
  const bytes = Buffer.concat([
    Buffer.from([0x3b, 0x20, 0xbf, 0xf8, 0x0d, 0x0a]),
    Buffer.from('WW, *LINE\r\n'),
  ]);
  await page.getByTestId('pgp-file-input').setInputFiles({
    name: 'acad.pgp',
    mimeType: 'text/plain',
    buffer: bytes,
  });
  await expect(editor(page)).toContainText('acad.pgp (저장된 복사본)');
  await editor(page).getByRole('button', { name: '확인', exact: true }).click();
  await enter(page, 'WW');
  await expect(prompt(page)).toHaveText('첫 번째 점 지정:');
  await page.keyboard.press('Escape');
  const stored = await page.evaluate(() => localStorage.getItem('hancad.user-pgp.v1'));
  expect(stored).toContain('; 원');
  expect(stored).toContain('"encoding":"cp949"');
});

test('ALIASEDIT edits aliases, external commands, AutoCorrect and synonyms', async ({ page }) => {
  await page.goto('/');
  await clearProfile(page);
  await enter(page, 'ALIASEDIT');
  const dialog = editor(page);
  await dialog.getByRole('textbox', { name: '별칭', exact: true }).fill('qq');
  await dialog.getByRole('textbox', { name: '명령', exact: true }).fill('circle');
  await dialog.getByRole('button', { name: '추가', exact: true }).click();
  await expect(dialog.getByRole('option', { name: /^QQ\s*CIRCLE\s*사용자/ })).toBeVisible();
  // Removing a built-in alias.
  await dialog.getByRole('option', { name: /^CO\s*COPY/ }).click();
  await dialog.getByRole('button', { name: '제거', exact: true }).click();
  await dialog.getByRole('tab', { name: '외부 명령' }).click();
  await dialog.getByRole('textbox', { name: '명령', exact: true }).fill('NOTEPAD');
  await dialog.getByRole('textbox', { name: 'PGP 줄' }).fill('NOTEPAD, 1,*편집할 파일: ');
  await dialog.getByRole('button', { name: '추가', exact: true }).click();
  await dialog.getByRole('tab', { name: '자동 수정 리스트' }).click();
  await dialog.getByRole('textbox', { name: '잘못된 입력' }).fill('LIEN');
  await dialog.getByRole('textbox', { name: '명령', exact: true }).fill('LINE');
  await dialog.getByRole('button', { name: '추가', exact: true }).click();
  await dialog.getByRole('tab', { name: '동의어 리스트' }).click();
  await dialog.getByRole('textbox', { name: '동의어' }).fill('SYMBOL');
  await dialog.getByRole('textbox', { name: '명령', exact: true }).fill('BLOCK');
  await dialog.getByRole('button', { name: '추가', exact: true }).click();
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await expect(dialog).toBeHidden();

  await enter(page, 'QQ');
  await expect(prompt(page)).toContainText('중심점 지정');
  await page.keyboard.press('Escape');
  // CO is no longer an alias, so AutoComplete completes it instead of running COPY.
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  await page.keyboard.type('CO');
  await expect(page.locator('.command-completion')).toHaveText('LOR');
  await page.keyboard.press('Escape');
  await enter(page, 'NOTEPAD');
  await expect(log(page)).toContainText('외부 명령 "NOTEPAD"은(는) 데스크톱 앱에서만');
  await enter(page, 'LIEN');
  await expect(prompt(page)).toHaveText('첫 번째 점 지정:');
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  await page.keyboard.type('SYMBOL');
  await expect(
    page
      .getByRole('listbox', { name: '제안 사항 리스트' })
      .getByRole('option', { name: 'BLOCK', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  const stored = await page.evaluate(() => localStorage.getItem('hancad.user-pgp.v1') ?? '');
  expect(stored).toContain('QQ,');
  expect(stored).toContain('NOTEPAD, NOTEPAD, 1,*편집할 파일: ,');
  expect(stored).toContain('"removed":["CO"]');
});
