import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export function desktopEnvironment(source = process.env) {
  const cargoBin = path.join(source.USERPROFILE || source.HOME || homedir(), '.cargo', 'bin');
  return { ...source, PATH: `${cargoBin}${path.delimiter}${source.PATH ?? ''}` };
}

const unavailable = (error, value = '') => ({ available: false, value, error });
const available = (value) => ({ available: true, value, error: '' });
const newestFirst = (a, b) => b.localeCompare(a, 'en', { numeric: true });

/** Read-only discovery: component registration alone never establishes native readiness. */
export function inspectDesktop(options = {}) {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const env = desktopEnvironment(options.env);
  const exists = options.exists ?? existsSync;
  const list =
    options.list ??
    ((directory) => {
      try {
        return readdirSync(directory);
      } catch {
        return [];
      }
    });
  const execute = options.execute ?? spawnSync;
  const paths = platform === 'win32' ? path.win32 : path;
  const cargoBin = paths.join(env.USERPROFILE || env.HOME || homedir(), '.cargo', 'bin');
  function inspect(command, args, nonempty = false) {
    const local = paths.join(cargoBin, platform === 'win32' ? `${command}.exe` : command);
    const executable = exists(local) ? local : command;
    const result =
      command === 'pnpm' && platform === 'win32'
        ? execute(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pnpm --version'], {
            env,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 15000,
          })
        : execute(executable, args, {
            env,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 15000,
          });
    const value = result.stdout?.trim() ?? '';
    if (result.error || result.status !== 0 || (nonempty && !value))
      return unavailable(
        result.error?.message || result.stderr?.trim() || `검사 실패: ${command}`,
        value,
      );
    return available(value);
  }
  const inventory = {
    platform,
    arch,
    git: inspect('git', ['--version'], true),
    node: inspect(
      options.nodeExecutable ?? process.execPath,
      ['-p', 'JSON.stringify({version:process.version,lts:process.release.lts||null})'],
      true,
    ),
    pnpm: inspect('pnpm', ['--version'], true),
    rust: inspect('rustc', ['--version'], true),
    cargo: inspect('cargo', ['--version'], true),
    wasmBindgen: inspect('wasm-bindgen', ['--version'], true),
  };
  let nodeRelease;
  try {
    nodeRelease = JSON.parse(inventory.node.value);
  } catch {
    nodeRelease = {};
  }
  inventory.node.value = nodeRelease.version ?? inventory.node.value;
  inventory.node.lts = nodeRelease.lts ?? null;
  const nodeVersion = /^v(\d+)\.(\d+)/.exec(inventory.node.value);
  if (
    inventory.node.available &&
    (!nodeVersion ||
      !inventory.node.lts ||
      Number(nodeVersion[1]) < 22 ||
      (Number(nodeVersion[1]) === 22 && Number(nodeVersion[2]) < 12))
  )
    inventory.node = unavailable('Node LTS 22.12 이상이 필요합니다.', inventory.node.value);
  if (inventory.rust.available && /nightly|beta/.test(inventory.rust.value))
    inventory.rust = unavailable('Rust stable 도구 모음이 필요합니다.', inventory.rust.value);

  const targets = inspect('rustup', ['target', 'list', '--installed'], true);
  const installed = new Set(targets.value.split(/\s+/));
  inventory.wasmTarget =
    targets.available && installed.has('wasm32-unknown-unknown')
      ? available(targets.value)
      : unavailable('wasm32-unknown-unknown 대상이 없습니다.', targets.value);
  const rustDetails = inspect('rustc', ['-vV'], true);
  const host = /^host: (.+)$/m.exec(rustDetails.value)?.[1]?.trim();
  const nativeArch = { x64: 'x86_64', arm64: 'aarch64', ia32: 'i686' }[arch];
  const expectedHost = platform === 'win32' ? `${nativeArch}-pc-windows-msvc` : host;
  inventory.hostTarget =
    rustDetails.available && host === expectedHost && installed.has(expectedHost)
      ? available(expectedHost)
      : unavailable(
          `Rust 네이티브 대상이 필요합니다: ${expectedHost ?? '호스트 검색 실패'}`,
          host ?? '',
        );

  if (platform !== 'win32') return inventory;
  const nativeDirectory = { x64: 'x64', arm64: 'arm64', ia32: 'x86' }[arch];
  const hostDirectory = arch === 'arm64' ? 'Hostarm64' : arch === 'ia32' ? 'Hostx86' : 'Hostx64';
  const programFiles = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const vswhere = paths.join(programFiles, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const installations = exists(vswhere)
    ? inspect(vswhere, ['-all', '-products', '*', '-property', 'installationPath'])
    : unavailable('Visual Studio Installer를 찾을 수 없습니다.');
  const toolsets = installations.value
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((installation) => {
      const directory = paths.join(installation, 'VC', 'Tools', 'MSVC');
      return list(directory)
        .sort(newestFirst)
        .map((version) => paths.join(directory, version));
    });
  if (env.VCToolsInstallDir) toolsets.unshift(env.VCToolsInstallDir);
  inventory.msvc = unavailable('MSVC C++ 도구의 컴파일러·링커·헤더·라이브러리가 없습니다.');
  for (const toolset of toolsets) {
    const compiler = paths.join(toolset, 'bin', hostDirectory, nativeDirectory || '', 'cl.exe');
    const linker = paths.join(toolset, 'bin', hostDirectory, nativeDirectory || '', 'link.exe');
    const required = [
      compiler,
      linker,
      paths.join(toolset, 'include', 'vcruntime.h'),
      paths.join(toolset, 'include', 'vector'),
      ...['libcmt.lib', 'msvcrt.lib', 'vcruntime.lib'].map((name) =>
        paths.join(toolset, 'lib', nativeDirectory || '', name),
      ),
    ];
    const missingFiles = required.filter((file) => !exists(file));
    if (missingFiles.length) {
      inventory.msvc = { ...unavailable('MSVC 설치 파일이 불완전합니다.', toolset), missingFiles };
      continue;
    }
    const compilerProbe = inspect(compiler, ['/?']);
    const linkerProbe = inspect(linker, ['/?']);
    inventory.msvc = {
      available: compilerProbe.available && linkerProbe.available,
      value: toolset,
      compiler,
      linker,
      error: compilerProbe.error || linkerProbe.error,
    };
    if (inventory.msvc.available) break;
  }
  const sdkRegistry = inspect('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "Get-ItemPropertyValue -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots' -Name KitsRoot10 -ErrorAction SilentlyContinue",
  ]);
  const sdkRoot = sdkRegistry.value || paths.join(programFiles, 'Windows Kits', '10');
  inventory.windowsSdk = unavailable(
    'Windows SDK 헤더·라이브러리·rc.exe·mt.exe가 없습니다.',
    sdkRoot,
  );
  for (const version of list(paths.join(sdkRoot, 'Include')).sort(newestFirst)) {
    const include = paths.join(sdkRoot, 'Include', version);
    const library = paths.join(sdkRoot, 'Lib', version);
    const binary = paths.join(sdkRoot, 'bin', version, nativeDirectory || '');
    const resourceCompiler = paths.join(binary, 'rc.exe');
    const manifestTool = paths.join(binary, 'mt.exe');
    const required = [
      paths.join(include, 'um', 'Windows.h'),
      paths.join(include, 'shared', 'sdkddkver.h'),
      paths.join(include, 'ucrt', 'stdio.h'),
      ...['kernel32.lib', 'user32.lib'].map((name) =>
        paths.join(library, 'um', nativeDirectory || '', name),
      ),
      paths.join(library, 'ucrt', nativeDirectory || '', 'ucrt.lib'),
      resourceCompiler,
      manifestTool,
    ];
    const missingFiles = required.filter((file) => !exists(file));
    if (missingFiles.length) {
      inventory.windowsSdk = {
        ...unavailable('Windows SDK 설치 파일이 불완전합니다.', version),
        missingFiles,
      };
      continue;
    }
    const rcProbe = inspect(resourceCompiler, ['/?']);
    const mtProbe = inspect(manifestTool, ['-?']);
    inventory.windowsSdk = {
      available: rcProbe.available && mtProbe.available,
      value: version,
      root: sdkRoot,
      error: rcProbe.error || mtProbe.error,
    };
    if (inventory.windowsSdk.available) break;
  }
  inventory.webView2 = inspect(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$roots = @('HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients', 'HKLM:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients', 'HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients'); $roots | ForEach-Object { Get-ChildItem -LiteralPath $_ -ErrorAction SilentlyContinue } | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } | Where-Object { $_.name -match 'WebView2' -and $_.pv -and $_.pv -ne '0.0.0.0' } | ForEach-Object { $_.pv }",
    ],
    true,
  );
  return inventory;
}

