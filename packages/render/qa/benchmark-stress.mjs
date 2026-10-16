import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = path.join(root, 'test-artifacts', 'render-stress');
await fs.mkdir(output, { recursive: true });
const built = await build({
  configFile: false,
  logLevel: 'error',
  resolve: {
    alias: Object.fromEntries(
      ['legacy-bridge', 'geom', 'db'].map((name) => [
        `@hancad/${name}`,
        path.join(root, `packages/${name}/src/index.ts`),
      ]),
    ),
  },
  build: {
    write: false,
    minify: true,
    lib: {
      entry: path.join(root, 'packages/render/qa/stress-harness.ts'),
      name: 'HanCADStressQA',
      formats: ['iife'],
    },
  },
});
const script = (Array.isArray(built) ? built : [built])
  .flatMap((b) => b.output)
  .find((item) => item.type === 'chunk').code;
const browser = await chromium.launch({
  channel: 'msedge',
  headless: process.env.HANCAD_HEADED !== '1',
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.bringToFront();
  await page.goto('about:blank');
  await page.addScriptTag({ content: script });
  const result = await page.evaluate(
    async (count) => globalThis.HanCADStressQA.benchmark(count),
    Number(process.env.HANCAD_STRESS_COUNT ?? 1000000),
  );
  const report = {
    date: new Date().toISOString(),
    cpu: os.cpus()[0]?.model,
    ramGiB: os.totalmem() / 1024 ** 3,
    ...result,
  };
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: path.join(output, 'million-entities.png') });
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.glError, 0);
  assert(
    report.inkPixels > 100000,
    'The stress dataset must produce substantial visible geometry.',
  );
  for (const mode of ['pan', 'zoom']) {
    assert(
      report[mode].fps >= 59 && report[mode].frameMs.p95 < 18.5,
      `${mode} did not sustain a 60 Hz frame cadence.`,
    );
  }
} finally {
  await browser.close();
}
