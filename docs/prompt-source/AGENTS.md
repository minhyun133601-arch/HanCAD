# HanCAD — Project Constitution
(Save this whole text verbatim as AGENTS.md in the repository root. Re-read it at the start of every session.)

## 0. Mission
Build HanCAD (working title), a Windows-first desktop CAD application whose workflow and feel are indistinguishable from AutoCAD (current releases, 2024–2027, Korean edition) for an experienced Korean AutoCAD user. Indistinguishable means the same command names, aliases, option keywords, prompt sequences, defaults, system variables, keyboard shortcuts, mouse behavior, object snaps, tracking, selection rules, grip editing, undo behavior, and DWG/DXF compatibility. AutoCAD muscle memory must transfer with zero retraining.

Language rules:
- The app UI is Korean (ko-KR) by default, with an English (en-US) switch.
- I, the person giving you these prompts, am Korean. Always report to me in Korean.
- Code, identifiers, code comments, commit messages, and docs are in English, except Korean UI strings and docs/GLOSSARY.md.

## 1. Reference behavior
- Reference: AutoCAD for Windows with the metric template (acadiso.dwt) and Korean-edition prompts and UI terms. When unsure, follow Autodesk's official documentation (the Korean help pages for wording). Record every assumption in docs/DECISIONS.md and add it to docs/PARITY_CHECKLIST.md so I can verify it in real AutoCAD.
- Never invent behavior because it seems nicer. Improvements go behind an option that defaults to AutoCAD behavior. The Korean-input fixes in section 3 are the only exception and are on by default.
- Do not use Autodesk trademarks, logos, icons, or bundled Autodesk files (fonts, templates, .cuix, .lin, .pat, .ctb). Draw original icons in a similar flat style and write original resource files that use the standard names and patterns. At runtime I may point HanCAD at my own files (acad.pgp, SHX fonts, .lin, .pat, .ctb, .lsp).

## 2. Parity rules (the feel)
1. Command line first. Every feature is a command with a canonical English name. Ribbon, menus, toolbars, palettes, and shortcuts only run commands, as macros like ^C^C_LINE. Prefixes work like AutoCAD: _ global name, . built-in (ignores UNDEFINE), - command-line version without a dialog, ' transparent (its prompts start with >>). UNDEFINE and REDEFINE work.
2. Prompts follow AutoCAD exactly: order, options, keyword letters, defaults in <angle brackets>, and remembered values (OFFSETDIST, FILLETRAD, CIRCLERAD, CHAMFERA/CHAMFERB, TEXTSIZE, and so on). Korean prompt text follows Korean AutoCAD phrasing, for example:
   LINE: 첫 번째 점 지정: → 다음 점 지정 또는 [명령 취소(U)]: → 다음 점 지정 또는 [닫기(C)/명령 취소(U)]:
   CIRCLE: 원에 대한 중심점 지정 또는 [3점(3P)/2점(2P)/Ttr - 접선 접선 반지름(T)]: → 원의 반지름 지정 또는 [지름(D)] <10.0000>:
   Keywords are clickable in the command line, accepted as the English word or the letter in parentheses, and listed in the dynamic-input down-arrow menu.
3. Enter, Space, and (configurable) right-click end or repeat commands exactly as in AutoCAD. Esc cancels and prints *취소*; a second Esc clears the selection. Up/Down recall input history. A bare number at a point prompt is direct distance entry along the cursor direction.
4. Every AutoCAD system variable that affects behavior exists with the same name, type, range, metric default, and scope (saved in drawing, saved in profile, or not saved). SETVAR, GETVAR, and typing a variable name at the command line work. Code reads sysvars; never hardcode something AutoCAD controls with a sysvar.
5. The visual language matches: crosshair with pickbox, AutoSnap marker shapes and tooltips, dotted tracking paths, window selection (left to right, blue, solid) versus crossing (right to left, green, dashed), lasso, grips (blue, hover, red when hot), selection preview, command preview, ACI color 7 shown white on dark and black on light backgrounds, the dark model-space background (RGB 33,40,48, configurable to black), and the UCS icon.
6. Undo matches: one command is one undo group; U inside LINE or PLINE removes only the last segment; UNDO with Auto, Control, BEgin, End, Mark, Back, and a number; REDO, MREDO, and OOPS.
7. Files round-trip: a DWG or DXF opened and saved keeps everything, including entities and objects HanCAD does not support yet (kept as opaque proxies), XDATA, extension dictionaries, reactors, and handles.

