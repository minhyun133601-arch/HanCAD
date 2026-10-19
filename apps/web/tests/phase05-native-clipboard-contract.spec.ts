import { expect, test, type Page } from '@playwright/test';
import { drawing, enter } from './cad-actions';

interface NativePacket {
  payload: string;
  png: number[];
  dib: number[];
}
interface NativeHarness {
  mode: 'success' | 'reject' | 'pending';
  calls: string[];
  packet?: NativePacket;
  clipboard: string | null;
  browserCalls: number;
  resolveWrite?: () => void;
}
type HarnessWindow = Window & { hancadNativeClipboard: NativeHarness };

// These browser tests exercise the production command/IPC boundary with a mock
// Tauri transport. They do not execute or certify the Win32 Clipboard bridge.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const harness: NativeHarness = {
      mode: 'success',
      calls: [],
      clipboard: null,
      browserCalls: 0,
    };
    (window as unknown as HarnessWindow).hancadNativeClipboard = harness;
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        invoke: (command: string, args?: { packet: NativePacket }) => {
          harness.calls.push(command);
          if (command === 'platform_info')
            return Promise.resolve({ mode: 'desktop', capabilities: ['clipboard'] });
          if (command === 'read_drawing_clipboard') return Promise.resolve(harness.clipboard);
          if (command !== 'write_drawing_clipboard' || !args)
            return Promise.reject(new Error(`Unexpected native command: ${command}`));
          harness.packet = args.packet;
          if (harness.mode === 'reject')
            return Promise.reject('Windows 클립보드를 열 수 없습니다. 다시 시도하십시오.');
          if (harness.mode === 'pending')
            return new Promise<void>((resolve) => {
              harness.resolveWrite = () => {
                harness.clipboard = args.packet.payload;
                resolve();
              };
            });
          harness.clipboard = args.packet.payload;
          return Promise.resolve();
        },
      },
    });
    const unavailable = () => {
      harness.browserCalls++;
      return Promise.reject(new Error('Native commands must not use the browser Clipboard API.'));
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: { read: unavailable, write: unavailable },
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
async function mode(page: Page, value: NativeHarness['mode']): Promise<void> {
  await page.evaluate((value) => {
    (window as unknown as HarnessWindow).hancadNativeClipboard.mode = value;
  }, value);
}
async function pendingCut(page: Page): Promise<void> {
  await mode(page, 'pending');
  await selectAll(page);
  await page.keyboard.press('Control+x');
  await expect(page.locator('.command-prompt')).toHaveText('클립보드 처리 중...');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as unknown as HarnessWindow).hancadNativeClipboard.resolveWrite),
      ),
    )
    .toBe(true);
}
async function resolveWrite(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const resolve = (window as unknown as HarnessWindow).hancadNativeClipboard.resolveWrite;
    if (!resolve) throw new Error('No pending native clipboard write.');
    resolve();
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}
async function expectNoBrowserFallback(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => (window as unknown as HarnessWindow).hancadNativeClipboard.browserCalls,
    ),
  ).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('hancad.drawing-clipboard.v1'))).toBeNull();
}

