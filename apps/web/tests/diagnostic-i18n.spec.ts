import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const fixture = fileURLToPath(new URL('../../../vendor/example_2000.dwg', import.meta.url));
const drawingStorageKey = 'hancad.active-drawing.v1';
const previousDxf =
  '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n30\n0\nENDSEC\n0\nEOF\n';

async function language(page: Page, locale: 'ko-KR' | 'en-US'): Promise<void> {
  await page.getByRole('combobox', { name: /^(언어|Language)$/ }).selectOption(locale);
}

async function importDxf(page: Page, name: string, content = previousDxf): Promise<void> {
  await page.getByTestId('cad-file-input').setInputFiles({
    name,
    mimeType: 'application/dxf',
    buffer: Buffer.from(content),
  });
}

async function submit(page: Page, value: string): Promise<void> {
  await page.getByRole('textbox', { name: /^(명령 입력|Type a command)$/ }).focus();
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}

test('dynamic DXF and binary diagnostics use the active language and retain the drawing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await importDxf(page, 'previous.dxf');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const canvas = page.getByTestId('drawing-canvas');
  const zoom = await canvas.getAttribute('data-zoom');
  const baseline = await page.evaluate((key) => localStorage.getItem(key), drawingStorageKey);
  for (const locale of ['en-US', 'ko-KR'] as const) {
    await language(page, locale);
    const latest = page.getByRole('log').locator('.history-line').last();
    const invalid = [
      {
        name: 'group-code.dxf',
        content: '0\nSECTION\n2\nENTITIES\nINVALID\nLINE\n0\nENDSEC\n0\nEOF\n',
        english: 'Invalid DXF group code on line 5.',
        korean: 'DXF 5행의 그룹 코드가 올바르지 않습니다.',
      },
      {
        name: 'number.dxf',
        content: previousDxf.replace('\n100\n', '\nnot-a-number\n'),
        english: 'Invalid DXF number on line 14.',
        korean: 'DXF 14행에 유효하지 않은 숫자가 있습니다.',
      },
      {
        name: 'binary.dxf',
        content: 'AutoCAD Binary DXF\r\n\u001a\u0000',
        english: 'Binary DXF is not supported. Save an ASCII DXF from your CAD application.',
        korean: '바이너리 DXF는 지원하지 않습니다.',
      },
    ];
    for (const failure of invalid) {
      await importDxf(page, failure.name, failure.content);
      await expect(latest).toContainText(locale === 'en-US' ? failure.english : failure.korean);
      if (locale === 'en-US') expect(await latest.innerText()).not.toMatch(/[가-힣]/);
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
      await expect(
        page.getByRole('navigation', { name: /^(도면 탭|Drawing tabs)$/ }),
      ).toContainText('previous.dxf');
      await expect(canvas).toHaveAttribute('data-zoom', zoom ?? '');
      expect(await page.evaluate((key) => localStorage.getItem(key), drawingStorageKey)).toBe(
        baseline,
      );
    }
  }
  expect(errors).toEqual([]);
});

test('typed import warnings switch language after cache reload while untyped text stays exact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await importDxf(page, 'units-unspecified.dxf');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const warnings = page.getByTestId('drawing-import-report').locator('li');
  await expect(warnings).toHaveCount(1);
  await expect(warnings.first()).toContainText('도면 단위가 mm / cm / m로 지정되지 않아');
  await page.getByTestId('drawing-import-report').locator('details > summary').click();
  await expect(warnings.first()).toBeVisible();
  await page.screenshot({ path: 'test-artifacts/bootstrap-diagnostics/import-warnings-ko.png' });
  await language(page, 'en-US');
  await expect(warnings.first()).toHaveText(
    'Drawing units are not mm, cm or m; coordinates are imported without units.',
  );
  expect(await warnings.first().innerText()).not.toMatch(/[가-힣]/);
  await page.screenshot({ path: 'test-artifacts/bootstrap-diagnostics/import-warnings-en.png' });

  // An arbitrary legacy/external warning must not be translated by guessing from its text.
  const externalWarning = '도면 단위가 mm / cm / m로 지정되지 않아 단위 없는 좌표로 가져옵니다.';
  await page.evaluate(
    ({ key, warning }) => {
      const serialized = localStorage.getItem(key);
      if (!serialized) throw new Error('Expected a cached drawing.');
      const session = JSON.parse(serialized) as {
        report: { warnings: string[]; warningDiagnostics?: (Record<string, unknown> | null)[] };
      };
      session.report.warnings.push(warning);
      session.report.warningDiagnostics?.push(null);
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: drawingStorageKey, warning: externalWarning },
  );
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(warnings).toHaveCount(2);
  await expect(warnings.first()).toContainText('도면 단위가 mm / cm / m로 지정되지 않아');
  await expect(warnings.last()).toHaveText(externalWarning);
  await language(page, 'en-US');
  expect(await warnings.first().innerText()).not.toMatch(/[가-힣]/);
  await expect(warnings.last()).toHaveText(externalWarning);
  await language(page, 'ko-KR');
  await expect(warnings.first()).toContainText('도면 단위가 mm / cm / m로 지정되지 않아');
  await expect(warnings.last()).toHaveText(externalWarning);
});

