# Geometry WASM

Pure double-precision geometry functions compiled from Rust to WebAssembly.
`distance2d` returns the distance between two model points; `midpoint2d` returns
their midpoint as a `Float64Array`. Coordinates use the new HanCAD model's
Cartesian convention and the crate never performs UI or file I/O.

Allowed dependencies: geometry libraries independent of the desktop shell and
drawing UI. Phase 07 pins cavalier_contours 0.9.0 for exact line-and-arc polyline
offsets. `parallelOffsetWasm` accepts packed x/y/bulge triples and returns every
result loop. The caller splits bulges exceeding a semicircle and reconstructs
extended/chamfered joins from Cavalier's rounded joins. A raw numeric WebAssembly
ABI avoids requiring an MSVC host linker to compile procedural macros; the
JavaScript adapter retains the typed geometry API.

Run `pnpm build:wasm`. The build produces a browser module, TypeScript declarations, and a WASM
binary in `packages/geom/wasm/`. A Node verification executes the real binary and
checks distance, midpoint and an actual square offset. The browser shell
calls the same module, so a missing or unloadable binary is visible and fails
the smoke test. Native Rust unit tests and the Tauri executable still require
the MSVC C++ toolchain on Windows; the WASM build does not.
