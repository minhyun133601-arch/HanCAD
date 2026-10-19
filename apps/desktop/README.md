# Desktop shell

This package hosts the Windows-first Tauri 2 shell. It loads the same UI as
`apps/web`, keeps the main window size and position, and exposes local OS adapters
through local IPC adapters. On Windows, `platform_info` reports the drawing
Clipboard capability. COPYCLIP/CUTCLIP/COPYBASE publish exact drawing JSON,
PNG, CF_DIB, CF_BITMAP and Unicode text; paste reads the registered HanCAD drawing format.
File, font, printer and dialog adapters remain unavailable. The older generic
Platform text-clipboard methods are still explicit mocks/unavailable operations;
drawing commands use `drawing-clipboard-platform.ts` and the native bridge.

Allowed dependencies: the web build as static assets, Tauri, the official
window-state plugin, and serialization for native IPC. Geometry belongs in
`packages/geom` and `crates/geometry-wasm`, not the desktop process.

With the MSVC C++ build tools and Windows SDK installed, run `pnpm tauri dev`
from the repository root. The shared read-only prerequisite check runs first,
verifying installed tools, Rust targets and actual MSVC/SDK files and tools.
If anything is missing, it exits with Korean repair instructions before starting
Tauri, Vite or Cargo. Help/info commands remain available.
Once ready, it starts the web development server on port 1420 and
opens the native HanCAD window. `pnpm tauri build --no-bundle` builds a local
executable without creating an installer. Packaging
and installer configuration belong to Phase 25.

On the development PC, the user-authorized MSVC 14.51 and Windows SDK 26100
installation now passes `pnpm check:desktop`; locked offline Cargo checking and
all four Windows Clipboard validation unit tests pass. Native execution evidence
and remaining manual checks are recorded separately from browser mocks.
The [Phase 05 native acceptance procedure](../../docs/phase05-native-acceptance.md)
records the prerequisite gate, locked build commands, two-window Clipboard checks,
format inspection and shortcuts. Browser tests with mocked native IPC do not
establish that the Windows executable compiles or runs.
After a release build, run `node scripts/verify-native-clipboard.mjs` and
`node scripts/verify-native-wipeout.mjs` from the repository root for reproducible
native acceptance. Their `--help` output lists workspace/binary/port overrides.
The scripts reserve-check their local CDP ports before spawning an app and close
only their own test processes.

The runtime CSP allows local application assets, local IPC, and WebAssembly.
Remote script, image, and network origins are absent. Only local content in the
main window receives the native capability.