test('paused DWG reader progress changes language immediately and cancels in the active language', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    const readers = new Set<Worker>();
    let pausedInputs = 0;
    class PausedDwgWorker extends NativeWorker {
      private readonly paused: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.paused = options?.name === 'local-dwg-reader';
        if (this.paused) readers.add(this);
      }
      override postMessage(
        message: unknown,
        transfer: Transferable[] | StructuredSerializeOptions = [],
      ): void {
        if (this.paused) {
          pausedInputs++;
          return;
        }
        if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
      override terminate(): void {
        readers.delete(this);
        super.terminate();
      }
    }
    globalThis.Worker = PausedDwgWorker;
    Object.defineProperty(globalThis, '__pausedDwgReader', {
      get: () => ({ active: readers.size, pausedInputs }),
    });
  });
  await page.goto('/');
  await importDxf(page, 'previous.dxf');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await page.getByTestId('cad-file-input').setInputFiles(fixture);
  const status = page.getByRole('status');
  await expect(status).toContainText('DWG 해석 중 (오프라인)');
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as typeof globalThis & {
            __pausedDwgReader: { active: number; pausedInputs: number };
          }
        ).__pausedDwgReader,
    ),
  ).toEqual({ active: 1, pausedInputs: 1 });
  await language(page, 'en-US');
  await expect(status.locator('p')).toHaveText('Decoding DWG (offline)');
  expect(await status.innerText()).not.toMatch(/[가-힣]/);
  await language(page, 'ko-KR');
  await expect(status).toContainText('DWG 해석 중 (오프라인)');
  await language(page, 'en-US');
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  await expect(status).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as typeof globalThis & {
            __pausedDwgReader: { active: number };
          }
        ).__pausedDwgReader.active,
    ),
  ).toBe(0);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(page.getByRole('navigation', { name: 'Drawing tabs' })).toContainText(
    'previous.dxf',
  );
  await expect(page.getByRole('log').locator('.history-line').last()).toHaveText(
    'Drawing import was cancelled. The previous drawing is retained.',
  );
});

test('registered PNG export failures use the active language without changing the drawing journal', async ({
  page,
}) => {
  const errors: string[] = [];
  let downloads = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('download', () => downloads++);
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = (callback: BlobCallback) => callback(null);
  });
  await page.goto('/');
  await importDxf(page, 'previous.dxf');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  for (const value of ['LINE', '0,60', '100,60', '']) await submit(page, value);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  const baseline = await page.evaluate((key) => localStorage.getItem(key), drawingStorageKey);
  const canvas = page.getByTestId('drawing-canvas');
  const zoom = await canvas.getAttribute('data-zoom');
  const latest = page.getByRole('log').locator('.history-line').last();
  for (const locale of ['en-US', 'ko-KR'] as const) {
    await language(page, locale);
    await submit(page, 'EXPORTPNG');
    await expect(latest).toContainText(
      locale === 'en-US' ? 'Drawing image conversion failed.' : '도면 이미지 변환에 실패했습니다.',
    );
    if (locale === 'en-US') expect(await latest.innerText()).not.toMatch(/[가-힣]/);
    await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
    await expect(canvas).toHaveAttribute('data-zoom', zoom ?? '');
    expect(await page.evaluate((key) => localStorage.getItem(key), drawingStorageKey)).toBe(
      baseline,
    );
  }
  await submit(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await submit(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect(downloads).toBe(0);
  expect(errors).toEqual([]);
});

