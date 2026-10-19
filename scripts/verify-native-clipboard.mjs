import { expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { nativeAcceptance } from './native-acceptance-runtime.mjs';
import { verifyNativeGrips } from './native-acceptance-grips.mjs';
const qa = await nativeAcceptance('phase05-native-runtime', 9223);
const {
  root,
  dir,
  port,
  assertPoint,
  log,
  connect,
  enter,
  drawing,
  count,
  idle,
  selectAll,
  shortcut,
  snapshot,
} = qa;
try {
  for (const entry of await fs.readdir(dir))
    if (entry.endsWith('.dxf')) await fs.unlink(path.join(dir, entry));
  const a = await connect('A', port),
    b = await connect('B', port + 1);
  for (const page of [a, b]) {
    await enter(page, 'NEW');
    for (const [name, value] of [
      ['OSMODE', '0'],
      ['ORTHOMODE', '0'],
      ['DYNMODE', '0'],
      ['AUTOSNAP', '0'],
    ]) {
      await enter(page, name);
      await enter(page, value);
    }
  }
  for (const token of ['L', '10,10', '30,10', '']) await enter(a, token);
  await count(a, 1);
  await selectAll(a);
  await shortcut(a, 'Control+Shift+c');
  await expect(a.locator('.command-prompt')).toHaveText('기준점 지정:');
  await enter(a, '20,30');
  await idle(a);
  assert.ok(
    !(await a.getByRole('log', { name: '명령 기록' }).innerText()).includes('브라우저 내부'),
  );
  const formats = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-STA',
      '-File',
      path.join(root, 'scripts/native-clipboard-inspect.ps1'),
      '-OutputDirectory',
      dir,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  const metadata = JSON.parse(formats);
  for (const format of [
    'HanCAD.Drawing.v1',
    'PNG',
    'DeviceIndependentBitmap',
    'Bitmap',
    'UnicodeText',
  ])
    assert.ok(metadata.formats.includes(format));
  assert.equal(metadata.format, 'HanCAD.Drawing');
  assert.equal(metadata.version, 1);
  assertPoint(metadata.basePoint, { x: 20, y: -30 });
  assert.equal(metadata.entityCount, 1);
  assert.ok(metadata.imageWidth > 0 && metadata.imageHeight > 0);
  assert.equal(metadata.imageWidth, metadata.pngWidth);
  assert.equal(metadata.imageHeight, metadata.pngHeight);
  assert.equal(metadata.pixelMismatches, 0);
  log('native-formats', metadata);
  await shortcut(b, 'Control+v');
  await expect(b.locator('.command-prompt')).toHaveText('삽입점 지정:');
  await enter(b, '100,100');
  await count(b, 1);
  assertPoint((await drawing(b)).entities[0].a, { x: 90, y: -80 });
  assertPoint((await drawing(b)).entities[0].b, { x: 110, y: -80 });
  await enter(b, 'U');
  await count(b, 0);
  await enter(b, 'REDO');
  await count(b, 1);
  await enter(b, 'PASTEORIG');
  await count(b, 2);
  assertPoint((await drawing(b)).entities[1].a, { x: 10, y: -10 });
  await shortcut(b, 'Control+Shift+v');
  await expect(b.locator('.command-prompt')).toHaveText('삽입점 지정:');
  await enter(b, '50,50');
  await count(b, 3);
  assertPoint((await drawing(b)).clipboardBlocks[0].basePoint, { x: 50, y: -50 });
  log(
    'two-process-native-copybase-paste-orig-block-undo',
    'passed exact geometry and one-step undo/redo',
  );
  await snapshot(a, 'window-A-copybase');
  await snapshot(b, 'window-B-pasted-block');
  const downloadSession = await b.context().newCDPSession(b);
  await downloadSession.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dir,
    eventsEnabled: true,
  });
  await b.getByRole('button', { name: '파일', exact: true }).click();
  const downloaded = b.waitForEvent('download');
  await b.getByRole('menuitem', { name: 'DXF 저장', exact: true }).click();
  const dxf = await downloaded;
  const dxfPath = path.join(dir, 'native-clipboard-block.dxf');
  await dxf.failure();
  const actualDownload = path.join(dir, dxf.suggestedFilename());
  await fs.copyFile(actualDownload, dxfPath);
  assert.match(await fs.readFile(dxfPath, 'utf8'), /\r\nINSERT\r\n/);
  await b.getByTestId('cad-file-input').setInputFiles(dxfPath);
  await count(b, 3);
  assertPoint((await drawing(b)).clipboardBlocks[0].basePoint, { x: 50, y: -50 });
  log('native-WebView-block-DXF-roundtrip', 'passed supported members and insertion point');
  await selectAll(a);
  await shortcut(a, 'Control+x');
  await idle(a);
  await count(a, 0);
  await enter(a, 'U');
  await count(a, 1);
  await enter(b, 'PASTECLIP');
  await enter(b, '200,200');
  await count(b, 4);
  log('native-cut-undo-cross-process-paste', 'passed');
  await selectAll(a);
  const holder = spawn(
    'powershell.exe',
    ['-NoProfile', '-File', path.join(root, 'scripts/hold-clipboard.ps1'), '-Seconds', '8'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await new Promise((resolve, reject) => {
    holder.stdout.once('data', resolve);
    holder.once('error', reject);
    holder.once('exit', (code) => {
      if (code) reject(new Error(`holder ${code}`));
    });
  });
  const before = (await drawing(a)).entities;
  await shortcut(a, 'Control+x');
  await idle(a);
  await count(a, 1);
  assert.deepEqual((await drawing(a)).entities, before);
  const history = await a.getByRole('log', { name: '명령 기록' }).innerText();
  assert.match(history, /Windows 클립보드를 열 수 없습니다/);
  await new Promise((resolve) => holder.once('exit', resolve));
  await enter(a, 'U');
  await count(a, 0);
  await enter(a, 'REDO');
  await count(a, 1);
  log(
    'native-clipboard-contention-cut-preserves-source-and-history',
    'passed actual held Win32 clipboard',
  );
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-STA',
      '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText('HanCAD external text QA')",
    ],
    { windowsHide: true },
  );
  await enter(b, 'PASTECLIP');
  await idle(b);
  await count(b, 4);
  assert.match(await b.getByRole('log', { name: '명령 기록' }).innerText(), /클립보드.*없/);
  log('external-text-replacement', 'passed no stale HanCAD packet resurrected');
  await selectAll(a);
  await shortcut(a, 'Control+c');
  await idle(a);
  await selectAll(a);
  await shortcut(a, 'Control+1');
  await expect(a.getByTestId('properties-palette')).toBeVisible();
  const palette = a.getByTestId('properties-palette');
  await expect(palette.getByRole('textbox', { name: '시작 Y', exact: true })).toHaveValue('10');
  const startX = palette.getByRole('textbox', { name: '시작 X', exact: true });
  await startX.focus();
  await a.keyboard.press('Control+a');
  await a.keyboard.type('12');
  await a.keyboard.press('Enter');
  assert.equal((await drawing(a)).entities[0].a.x, 12);
  await palette.getByRole('button', { name: '닫기', exact: true }).click();
  await enter(a, 'U');
  assert.equal((await drawing(a)).entities[0].a.x, 10);
  await shortcut(a, 'Control+Shift+p');
  await expect(a.getByTestId('quick-properties')).toBeVisible();
  await a
    .getByTestId('quick-properties')
    .getByRole('button', { name: '닫기', exact: true })
    .click();
  log(
    'native-WebView-dispatched-shortcuts',
    'Ctrl+C/X/V, Ctrl+Shift+C/V, Ctrl+1, Ctrl+Shift+P passed; not physical SendInput',
  );
  await snapshot(a, 'window-A-final');
  await snapshot(b, 'window-B-final');
  await verifyNativeGrips(qa, a);
} catch (error) {
  await qa.capture(error);
  process.exitCode = 1;
} finally {
  await qa.close();
}