test('Clipboard images use the current WIPEOUT frame mode while exact packet metadata stays unchanged', async ({
  page,
}) => {
  for (const token of ['WIPEOUTFRAME', '1', 'WIPEOUT', '0,0', '100,0', '100,50', '0,50', ''])
    await enter(page, token);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const original = (await drawing(page)).entities;
  expect(original[0]?.frameMode).toBe(1);
  let originalPayload: string | undefined;
  for (const value of ['2', '1', '0']) {
    await enter(page, 'WIPEOUTFRAME');
    await enter(page, value);
    await selectAll(page);
    await page.keyboard.press('Control+c');
    await expect(page.locator('.command-prompt')).toHaveText('명령:');
    const copied = await page.evaluate(async () => {
      const packet = (window as unknown as HarnessWindow).hancadNativeClipboard.packet;
      if (!packet) throw new Error('Missing Clipboard packet.');
      const image = await createImageBitmap(
        new Blob([new Uint8Array(packet.png)], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing PNG decoder.');
      context.drawImage(image, 0, 0);
      image.close();
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let index = 0; index < rgba.length; index += 4)
        if (rgba[index] !== 255 || rgba[index + 1] !== 255 || rgba[index + 2] !== 255) ink++;
      return { payload: packet.payload, ink };
    });
    if (value === '1') expect(copied.ink).toBeGreaterThan(0);
    else expect(copied.ink).toBe(0);
    originalPayload ??= copied.payload;
    expect(copied.payload).toBe(originalPayload);
    expect(JSON.parse(copied.payload).state.entities).toEqual(original);
    expect((await drawing(page)).entities).toEqual(original);
    await expectNoBrowserFallback(page);
  }
});

test('native COPYBASE sends exact JSON plus a matching PNG/32-bit DIB and PASTECLIP uses native data', async ({
  page,
}) => {
  await line(page);
  const original = (await drawing(page)).entities;
  await selectAll(page);
  await page.keyboard.press('Control+Shift+c');
  await expect(page.locator('.command-prompt')).toHaveText('기준점 지정:');
  await enter(page, '20,30');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  const packet = await page.evaluate(async () => {
    const packet = (window as unknown as HarnessWindow).hancadNativeClipboard.packet;
    if (!packet) throw new Error('Native clipboard packet is missing.');
    const png = new Uint8Array(packet.png),
      dib = new Uint8Array(packet.dib),
      header = new DataView(dib.buffer),
      image = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    const result = {
      payload: JSON.parse(packet.payload) as { basePoint: { x: number; y: number } },
      signature: Array.from(png.slice(0, 8)),
      headerSize: header.getUint32(0, true),
      width: header.getInt32(4, true),
      height: header.getInt32(8, true),
      planes: header.getUint16(12, true),
      bits: header.getUint16(14, true),
      compression: header.getUint32(16, true),
      imageSize: header.getUint32(20, true),
      dibBytes: dib.length,
      pngWidth: image.width,
      pngHeight: image.height,
      cornerPixel: Array.from(dib.slice(40, 44)),
    };
    image.close();
    return result;
  });
  expect(packet.payload).toMatchObject({
    format: 'HanCAD.Drawing',
    version: 1,
    basePoint: { x: 20, y: -30 },
    state: { entities: original },
  });
  expect(packet.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(packet).toMatchObject({ headerSize: 40, planes: 1, bits: 32, compression: 0 });
  expect(packet.width).toBe(packet.pngWidth);
  expect(packet.height).toBe(-packet.pngHeight);
  expect(packet.dibBytes).toBe(40 + packet.pngWidth * packet.pngHeight * 4);
  expect(packet.imageSize).toBe(packet.dibBytes - 40);
  expect(packet.cornerPixel).toEqual([255, 255, 255, 255]);
  await enter(page, 'NEW');
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+v');
  await expect(page.locator('.command-prompt')).toHaveText('삽입점 지정:');
  await enter(page, '100,100');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities[0]).toMatchObject({
    a: { x: 90, y: -80 },
    b: { x: 110, y: -80 },
  });
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).hancadNativeClipboard.calls),
  ).toContain('read_drawing_clipboard');
  await expectNoBrowserFallback(page);
});

test('rejected native CUTCLIP retains source, selection and undo history without browser fallback', async ({
  page,
}) => {
  await line(page);
  const original = (await drawing(page)).entities;
  await selectAll(page);
  await mode(page, 'reject');
  await page.keyboard.press('Control+x');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await expect(page.getByRole('log')).toContainText('클립보드 작업에 실패했습니다:');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  expect((await drawing(page)).entities).toEqual(original);
  await expectNoBrowserFallback(page);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities).toEqual(original);
});

test('Escape during native CUTCLIP preserves source and history after the pending IPC succeeds', async ({
  page,
}) => {
  await line(page);
  const original = (await drawing(page)).entities;
  await pendingCut(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await resolveWrite(page);
  expect((await drawing(page)).entities).toEqual(original);
  await expectNoBrowserFallback(page);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
});

test('switching drawings during pending native CUTCLIP cannot erase either drawing on completion', async ({
  page,
}) => {
  await line(page);
  const original = (await drawing(page)).entities;
  await enter(page, 'NEW');
  await line(page);
  const second = (await drawing(page)).entities;
  await page.locator('.file-tab').first().click();
  await pendingCut(page);
  await page.locator('.file-tab').nth(1).click();
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await resolveWrite(page);
  expect((await drawing(page)).entities).toEqual(second);
  await page.locator('.file-tab').first().click();
  expect((await drawing(page)).entities).toEqual(original);
  await expectNoBrowserFallback(page);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await page.locator('.file-tab').nth(1).click();
  expect((await drawing(page)).entities).toEqual(second);
});

test('browser CUTCLIP keeps source and undo history when both OS access and shared storage fail', async ({
  page,
}) => {
  await line(page);
  const original = (await drawing(page)).entities;
  await selectAll(page);
  await page.evaluate(() => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    const clipboardKey = 'hancad.drawing-clipboard.v1',
      open = indexedDB.open.bind(indexedDB),
      setItem = Storage.prototype.setItem;
    Object.defineProperty(indexedDB, 'open', {
      value: (name: string, version?: number) => {
        if (name === clipboardKey) throw new DOMException('Denied', 'SecurityError');
        return open(name, version);
      },
      configurable: true,
    });
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === clipboardKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
  });
  await page.keyboard.press('Control+x');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await expect(page.getByRole('log')).toContainText('클립보드 작업에 실패했습니다:');
  await expect(page.getByRole('log')).not.toContainText(
    'HanCAD 창 사이의 내부 클립보드를 사용합니다.',
  );
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  expect((await drawing(page)).entities).toEqual(original);
  expect(
    await page.evaluate(
      () => (window as unknown as HarnessWindow).hancadNativeClipboard.browserCalls,
    ),
  ).toBe(1);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities).toEqual(original);
});
