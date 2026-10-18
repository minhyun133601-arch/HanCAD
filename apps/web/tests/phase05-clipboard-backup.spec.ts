import { expect, test, type Page } from '@playwright/test';
import { drawing, enter } from './cad-actions';

interface BrowserHarness {
  clipboard: string | null;
  browserCalls: number;
}
type HarnessWindow = Window & { hancadBrowserClipboard: BrowserHarness };

// OS access is mocked; IndexedDB and localStorage are the real isolated browser stores.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const harness: BrowserHarness = { clipboard: null, browserCalls: 0 };
    (window as unknown as HarnessWindow).hancadBrowserClipboard = harness;
    const denied = () => {
      harness.browserCalls++;
      return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: { read: denied, write: denied },
      configurable: true,
    });
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
});

async function line(page: Page): Promise<void> {
  for (const value of ['LINE', '10,10', '30,10', '']) await enter(page, value);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
}
async function selectAll(page: Page): Promise<void> {
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
}

test('legacy localStorage never shadows IndexedDB or certifies a failed new CUTCLIP backup', async ({
  page,
}) => {
  await line(page);
  const original = (await drawing(page)).entities;
  await selectAll(page);
  await enter(page, 'COPYBASE');
  await enter(page, '0,0');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await page.evaluate(async () => {
    const key = 'hancad.drawing-clipboard.v1';
    const saved = await new Promise<string>((resolve, reject) => {
      const request = indexedDB.open(key, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result,
          transaction = database.transaction('clipboard', 'readonly'),
          read = transaction.objectStore('clipboard').get('drawing');
        transaction.oncomplete = () => {
          database.close();
          if (typeof read.result === 'string') resolve(read.result);
          else reject(new Error('IndexedDB clipboard backup is missing.'));
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    const stale = JSON.parse(saved) as { basePoint: { x: number; y: number } };
    stale.basePoint = { x: 100, y: -100 };
    localStorage.setItem(key, JSON.stringify(stale));
  });
  await enter(page, 'PASTECLIP');
  await expect(page.locator('.command-prompt')).toHaveText('삽입점 지정:');
  await enter(page, '0,0');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect((await drawing(page)).entities[1]).toMatchObject({
    a: { x: 10, y: -10 },
    b: { x: 30, y: -10 },
  });
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    Object.defineProperty(indexedDB, 'open', {
      value: (name: string, version?: number) => {
        if (name === 'hancad.drawing-clipboard.v1')
          throw new DOMException('Transient IndexedDB failure', 'SecurityError');
        return open(name, version);
      },
    });
  });
  const sharedSuccess = page
    .getByRole('log')
    .locator('.history-line')
    .filter({ hasText: 'HanCAD 창 사이의 내부 클립보드를 사용합니다.' });
  const successesBeforeCut = await sharedSuccess.count();
  await selectAll(page);
  await page.keyboard.press('Control+x');
  await expect(page.getByRole('log')).toContainText('클립보드 작업에 실패했습니다:');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  expect((await drawing(page)).entities).toEqual(original);
  await expect(sharedSuccess).toHaveCount(successesBeforeCut);
  // REDO requires the immediately preceding command to be U/UNDO; MREDO can
  // restore preserved journal entries after a failed intervening command.
  await enter(page, 'MREDO');
  await enter(page, '1');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await enter(page, 'U');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
});

test('a successful browser OS clipboard write permits CUTCLIP while IndexedDB is unavailable', async ({
  page,
}) => {
  await line(page);
  const original = (await drawing(page)).entities;
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    Object.defineProperty(indexedDB, 'open', {
      value: (name: string, version?: number) => {
        if (name === 'hancad.drawing-clipboard.v1')
          throw new DOMException('Denied', 'SecurityError');
        return open(name, version);
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: async (items: ClipboardItem[]) => {
          const harness = (window as unknown as HarnessWindow).hancadBrowserClipboard;
          harness.browserCalls++;
          harness.clipboard = await (await items[0]!.getType('text/plain')).text();
        },
      },
    });
  });
  await selectAll(page);
  await page.keyboard.press('Control+x');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  expect(
    await page.evaluate(() => {
      const payload = (window as unknown as HarnessWindow).hancadBrowserClipboard.clipboard;
      return JSON.parse(payload ?? '{}') as unknown;
    }),
  ).toMatchObject({ format: 'HanCAD.Drawing', state: { entities: original } });
  await expect(page.getByRole('log')).not.toContainText('클립보드 작업에 실패했습니다:');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities).toEqual(original);
});
