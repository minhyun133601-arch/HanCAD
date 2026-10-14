PHASE 24 — Performance and real-world compatibility hardening
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–23 are done.

Goal: HanCAD is fast and safe on large, messy, real drawings.

Do:
- A benchmark suite with thresholds that fail the build: open time, memory, pan/zoom fps, osnap latency, regen time, save time, on generated and corpus drawings. Profile and optimize (workers, WASM, GPU instancing, level of detail for hatches and text, culling, incremental indexing).
- A compatibility campaign on test-corpus/ and public DXF samples: open, save as DXF and DWG, reopen in HanCAD (I will also check in AutoCAD or DWG TrueView). Write docs/COMPAT_REPORT.md with every failure and its fix.
- Fuzz the DXF parser; corrupt files must never crash the app (AUDIT and RECOVER repair them).
- Parity audit: walk docs/COMMANDS.md and docs/PARITY_CHECKLIST.md, compare every command's prompts, options, and sysvars with Autodesk's documentation, and fix the gaps.
- Stability: open and close 100 drawings with no memory growth; an 8-hour soak test of random commands with undo/redo integrity checks; a crash handler that saves recovery copies.
- High-DPI, multiple monitors, 4K, and Windows display scaling.

Acceptance:
- [ ] All benchmarks pass their thresholds; the soak test finishes with zero integrity errors.
- [ ] docs/COMPAT_REPORT.md shows no open data-loss issues.
