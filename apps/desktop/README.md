# Desktop shell

This package hosts the Windows-first Tauri 2 shell. It loads the same UI as
`apps/web`, keeps the main window size and position, and exposes local OS adapters
through the UI's Platform interface. The bootstrap currently reports an empty OS
capability list; file, font, printer, dialog, and clipboard integrations are not
implemented yet.

Allowed dependencies: the web build as static assets, Tauri, the official
window-state plugin, and serialization for native IPC. Geometry belongs in
`packages/geom` and `crates/geometry-wasm`, not the desktop process.

With the MSVC C++ build tools and Windows SDK installed, run `pnpm tauri dev`
from the repository root. It starts the web development server on port 1420 and
opens the native HanCAD window. `pnpm tauri build --no-bundle` builds a local
executable without creating an installer. Packaging
and installer configuration belong to Phase 25.

On the initial development PC, native compilation is blocked by the missing
`link.exe` toolchain. The scaffold and CLI configuration have been checked;
native launch and persisted window state must be verified after those system
prerequisites are installed. `pnpm check:desktop` reports the prerequisite state.

The runtime CSP allows local application assets, local IPC, and WebAssembly.
Remote script, image, and network origins are absent. Only local content in the
main window receives the native capability.
