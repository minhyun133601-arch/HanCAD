import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const cargoBin = join(homedir(), '.cargo', 'bin');
const env = {
  ...process.env,
  PATH: `${cargoBin}${delimiter}${process.env.PATH ?? ''}`,
};

function inspect(command, args) {
  const localExecutable = join(cargoBin, process.platform === 'win32' ? `${command}.exe` : command);
  const executable = existsSync(localExecutable) ? localExecutable : command;
  const result = spawnSync(executable, args, { env, encoding: 'utf8', windowsHide: true });
  return {
    available: !result.error && result.status === 0,
    value: result.stdout?.trim() ?? '',
    error: result.error?.message ?? result.stderr?.trim() ?? '',
  };
}

{
  const inventory = {
    rust: inspect('rustc', ['--version']),
    cargo: inspect('cargo', ['--version']),
    wasmBindgen: inspect('wasm-bindgen', ['--version']),
    wasmTarget: inspect('rustup', ['target', 'list', '--installed']),
  };
  if (process.platform === 'win32') {
    const vswhere = join(
      process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      'Microsoft Visual Studio',
      'Installer',
      'vswhere.exe',
    );
    inventory.msvc = existsSync(vswhere)
      ? inspect(vswhere, [
          '-latest',
          '-products',
          '*',
          '-requires',
          'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
          '-property',
          'installationPath',
        ])
      : { available: false, value: '', error: 'Visual Studio Installer not found' };
    if (!inventory.msvc.value) {
      inventory.msvc.available = false;
      inventory.msvc.error = 'MSVC C++ desktop build tools are not installed.';
    }
    inventory.webView2 = inspect('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$roots = @('HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients', 'HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients'); $roots | ForEach-Object { Get-ChildItem -LiteralPath $_ -ErrorAction SilentlyContinue } | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } | Where-Object { $_.name -match 'WebView2' } | ForEach-Object { $_.pv }",
    ]);
    if (!inventory.webView2.value) {
      inventory.webView2.available = false;
      inventory.webView2.error = 'Microsoft Edge WebView2 Runtime was not found in the registry.';
    }
  }
  console.log(JSON.stringify(inventory, null, 2));
  const required = ['rust', 'cargo', 'wasmBindgen'];
  const missing = required.some((key) => !inventory[key].available);
  const targetMissing = !inventory.wasmTarget.value.includes('wasm32-unknown-unknown');
  const msvcMissing = process.platform === 'win32' && !inventory.msvc.value;
  const webViewMissing = process.platform === 'win32' && !inventory.webView2.value;
  if (missing || targetMissing || msvcMissing || webViewMissing) process.exitCode = 1;
}
