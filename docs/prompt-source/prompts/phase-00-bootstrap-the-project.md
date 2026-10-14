PHASE 0 — Bootstrap the project
This is the first session. Together with this prompt I pasted the master prompt, Reference A, and Reference B.

Goal: an empty but runnable HanCAD shell with the full toolchain, repository layout, docs, and test pipeline in place.

Do:
1. Save the master prompt verbatim as AGENTS.md, Reference A as docs/GLOSSARY.md, and Reference B as docs/SHORTCUTS.md. If you are Claude Code, also create CLAUDE.md telling you to read AGENTS.md; if you are Cursor, add a project rule that points to AGENTS.md.
2. Check this Windows PC for Git, Node LTS, pnpm, Rust stable with the wasm32-unknown-unknown target, wasm-bindgen/wasm-pack, MSVC Build Tools, and the WebView2 runtime. Install what is missing and tell me in Korean what you installed and why.
3. Create the monorepo from AGENTS.md section 5. Every package gets a README stating its responsibility and its allowed dependencies. Strict tsconfig, ESLint, Prettier, Vitest, Playwright. A Rust workspace with one crate compiled to WASM and called from TypeScript, with a test that proves the round trip.
4. Tauri 2 app: one main window titled HanCAD, minimum 1280x720, remembers its size and position. The same UI runs in a browser with pnpm dev:web, with OS features behind a Platform interface (files, dialogs, fonts, printers, clipboard) that is mocked in the browser.
5. Shell layout placeholders with Korean labels from docs/GLOSSARY.md: file tab bar (Drawing1.dwg), quick access toolbar, ribbon with the Korean tab names, a drawing canvas filling the center (background RGB 33,40,48), a floating command line at the bottom with the placeholder 명령 입력 and a history area above it, the 모형/배치1/배치2 tabs, and a status bar with placeholder toggles.
6. i18n: typed message catalogs (ko-KR default, en-US). No hardcoded UI strings anywhere.
7. Scripts: pnpm verify (lint, typecheck, unit tests, WASM build, E2E smoke), pnpm tauri dev, pnpm dev:web, pnpm build.
8. Docs skeletons per AGENTS.md section 6. Put this phase list in docs/PROGRESS.md: 0 Bootstrap; 1 Database, sysvars, undo; 2 Renderer and view navigation; 3 Command system, shortcuts, Korean IME; 4 Coordinate input and drafting aids; 5 Selection, grips, clipboard; 6 Draw commands; 7 Modify commands; 8 Layers and properties; 9 DXF/DWG I/O and recovery; 10 Text and fonts; 11 Dimensions and leaders; 12 Hatch, boundary, region; 13 Blocks, attributes, xrefs, images, underlays; 14 Layouts, viewports, plotting; 15 Inquiry, utilities, settings; 16 Advanced 2D; 17 Dynamic blocks; 18 Parametric constraints; 19 AutoLISP, scripts, DCL; 20 Customization and Express Tools; 21 3D foundation; 22 3D modeling; 23 Visualization and 3D documentation; 24 Performance and compatibility hardening; 25 Packaging and release.
9. git init, a .gitignore that ignores test-corpus/ (my private drawings), and the first commit.

Acceptance:
- [ ] pnpm tauri dev opens the Korean shell; pnpm dev:web shows the same in a browser.
- [ ] Typing any text in the command line and pressing Enter prints a Korean unknown-command message in AutoCAD style.
- [ ] pnpm verify passes, including the WASM round-trip test.
- [ ] AGENTS.md and all docs exist; docs/PROGRESS.md lists phases 0–25.
