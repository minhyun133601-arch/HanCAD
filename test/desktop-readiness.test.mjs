import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { desktopFailures, desktopFailureMessage, inspectDesktop } from '../scripts/desktop-readiness.mjs';
import { runTauri } from '../scripts/run-tauri.mjs';

function windowsFixture() {
  const join = path.win32.join;
  const toolset = 'C:\\VS\\VC\\Tools\\MSVC\\14.40.33807';
  const sdk = 'C:\\Kits\\10';
  const version = '10.0.26100.0';
  const files = new Set([
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe',
    ...['cl.exe', 'link.exe'].map((name) => join(toolset, 'bin', 'Hostx64', 'x64', name)),
    ...['vcruntime.h', 'vector'].map((name) => join(toolset, 'include', name)),
    ...['libcmt.lib', 'msvcrt.lib', 'vcruntime.lib'].map((name) => join(toolset, 'lib', 'x64', name)),
    join(sdk, 'Include', version, 'um', 'Windows.h'),
    join(sdk, 'Include', version, 'shared', 'sdkddkver.h'),
    join(sdk, 'Include', version, 'ucrt', 'stdio.h'),
    ...['kernel32.lib', 'user32.lib'].map((name) => join(sdk, 'Lib', version, 'um', 'x64', name)),
    join(sdk, 'Lib', version, 'ucrt', 'x64', 'ucrt.lib'),
    ...['rc.exe', 'mt.exe'].map((name) => join(sdk, 'bin', version, 'x64', name)),
  ]);
  const calls = [];
  const fixture = {
    files, calls, toolset, sdk, version,
    targets: 'wasm32-unknown-unknown\nx86_64-pc-windows-msvc',
    host: 'x86_64-pc-windows-msvc', node: 'v24.18.0', nodeLts: 'Krypton', rust: 'rustc 1.99.0', webView2: '141.0.3537.71',
    failed: new Map(),
  };
  fixture.options = {
    platform: 'win32', arch: 'x64', nodeExecutable: 'C:\\Node\\node.exe',
    env: { USERPROFILE: 'C:\\Users\\Fixture', PATH: 'C:\\Tools' },
    exists: (file) => files.has(file),
    list: (directory) => directory === join('C:\\VS', 'VC', 'Tools', 'MSVC')
      ? ['14.99.0', '14.40.33807'] : directory === join(sdk, 'Include') ? [version] : [],
    execute: (command, args, options) => {
      calls.push({ command, args, options });
      const name = path.win32.basename(command).replace(/\.exe$/, '');
      if (fixture.failed.has(name)) return fixture.failed.get(name);
      let stdout;
      if (name === 'git') stdout = 'git version 2.51.0.windows.1';
      else if (name === 'node') {
        assert.equal(args[0], '-p');
        stdout = JSON.stringify({ version: fixture.node, lts: fixture.nodeLts });
      }
      else if (name === 'cmd') {
        assert.deepEqual(args, ['/d', '/s', '/c', 'pnpm --version']);
        stdout = '12.11.2';
      } else if (name === 'cargo') stdout = 'cargo 1.99.0';
      else if (name === 'rustc') stdout = args[0] === '-vV' ? `rustc 1.99.0\nhost: ${fixture.host}` : fixture.rust;
      else if (name === 'rustup') {
        assert.deepEqual(args, ['target', 'list', '--installed']);
        stdout = fixture.targets;
      } else if (name === 'wasm-bindgen') stdout = 'wasm-bindgen 0.2.104';
      else if (name === 'vswhere') stdout = 'C:\\VS';
      else if (name === 'powershell') stdout = args.at(-1).includes('KitsRoot10') ? sdk : fixture.webView2;
      else {
        assert.ok(['cl', 'link', 'rc', 'mt'].includes(name), `Unexpected tool: ${command}`);
        assert.ok(['/?', '-?'].includes(args[0]), 'Native probes must remain read-only.');
        stdout = 'Microsoft native tool';
      }
      return { status: 0, stdout, stderr: '' };
    },
  };
  return fixture;
}

test('desktop inventory verifies complete native files and executable probes, using an older complete toolset', () => {
  const fixture = windowsFixture();
  const inventory = inspectDesktop(fixture.options);
  assert.deepEqual(desktopFailures(inventory), []);
  assert.equal(inventory.msvc.value, fixture.toolset);
  assert.equal(inventory.windowsSdk.value, fixture.version);
  assert.equal(inventory.hostTarget.value, 'x86_64-pc-windows-msvc');
  for (const name of ['cl.exe', 'link.exe', 'rc.exe', 'mt.exe'])
    assert.ok(fixture.calls.some((call) => call.command.endsWith(name)));
  assert.ok(fixture.calls.every((call) => call.options.windowsHide && call.options.timeout === 15000));
});