## 3. Korean-user requirements (on by default)
- IME-safe command input. In AutoCAD, Korean users constantly hit the 한/영 mode problem. In HanCAD, whenever the active prompt expects a command name, keyword, number, coordinate, or osnap override, input comes from physical keys (KeyboardEvent.code mapped through US QWERTY). Keyboard focus stays on a non-editable element, so the IME stays inactive. Any Hangul that still arrives, as jamo or composed syllables, is converted back to the Dubeolsik keys that produced it (ㅣ→L, 채→CO, ㅣㅑㅜㄷ→LINE). When a prompt expects free text (layer or block names, TEXT and MTEXT content, attribute values, file names, FIND strings), switch to an editable input so Korean composition works, with the composition shown inline at the caret.
- Korean text everywhere: Korean TrueType fonts (맑은 고딕; 굴림, 돋움, 바탕 from .ttc collections; 나눔 fonts), SHX fonts with BigFonts (whgtxt.shx, whgdtxt.shx, and others) loaded from user support paths, and a missing-font substitution dialog like AutoCAD's.
- Encodings: DXF up to R2004 stores text in $DWGCODEPAGE (ANSI_949 = CP949); R2007 and later use UTF-8. Decode \U+XXXX and MIF \M+nXXXX (n=3 Wansung/CP949, n=4 Johab). Read .lsp, .scr, .pgp, .lin, .pat, .dcl, and .csv as UTF-8 (with or without BOM) or CP949, detected automatically. Write UTF-8 unless I choose otherwise.
- Defaults: metric (MEASUREMENT=1, INSUNITS=4 for millimeters), ISO-25 dimension style, A-series paper (A0 to A4), scale lists covering 1:1 to 1:1200, and Korean date formats in fields and plot stamps.
- UI terms match Korean AutoCAD; see docs/GLOSSARY.md. Command names stay English.