export function desktopFailures(inventory) {
  const required = [
    'git',
    'node',
    'pnpm',
    'rust',
    'cargo',
    'wasmBindgen',
    'wasmTarget',
    'hostTarget',
  ];
  if (inventory.platform === 'win32') required.push('msvc', 'windowsSdk', 'webView2');
  return required.filter((name) => !inventory[name]?.available);
}

export function desktopFailureMessage(inventory) {
  const missing = desktopFailures(inventory);
  const actions = {
    git: 'Git for Windows를 설치하고 터미널을 다시 여세요.',
    node: 'Node LTS 22.12 이상을 설치하고 터미널을 다시 여세요.',
    pnpm: '저장소 packageManager 버전의 pnpm을 설치하세요.',
    rust: 'rustup으로 Rust stable을 설치·선택하세요.',
    cargo: 'rustup의 Cargo 설치와 PATH를 확인하세요.',
    wasmBindgen: 'cargo install wasm-bindgen-cli --version 0.2.129 --locked를 실행하세요.',
    wasmTarget: 'rustup target add wasm32-unknown-unknown을 실행하세요.',
    hostTarget: 'rustup의 Windows MSVC 호스트 도구 모음과 네이티브 대상을 확인하세요.',
    msvc: 'Visual Studio Installer에서 C++를 사용한 데스크톱 개발과 MSVC 빌드 도구를 설치·복구하세요.',
    windowsSdk: 'Visual Studio Installer에서 Windows 10/11 SDK를 설치·복구하세요.',
    webView2: 'Microsoft Edge WebView2 Runtime을 설치하세요.',
  };
  return [
    'HanCAD 데스크톱 시작 전 필수 도구 검사에 실패했습니다.',
    ...missing.map((name) => `- ${name}: ${actions[name]}`),
    '세부 검사: pnpm check:desktop',
  ].join('\n');
}

export function requiresDesktopPreflight(args) {
  const cliArgs = args.slice(0, args.indexOf('--') === -1 ? args.length : args.indexOf('--'));
  const command = cliArgs.find((arg) => !arg.startsWith('-'));
  return (
    ['dev', 'build'].includes(command) &&
    !cliArgs.some((arg) => ['--help', '-h', '--version', '-V'].includes(arg))
  );
}