test('pending PNG export failure follows the language selected before the callback completes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let pending: BlobCallback | undefined;
    HTMLCanvasElement.prototype.toBlob = (callback: BlobCallback) => {
      pending = callback;
    };
    Object.defineProperty(globalThis, '__hasPendingPngFailure', { get: () => Boolean(pending) });
    Object.defineProperty(globalThis, '__releasePngFailure', {
      value: () => {
        if (!pending) throw new Error('Expected a pending PNG callback.');
        const callback = pending;
        pending = undefined;
        callback(null);
      },
    });
  });
  await page.goto('/');
  await importDxf(page, 'previous.dxf');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const baseline = await page.evaluate((key) => localStorage.getItem(key), drawingStorageKey);
  const zoom = await page.getByTestId('drawing-canvas').getAttribute('data-zoom');
  await submit(page, 'EXPORTPNG');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as typeof globalThis & { __hasPendingPngFailure: boolean })
            .__hasPendingPngFailure,
      ),
    )
    .toBe(true);
  await language(page, 'en-US');
  await page.evaluate(() =>
    (globalThis as typeof globalThis & { __releasePngFailure: () => void }).__releasePngFailure(),
  );
  await expect(page.getByRole('log').locator('.history-line').last()).toHaveText(
    'Drawing image conversion failed.',
  );
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-zoom', zoom ?? '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect(await page.evaluate((key) => localStorage.getItem(key), drawingStorageKey)).toBe(baseline);
});

for (const failureTarget of ['main', 'preview'] as const) {
  test(`${failureTarget} renderer startup failure retains the shell and cleans up resources`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript((target) => {
      const nativeContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = new Proxy(nativeContext, {
        apply(method, canvas: HTMLCanvasElement, args: unknown[]) {
          const main = canvas.dataset.testid === 'drawing-canvas';
          const preview = !main && canvas.parentElement?.classList.contains('canvas-host');
          if (target === 'main' ? args[0] === 'webgl2' && main : args[0] === '2d' && preview)
            return null;
          return Reflect.apply(method, canvas, args);
        },
      });
      const active = new Set<ResizeObserver>();
      const NativeResizeObserver = ResizeObserver;
      class CountedResizeObserver extends NativeResizeObserver {
        override observe(element: Element, options?: ResizeObserverOptions): void {
          active.add(this);
          super.observe(element, options);
        }
        override disconnect(): void {
          active.delete(this);
          super.disconnect();
        }
      }
      globalThis.ResizeObserver = CountedResizeObserver;
      Object.defineProperty(globalThis, '__activeRendererObservers', {
        get: () => active.size,
      });
    }, failureTarget);
    await page.goto('/');
    const alert = page.getByTestId('renderer-error');
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toBeVisible();
    await expect(alert.locator('strong')).toHaveText('도면 화면을 초기화하지 못했습니다.');
    await expect(alert.locator('p')).toHaveText(
      `도면 화면 초기화 오류: ${failureTarget === 'main' ? '도면 화면' : '미리보기'} 캔버스를 만들지 못했습니다.`,
    );
    await expect(page.getByRole('tab', { name: '홈', exact: true })).toBeVisible();
    await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
    await expect(page.locator('.canvas-host canvas')).toHaveCount(0);
    await page.screenshot({
      path: `test-artifacts/bootstrap-diagnostics/${failureTarget}-renderer-ko.png`,
    });
    expect(
      await page.evaluate(
        () =>
          (globalThis as typeof globalThis & { __activeRendererObservers: number })
            .__activeRendererObservers,
      ),
    ).toBe(0);
    await submit(page, 'GETVAR');
    await submit(page, 'OSMODE');
    await expect(page.getByRole('log').locator('.history-line').last()).toHaveText('OSMODE = 4133');
    await language(page, 'en-US');
    await expect(alert).toBeVisible();
    expect(await alert.innerText()).not.toMatch(/[가-힣]/);
    await expect(alert.locator('strong')).toHaveText(
      'The drawing display could not be initialized.',
    );
    await expect(alert.locator('p')).toHaveText(
      `Drawing display initialization error: The ${failureTarget === 'main' ? 'drawing' : 'preview'} canvas could not be created.`,
    );
    await page.screenshot({
      path: `test-artifacts/bootstrap-diagnostics/${failureTarget}-renderer-en.png`,
    });
    await submit(page, 'NOTACAD');
    await expect(page.getByRole('log').locator('.history-line').last()).toContainText(
      /unknown command/i,
    );
    await language(page, 'ko-KR');
    expect(await alert.innerText()).toMatch(/[가-힣]/);
    await expect(page.locator('.canvas-host canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