## 4. Technology stack
Verify the latest stable versions before installing, pin them, and record the choices in docs/DECISIONS.md.
- Desktop shell: Tauri 2. Rust handles OS integration only: files, dialogs, font enumeration, printers, clipboard formats, external converters, autosave and crash recovery, and Windows IME helpers if needed.
- App: TypeScript in strict mode, Vite, pnpm workspaces. React is used only for UI chrome (ribbon, palettes, dialogs). The drawing canvas never renders through React.
- Renderer: a custom WebGL2 renderer, with an optional WebGPU backend later. Use instanced screen-space wide lines for lineweights, shader-computed linetype dashes from per-vertex cumulative distance, and analytic or adaptively tessellated arcs. Render relative to eye with a floating origin, so coordinates in the hundreds of millions of millimeters (Korean TM survey coordinates) do not jitter.
- Geometry: double precision in TypeScript. Hot paths are Rust compiled to WASM: cavalier_contours for offsets and booleans of line-and-arc polylines (its bulge is limited to half circles, so split larger arcs; its offsets only produce rounded joins, so build the extended corners of OFFSETGAPTYPE 0 and the chamfered corners of 2 on top of it), boundary and hatch region detection, and large-file parsing if profiling shows a need.
- Spatial index: a dynamic R-tree.
- 2D constraint solver (Phase 18): @salusoft89/planegcs (FreeCAD's PlaneGCS as WASM) or an equivalent.
- 3D kernel (Phase 22): OpenCASCADE (OCCT) behind a Kernel3D interface. Choose between a maintained WASM build and a native OCCT bridge from Rust at that phase.
- DWG: first choice is the free ODA File Converter, if installed, called through its command-line interface for DWG<->DXF in any version. Fallback is LibreDWG compiled to WASM (@mlightcad/libredwg-web, GPL-3.0) for reading, isolated in its own package and Web Worker. This is a personal build; keep GPL code separate.
- PDF: our own vector PDF writer with CJK font subsetting; pdf.js for PDF underlays and PDFIMPORT.
- Tests: Vitest for unit tests, headless command-script tests, renderer golden images, a DXF round-trip corpus, and Playwright end-to-end tests against the browser build.
- The app runs in two modes: the Tauri desktop app, and a plain browser dev mode with OS features mocked behind a Platform interface (for E2E tests and fast iteration).

## 5. Architecture rules
- Monorepo layout (rename if needed, keep the boundaries): apps/desktop (Tauri), packages/db (drawing database), packages/geom, packages/sysvars, packages/render, packages/input (command line, keys, mouse, IME), packages/editor (Editor API, jigs, selection, osnap, tracking), packages/commands (one folder per command), packages/ui, packages/io-dxf, packages/io-dwg, packages/io-pdf, packages/fonts, packages/lisp, packages/kernel3d, crates/* (Rust compiled to WASM), docs/.
- The drawing database mirrors AutoCAD's. A Database owns symbol tables (BLOCK_RECORD, LAYER, LTYPE, STYLE, DIMSTYLE, UCS, VIEW, VPORT, APPID) and a named object dictionary (GROUP, LAYOUT, MLINESTYLE, MLEADERSTYLE, TABLESTYLE, SCALE, PLOTSETTINGS, XRECORD, and so on). Every object has a persistent hex handle, an owner, reactors, an extension dictionary, and XDATA. Entity fields map one-to-one to DXF group codes, so entget/entmod/entmake, DXF I/O, and the Properties palette share one schema.
- Commands are async coroutines against an Editor API that mirrors AutoCAD's: getPoint, getCorner, getDistance, getAngle, getOrientation, getInteger, getReal, getString, getKeyword, getSelection, getEntity, getNestedEntity. They take InitGet-style flags (no null, no zero, no negative, arbitrary input, keyword list) and use jigs for rubber-band previews. Every command also runs headless from an input queue (scripts, LISP (command ...), tests) with identical results.
- One transaction per command. The undo journal stores before and after states. Events (added, modified, erased) drive the renderer, associativity, and later LISP reactors.
- Performance budgets: 60 fps pan and zoom with 1,000,000 simple entities; under 16 ms for a typical edit; under 10 s to open a 50 MB DXF; under 4 ms of osnap and hover work per mouse move.
- Keep files under about 400 lines. No any. Geometry functions are pure. No silent stubs: an unimplemented command prints a Korean message in the style of AutoCAD's unknown-command message and is tracked in docs/COMMANDS.md.

## 6. Repository docs you maintain
AGENTS.md (this file), docs/ARCHITECTURE.md, docs/PROGRESS.md (phase status, current milestone, exact next step), docs/COMMANDS.md (command, aliases, options implemented, status, tests), docs/SYSVARS.md, docs/SHORTCUTS.md (Reference B), docs/GLOSSARY.md (Reference A), docs/DECISIONS.md, docs/PARITY_CHECKLIST.md (items for me to verify in real AutoCAD).

## 7. Standard Phase Protocol (applies to every phase prompt)
1. Read AGENTS.md, docs/PROGRESS.md, docs/ARCHITECTURE.md, and the docs the phase touches. Run all tests first; if anything fails, fix it before new work.
2. Write a plan in docs/PROGRESS.md as milestones (N.1, N.2, ...), each small enough for one session and each leaving the app runnable.
3. For each milestone: implement, add tests, run lint, typecheck, and all tests, launch the app and exercise the feature, update the docs, then commit (feat(phaseN.M): ...).
4. If your context is running low, stop at a clean commit and write the exact next step in docs/PROGRESS.md.
5. A phase is done when every Acceptance item passes, nothing regressed, and the docs are current. Then report to me in Korean: what was built, how to test it by hand (keystroke by keystroke), what still differs from AutoCAD, and what comes next.
6. Ask me (in Korean) only about decisions that are mine to make. Otherwise choose the AutoCAD-faithful option and log it in docs/DECISIONS.md.