test('registered Visual Studio without actual headers/libraries never passes native readiness', () => {
  const fixture = windowsFixture();
  fixture.files.delete(path.win32.join(fixture.toolset, 'include', 'vcruntime.h'));
  fixture.files.delete(path.win32.join(fixture.toolset, 'lib', 'x64', 'msvcrt.lib'));
  const inventory = inspectDesktop(fixture.options);
  assert.deepEqual(desktopFailures(inventory), ['msvc']);
  assert.equal(inventory.msvc.missingFiles.length, 2);
  assert.ok(!fixture.calls.some((call) => call.command.endsWith('cl.exe')));
  assert.match(desktopFailureMessage(inventory), /C\+\+를 사용한 데스크톱 개발/);
});

test('SDK headers alone, absent WebView2 and the wrong Rust host all produce separate actionable failures', () => {
  const fixture = windowsFixture();
  fixture.files.delete(path.win32.join(fixture.sdk, 'Lib', fixture.version, 'um', 'x64', 'kernel32.lib'));
  fixture.files.delete(path.win32.join(fixture.sdk, 'bin', fixture.version, 'x64', 'rc.exe'));
  fixture.host = 'x86_64-pc-windows-gnu';
  fixture.targets = 'wasm32-unknown-unknown-extra\nx86_64-pc-windows-gnu';
  fixture.webView2 = '';
  const inventory = inspectDesktop(fixture.options);
  assert.deepEqual(desktopFailures(inventory), ['wasmTarget', 'hostTarget', 'windowsSdk', 'webView2']);
  assert.equal(inventory.windowsSdk.missingFiles.length, 2);
  assert.match(desktopFailureMessage(inventory), /rustup target add wasm32-unknown-unknown/);
  assert.match(desktopFailureMessage(inventory), /Windows 10\/11 SDK/);
});

test('incompatible Node, Rust prerelease and native tool launch errors cannot count as available', () => {
  const fixture = windowsFixture();
  fixture.node = 'v26.1.0';
  fixture.nodeLts = null;
  fixture.rust = 'rustc 1.100.0-nightly';
  fixture.failed.set('link', { status: null, error: new Error('Missing compiler runtime DLL') });
  fixture.failed.set('cargo', { status: 1, stdout: '', stderr: 'cargo unavailable' });
  const inventory = inspectDesktop(fixture.options);
  assert.deepEqual(desktopFailures(inventory), ['node', 'rust', 'cargo', 'msvc']);
  assert.match(inventory.msvc.error, /runtime DLL/);
});

test('Tauri dev/build fail before starting the CLI, Vite or cargo when native prerequisites are absent', () => {
  const fixture = windowsFixture();
  fixture.files.delete(path.win32.join(fixture.toolset, 'bin', 'Hostx64', 'x64', 'link.exe'));
  const inventory = inspectDesktop(fixture.options);
  const spawned = [];
  for (const args of [['dev'], ['build'], ['--verbose', 'dev'], ['-v', 'build'], ['dev', '--', '--help']]) {
    assert.throws(() => runTauri(args, {
      exists: () => true, inspect: () => inventory,
      spawn: (...args) => spawned.push(args),
    }), /HanCAD 데스크톱 시작 전 필수 도구 검사/);
  }
  assert.equal(spawned.length, 0);
});

test('ready builds dispatch normally and help/info commands bypass native prerequisites', () => {
  const inventory = inspectDesktop(windowsFixture().options);
  const spawned = [];
  let inspected = 0;
  const child = {};
  const options = {
    exists: () => true,
    inspect: () => { inspected++; return inventory; },
    spawn: (...args) => { spawned.push(args); return child; },
  };
  assert.equal(runTauri(['dev', '--no-watch'], options), child);
  assert.equal(runTauri(['build', '--debug'], options), child);
  assert.equal(inspected, 2);
  for (const args of [['--help'], ['info'], ['dev', '--help'], ['build', '-h'], ['--version']])
    assert.equal(runTauri(args, options), child);
  assert.equal(inspected, 2);
  assert.equal(spawned.length, 7);
  assert.deepEqual(spawned[0][1].slice(1), ['dev', '--no-watch']);
  assert.equal(spawned[0][2].windowsHide, true);
  assert.throws(() => runTauri(['info'], { exists: () => false }), /pnpm install/);
  const missingBindgen = { ...inventory, wasmBindgen: { available: false } };
  assert.match(desktopFailureMessage(missingBindgen), /wasm-bindgen-cli --version 0\.2\.129 --locked/);
});
