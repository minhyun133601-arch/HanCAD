# HanCAD progress

## Active phase: Phase 03 command system, command line, shortcuts and Korean IME (2026-10-16)

Source: `docs/prompt-source/prompts/phase-03-command-system-command-line-shortcuts-korean-ime.md`.
The user requested Phase 03 on 2026-10-16. The baseline passed lint, formatting,
strict TypeScript, 402 unit and 30 compatibility tests before work started.
Reference facts come from the Autodesk 2026 Korean help pages for temporary
override keys, shortcut keys, macro control characters, DIESEL, the status bar,
shortcut menus, command aliases/AutoCorrect and the command window.

| Milestone                                 | Status  | Scope                                                                                                                                  |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Command catalog and aliases           | Done    | Canonical/global names, Korean/English names and help, flags, implementation status, completed acad.pgp aliases, generated COMMANDS.md |
| 3.2 Input parsing and ImeController       | Planned | Prompt input modes, Hangul normalization, Space/Enter rules, PGP grammar incl. external commands, transparent-command rules            |
| 3.3 Command line window                   | Planned | Floating/docked bar, temporary prompt lines, F2/Ctrl+F2/Ctrl+9, command-name prompt, history recall, right-click menu                  |
| 3.4 AutoComplete and input search options | Planned | Suggestion list, auto-append, mid-string, sysvars, frequency order, delay, AutoCorrect DB, INPUTSEARCHOPTIONS dialog                   |
| 3.5 Transparent commands                  | Planned | `>>` prompts for 'ZOOM/'PAN/'SETVAR/sysvars/'DIST/'CAL/'OSNAP/'HELP, resume message and original prompt                                |
| 3.6 PGP import, ALIASEDIT and REINIT      | Planned | User acad.pgp import/merge (user wins), persistent profile copy, ALIASEDIT dialog, REINIT/RE-INIT reload                               |
| 3.7 Macros and DIESEL                     | Planned | ^C^C, ;, space, \ pause, \*^C^C repeat, $M=, ^P and other controls; DIESEL evaluator; MODEMACRO; ribbon macros                         |
| 3.8 Keyboard bindings and overrides       | Planned | Every SHORTCUTS.md binding with ordered scopes, toggle messages, TEMPOVERRIDES key-down/key-up macros                                  |
| 3.9 Mouse and shortcut menus              | Planned | SHORTCUTMENU bits, time-sensitive right click, Korean default/edit/command menus, Shift+right-click object snap menu                   |
| 3.10 Status bar and F1 help               | Planned | All toggles with icons/menus, COORDS display, customization menu, F1 Korean help panel, phase acceptance                               |

Exact next step: implement milestone 3.2 (input parsing and ImeController).

## Completed phase: Phase 02 rendering engine and view navigation (2026-10-16)

Source: `docs/prompt-source/prompts/phase-02-rendering-engine-and-view-navigation.md`.
The user requested the entire phase, paused it briefly, then requested completion
on 2026-10-16. Phase 00 native verification remains deferred by user instruction.

| Milestone                          | Status | Delivered scope                                                                                                                               |
| ---------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 Display style foundations      | Done   | ACI/true color, inheritance, transparency, original metric linetypes and weights                                                              |
| 2.2 Tessellation and spatial index | Done   | Adaptive display curves, bulges/widths, POINT, clipped infinite geometry, native/legacy sources, dynamic R-tree and refined picks             |
| 2.3 WebGL2 renderer core           | Done   | High-DPI floating-origin chunks, shader dashes/wide strokes, fills, glyph atlases, ordered transparency, texture-only selection/color updates |
| 2.4 View navigation commands       | Done   | All ZOOM options, PAN/-PAN, Previous, transitions, regeneration/redraw and navigation undo                                                    |
| 2.5 Cursor and drafting aids       | Done   | Crosshair/pickbox, UCS icon, GPU grid, background options and status toggles                                                                  |
| 2.6 Stress, precision and goldens  | Done   | DEVSTRESS, measured 60 Hz performance, translated geometry equality, 28 GPU reference scenes and exact-color contracts                        |

### Final verification (2026-10-16)

The original baseline was repaired before implementation: an obsolete progress
assertion and a race in fast DWG cancellation. Commit `f732c97` records those fixes.
The fresh baseline passed WASM, lint, formatting, strict TypeScript, 326 unit,
30 compatibility and 57 production Edge E2E tests (one opt-in private drawing skip).

The complete `HANCAD_PRODUCTION=1 HANCAD_RUNNING_APP=1 pnpm verify` passes WASM,
lint, formatting, strict TypeScript, 402 unit tests, 30 compatibility tests, the
production build and 61 Edge E2E tests (one opt-in private drawing skip). GPU QA
passes 28 independently specified reference scenes, translated legacy/native
framebuffer equality, 37 exact pixel-color contracts, three retained viewport
boundary contracts and 20 high-zoom precision comparisons. These are
HanCAD/analytic references, not certified AutoCAD screenshots.

Browser review opened the original four-linetype DXF, changed LTSCALE and
LWDISPLAY, exercised ZOOM Previous and PAN, checked Korean/English OPTIONS, and
ran DEVSTRESS 1000000 followed by 0 without changing the four drawing entities.
Screenshots are ignored under `test-artifacts/render-golden/` and
`test-artifacts/render-stress/`.

The exclusive stress run used the actual Intel Core i3-12100, Intel UHD Graphics
730 via ANGLE D3D11, 31.76 GiB RAM and 1920x1080. With 1,000,000 random lines,
arcs and polylines, 300 frames each measured 59.999 fps pan and 59.404 fps zoom;
95th-percentile frame intervals were 16.8 ms for both. Zoom crossed an LOD boundary
and rebuilt 88 visible chunks within the frame budget. Submission p95 was 1.5 ms
pan / 7.3 ms zoom, startup 223.5 ms, and 1,051,824 visible ink pixels. One percent
of zoom frames missed a refresh; this is measured 60 Hz-class performance, not a
promise that every frame on every drawing is below 16.67 ms. Evidence is ignored
under `test-artifacts/render-stress/`; repeat with `pnpm test:render:stress` while
other GPU tests are stopped.

Final repeated measurements exposed allocation/upload spikes below the cadence
gate before optimization. Packed stress geometry now writes directly into a
growable Float32Array, and thin-only chunks defer their unused wide representation
until lineweight, transparency smoothing or high-DPI display requires it. Shader
uniform locations are cached. Three LODs retain byte-identical generated geometry,
and lifecycle tests cover DPR 1-to-2 promotion and buffer disposal. The final
post-optimization run above passes the unchanged 59 fps / p95 18.5 ms gates.

All five original acceptance items pass:

- [x] Million-entity pan/zoom meets the measured 60 Hz-class budget on this PC.
- [x] Survey-coordinate geometry tracks 1/8-pixel pans at scales 65536 and 262144:
      straight binary-coordinate geometry has identical translated frame hashes;
      small arcs/widths retain the same one-pixel shape neighborhood.
- [x] Cursor-anchored wheel zoom, middle pan and double-middle Extents pass E2E.
- [x] DASHED/CENTER/HIDDEN/PHANTOM, LTSCALE and LWDISPLAY pass GPU and browser checks.
- [x] Twenty-eight independent reference scenes pass, exceeding the required 20.

Exact next step: start original Phase 03 (commands, command line, shortcuts and
Korean IME) by reading
`docs/prompt-source/prompts/phase-03-command-system-command-line-shortcuts-korean-ime.md`,
running the baseline and writing milestones 3.x. Keep Phase 00 native acceptance
deferred; do not change its status without actual native verification.

### Manual Phase 02 checks

1. Launch `HanCAD 실행.cmd`. Draw `LINE`, Enter, `0,0`, Enter, `100,100`, Enter,
   Enter. Type `Z`, Enter, `E`, Enter. Roll the wheel away from the center: the
   cursor's model point stays fixed. Middle-drag pans; double-middle fits extents.
2. Type `Z`, Enter, `2X`, Enter, then `Z`, Enter, `P`, Enter. Repeat Previous to
   consume earlier views. Use `U`, Enter and `REDO`, Enter to replay navigation.
3. Type `Z`, Enter, `W`, Enter, `0,0`, Enter, `50,50`, Enter. Try `Z`/`A`,
   `Z`/`C`/`50,50`/`100`, `Z`/`O`/`ALL`/Enter, and `Z`/Enter plus a left drag.
4. Type `Z`, Enter, `D`, Enter: move the overview box, click to resize, then Enter
   to apply. Esc restores the original view. `PAN` plus left drag pans until Esc;
   `-PAN`, `0,0`, `20,10` performs a precise displacement.
5. Press F7 to toggle the grid. Set `CURSORSIZE` to `100`, `PICKBOX` to `10`, and
   try `UCSICON`/`OFF`, then `UCSICON`/`ON`. The crosshair disappears outside the
   drawing. `OPTIONS` opens the supported background-color controls.
6. OPEN `packages/render/qa/linetype-reference.dxf`. Its four original reference
   lines use DASHED/CENTER/HIDDEN/PHANTOM and 1.00 mm lineweights. Change `LTSCALE`
   from `1` to `2`, then toggle the lineweight status button. `REGEN` rebuilds
   display geometry; `REDRAW` refreshes the viewport. New-object CELTYPE requires
   an existing native LTYPE record; interactive linetype loading belongs to Phase 08.
7. Open `http://127.0.0.1:1420/?devtools=1`, type `DEVSTRESS`, Enter, `1000000`,
   Enter, and pan/zoom. `DEVSTRESS`, Enter, `0`, Enter restores the drawing. Test
   data is renderer-only and is excluded from saved files and undo.

### Deliberate later-phase boundaries

The nXP scale calculation accepts paper viewport height through the pure host API;
the model-only UI explicitly reports that a floating layout viewport is required
(Phase 14). REGENALL/REDRAWALL currently have one active viewport. UCSICON
Properties/Selectable/All, 3D UCS, full OPTIONS tabs, complex linetype text/shapes,
SHX/BigFont and complete native text/block/dimension expansion retain their later
phase owners. Numerical arbitrary spline picks are not proofs of global minima;
extreme generic-curve subdivision caps and fallback text bounds remain documented
reference limitations. Imported DWG/DXF editing remains lossy.

## Completed phase: Phase 01 database foundations (2026-10-15)

Phase 01 is complete. All four original acceptance checks pass and every build
item is implemented or tied to the later phase that owns its producer. Items that
need the user's installed AutoCAD are on `PARITY_CHECKLIST.md`. Phase 00 native
acceptance remains deferred by user instruction (MSVC/Windows SDK unavailable).

Final `HANCAD_PRODUCTION=1 HANCAD_RUNNING_APP=1 pnpm verify` passes real WASM round
trip, ESLint, formatting, strict TypeScript, 315 unit tests, 30 compatibility tests,
a production build and 57 Edge E2E tests (1.2 minutes), with the single opt-in
private-file case skipped. SYSVARS docs are current (860 variables / 214 headers).

| Milestone                            | Status | Acceptance                                                                                                                  |
| ------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1.2 Entity schemas and metric graph  | Done   | Published DXF inventory/code facts, 16 editable codecs, ordered opaque groups, common properties and linked metric defaults |
| 1.3 Basic geometry behavior          | Done   | Analytic/OCS curves, widths/bulges, NURBS and cubic fit geometry with explicit numerical quality and constrained-fit limits |
| 1.4 Declarative variable coverage    | Done   | 860 sourced variables, 214 DXF header definitions, generated docs, validated enums/bitmasks and live runtime values         |
| 1.5 Undo and document integration    | Done   | Advanced UNDO/UNDOCTL/OOPS, independent tabs/journals, shared profile, native HCD save/open and ordered recovery            |
| 1.6 Complete original Phase 01 build | Done   | Runtime providers, CLAYOUT `name*handle`, 28 audited ranges, zoom/pan navigation undo, UNDO Auto macro grouping             |

Milestone 1.6 delivered:

- Pure clock module: DATE/CDATE, TDCREATE/TDUCREATE/TDUPDATE/TDUUPDATE stamped on
  NEW and HANSAVE outside the journal, TDINDWG/TDUSRTIMER accumulate session time.
- Lazy per-name host provider: VIEWCTR, VIEWSIZE, SCREENSIZE, EXTMIN/EXTMAX,
  LOCALE, CLAYOUT and closed-palette states; UCSNAME `""` for World.
- CLAYOUT follows Autodesk's `name*handle` contract and drives the layout tabs.
- Wheel zoom, middle pan, double-middle and ZOOM E are `navigation` undo steps;
  Combine merges them, U/REDO/MREDO restore the exact view.
- `HeadlessCommandRunner.runMacro` groups a macro into one undo step while Auto is on.
- 185 type-only numeric variables audited: 28 now enforce documented ranges;
  SELECTIONEFFECTCOLOR accepts 0-255 (documented initial 0 plus ACI 1-255).

Deliberately owned elsewhere: layer-category undo producer (Phase 08 Layer
Properties Manager), menu-macro syntax (Phase 03), OS identity/path/codepage
variables (native Platform provider, blocked with Phase 00 native work), ZOOM
options other than Extents (Phase 02). Reference-only comparisons: acadiso numeric
style fields/scale-list order and the fit-only periodic spline tangent case.

Exact next step: start Phase 02 (rendering engine and view navigation) by reading
`docs/prompt-source/prompts/phase-02-rendering-engine-and-view-navigation.md`,
running the full suite and writing milestones 2.x here. Keep the zoom/pan journal
entries working when the renderer changes (see `apps/web/src/view-history.ts`).

Manual checks for Phase 01:

1. Launch `HanCAD 실행.cmd`. Type `OSMODE`, Enter: the default is 4133. Type
   99999, Enter: the Korean validation error appears. Press Esc.
2. Type `SETVAR`, Enter, `LUPREC`, Enter, `2`, Enter. Type `DIST`, Enter, `0,0`,
   Enter, `12.34596,0`, Enter: distance displays 12.35.
3. Type `LINE`, Enter, `0,0`, Enter, `100,0`, Enter, Enter. Type `NEW`, Enter.
   The new tab is empty and LUPREC is 4. Click Drawing1.dwg; its line/precision
   remain. Type U, Enter, then REDO, Enter without another command between them.
4. Type `UNDO`, Enter, `BE`, Enter. Draw two lines. Type `UNDO`, Enter, `E`,
   Enter, then U, Enter: both lines disappear. REDO, Enter restores the group.
5. Select a line, ERASE, Enter; draw another line; OOPS, Enter restores it.
6. Roll the wheel several times and pan with the middle button. Type `U`, Enter:
   the whole zoom/pan sequence returns to the previous view in one step. Type
   `UNDO`, `C`, `C`, `OFF`: each wheel step is now undone separately.
7. `GETVAR` `CDATE`, `DATE`, `TDCREATE`, `TDINDWG`, `VIEWSIZE`, `SCREENSIZE`,
   `EXTMIN`. Click the 배치1 tab, then `GETVAR` `CLAYOUT` shows `Layout1*<handle>`;
   type `CLAYOUT`, Enter, `Model`, Enter: the 모형 tab is selected.
8. `CBARTRANSPARENCY`, Enter, `95`, Enter is rejected (10-90).
9. Choose File > HCD save, OPEN the .hcd: objects, LUPREC, TDCREATE are kept.

## Delivered Phase 00 diagnostic continuation (2026-10-15)

The user explicitly reaffirmed completing one original phase at a time. Preserve
all delivered features, but finish the earliest incomplete phase before starting
new work in the next one. Historical milestones below are verified subsets, not
permission to skip original phase requirements.

Historical phase: **00 Bootstrap**. Deferred milestone: **0.8 native acceptance**.
The fresh baseline passed 223 unit, 29 compatibility and 43 production Edge
tests, with one opt-in private-file skip.

| Milestone                             | Status                      | Acceptance                                                                                                                                                   |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.6 Ordered bootstrap readiness       | Done                        | Original order and 26-phase docs; complete desktop preflight, early launch failure, bilingual progress and typed variable errors                             |
| 0.7 Remaining diagnostic localization | Done                        | Structured importer errors/progress/warnings, recovery and live locale changes, renderer failure presentation/cleanup, command/input/export diagnostic audit |
| 0.8 Original Phase 00 acceptance      | Pending native prerequisite | Browser and complete verification pass; actual native Korean shell, minimum size and saved position/size remain unverified                                   |

The completed session plan for 0.7 added stable importer diagnostic identities
and typed catalogs, retained legacy fallback strings/callbacks, formatted live
progress and recovered warnings in the current language, and preserved external
diagnostic text. Failed renderer initialization now releases its resources and
retains the shell/command line with a localized alert. The text audit also fixed
reachable command/input and export errors, including a language change before an
asynchronous image failure. Visual QA corrected overlapping English ribbon labels
at 1280x720 without changing the commands or tooltips.

Final `HANCAD_PRODUCTION=1 HANCAD_RUNNING_APP=1 pnpm verify` passes real WASM
round trip, ESLint, formatting, strict TypeScript, 235 unit tests, 30 compatibility
tests, a refreshed production build and 50 Edge E2E tests in 48.8 seconds.
The one opt-in private-file case is skipped; no private drawing benchmark was
repeated. Seven new E2E cases exercise real diagnostic failure/cancellation paths
and verify drawing/view/journal preservation. Existing drafting, editing,
dimension, text, recovery and export regressions pass.

Actual browser checks at 1280x720 verify Korean shell, physical command entry,
unknown command, 26-row HANPROGRESS and English/Korean switching. Diagnostic
screenshots cover visible localized warnings and main/preview context failures;
English ribbon geometry has zero button overlaps. Evidence stays ignored under
`test-artifacts/bootstrap-diagnostics/`. Old command-history entries and arbitrary
external diagnostics intentionally keep their original text.

The refreshed `pnpm check:desktop` inventory reports only MSVC and Windows SDK
missing. Their earlier installation was rejected by automatic approval review
with `blocked by policy`; no alternate installation route is attempted. No
external dependency or system tool was installed. The UI diagnostic guard's
existing workspace dependency is declared and its lockfile updated offline.
Actual native startup, 1280x720 minimum and window restoration remain unverified;
browser success cannot complete these acceptance items.

Deferred native check, superseded as the active next step by the explicit Phase 01
request above: once a complete MSVC C++
toolchain and Windows SDK are available, run `pnpm check:desktop`, launch
`pnpm tauri dev`, confirm the Korean shell and unknown-command path, try resizing
below 1280x720, then move/resize/close/relaunch to verify saved position and size.
Inspect native startup/runtime diagnostics in both languages and rerun complete
verification after any correction. Mark Phase 00 complete only when those actual
native checks pass. Phase 01 implementation is now authorized by the newer user
instruction; no new Phase 7.3 work is authorized by this historical handoff.

Manual checks for this increment:

1. Run `pnpm dev:web`, open `http://127.0.0.1:1420`, type `NOTACAD`, Enter,
   and check the Korean unknown-command message. Type `HANPROGRESS`, Enter,
   check 26 phases, and press Esc.
2. Open a local DXF with an unspecified unit, expand the report's warning section,
   choose English, and check the translated warning. Reload, expand warnings,
   and choose English again to verify recovery retains diagnostic identities.
3. In English, attempt to open a malformed DXF and confirm its error uses English
   while the previous drawing and zoom remain unchanged. Switch to Korean and
   repeat to check the Korean error.
4. Run `pnpm test:e2e apps/web/tests/diagnostic-i18n.spec.ts` for injected binary
   DXF, paused DWG cancellation, PNG failure and renderer-context failures. The
   renderer tests confirm command input remains usable and resources are released.
5. Run `pnpm check:desktop`; native acceptance remains pending until its missing
   prerequisites are resolved and the actual window is exercised.

## Delivered continuation: essential editing and Korean text (2026-10-15)

The user requested continuation according to the saved prompts. Resume from the
previous exact next step using Phase 07 and Phase 10; their full acceptance remains
separate from this practical subset. Baseline passes 183 unit, 23 compatibility and
34 production Edge tests, with the opt-in private-file test skipped.

| Milestone                            | Status | Acceptance                                                                                       |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| 7.1 Trim and extend                  | Done   | Quick/Standard line editing, finite boundaries, Shift, local Undo, fence and one-command journal |
| 7.2 Basic offset                     | Done   | Line/circle/arc and safe straight-polylines, distance/Through/repetition, preview and undo       |
| 10.1 Korean single-line text         | Done   | Point-height-angle, inline Korean input, repeated lines, atomic height/geometry, reload/DXF      |
| 24.3 Integrated editing verification | Done   | Full production checks, pointer/keyboard workflows, visual/golden QA and current handoff         |

Final `HANCAD_PRODUCTION=1 HANCAD_RUNNING_APP=1 pnpm verify` passes WASM, ESLint,
formatting, strict TypeScript, 220 unit tests, 23 compatibility tests, the refreshed
production build and 41 Edge E2E tests (50.1 seconds). The opt-in private-file
benchmark is skipped and was not repeated. Twenty renderer golden scenes pass.

Actual browser visual QA shows two exact offset rectangles, a trimmed LINE,
readable Korean TEXT and a 140-unit dimension. Artifacts are ignored under
`test-artifacts/essential-editing/`, general E2E and renderer golden directories.
Synthetic composition and actual DXF save/reopen are verified; native Windows IME,
Hanja and installed-reference font parity remain pending.

Full regression exposed a stale TEXTSIZE overlay after Undo/Redo/reload. Complete
cache publication now refreshes that overlay; normal/empty TEXT, standalone height
and foreign-document isolation tests pass. The tiny DWG cancellation fixture raced
decoding completion; its test now pauses real reader input until cancellation,
while separate tests verify actual DWG decoding and worker disposal.

The next step recorded at delivery was Phase 7.3 ROTATE/SCALE, then MIRROR/FILLET.
That feature-priority handoff is superseded by the active original-order section
above. Non-LINE trim targets, additional OFFSET joins/curved polylines and complete
TEXT styles/justification/MTEXT remain explicit original-phase work.

## Delivered follow-up: reliable basic drafting (2026-10-15)

Baseline before changes: 157 unit, 23 compatibility and 23 Edge browser tests
passed (one opt-in private-file test skipped).

| Milestone                                   | Status | Acceptance                                                                               |
| ------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| 4.2 Exact drafting snaps                    | Done   | Ortho/grid-safe endpoints, accepted in-command segments, true intersections and feedback |
| 5.2 Practical selection and editing         | Done   | Directional selection, selected-object drag, MOVE/COPY, cancellation and command undo    |
| 2.3 Reliable mouse navigation               | Done   | Cursor-anchored wheel, live sysvars, captured middle pan and double-middle extents       |
| 11.4 Dimension input reliability            | Done   | Exact point/entity input, numeric distance and empty-pick regressions                    |
| 24.2 Integrated basic-workflow verification | Done   | Full production checks, actual pointer workflows, visual QA and updated manual steps     |

`HANCAD_PRODUCTION=1 HANCAD_RUNNING_APP=1 pnpm verify` passes WASM, ESLint,
formatting, strict TypeScript, 183 unit tests, 23 compatibility tests, the production
build and 34 Edge E2E tests (41.9 seconds). The one opt-in private-file benchmark
is skipped and was not repeated in this increment. The running server was verified
as the local production server serving this workspace's refreshed build.

Actual browser visual QA confirms readable 120/80 dimensions and arrowheads on a
sample rectangle/circle drawing. A held object drag followed by Escape preserves
one selected object, removes the preview and leaves the saved drawing unchanged;
the second Escape clears selection. Evidence is ignored under
`test-artifacts/basic-workflow/` and the general E2E output directory. Continuous
LINE endpoint recognition also passes before Enter commits the command.

Next: implement basic TRIM/OFFSET and general TEXT creation as small runnable
increments, then extend grips/lasso, dimension associativity and full styles.
The full phase acceptance/performance/AutoCAD reference checks remain pending.

## Delivered follow-up: launcher, performance and dimensions

The user's next request adds dimension creation/display following the supplied
prompts and asks to fix unreliable automatic browser opening and slow navigation.
The previously delivered slice remains the baseline; Phase 11 is partial scope.

| Milestone                                        | Status | Acceptance                                                                                       |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| 25.2 Reliable automatic browser opening          | Done   | Main CMD directly opens the browser after server health; user confirmed the new window appears   |
| 2.2 Retained/cached rendering for large files    | Done   | Ordered retained paths, bounded display detail and separate previews; actual-file paint verified |
| 11.1 Dimension geometry and interactive sessions | Done   | Linear/aligned/radius/diameter/angular definitions, preview, options, display-only DIMSCALE      |
| 11.2 Dimension UI and basic style settings       | Done   | Shared command aliases, mouse/coordinates/entity picks, undo/reload and DXF/PDF output           |
| 11.3 Final integration verification              | Done   | Full checks, actual large-file dimension/undo/reload and readable dimension exports passed       |

The previous dimension delivery passed 157 unit tests, 23 compatibility tests and 23
production Edge browser tests; the opt-in private-file test is skipped in this
general run and is covered separately by the actual-file benchmark. Twenty small
renderer golden scenes also pass. Independent PDFium/PNG/JPG/Edge-SVG inspection
shows readable dimension values, arrows and Korean text. This is the initial
dimension subset; full Phase 11 acceptance remains incomplete.

Final 1600x1000 Edge benchmark on the supplied 27,368,192-byte R2000 DWG passed:

- 286,996 objects preserved, all made visible only through explicit LAYON.
- Import wall time 11.889 s; six zoom/pan samples reached paint/readback in
  33.0-402.4 ms. CPU submission was 2.4-160.2 ms. The earlier ~1.5 s synchronous
  callbacks and the failed multi-second backing-copy run are separate measurements;
  the complete 60 fps/million-entity and 16 ms edit budgets remain unmet.
- Loaded JavaScript heap was 1.159 GB versus 2.136 GB in the first failed run;
  navigation was 1.164 GB and reload 1.459 GB. These are checkpoint values,
  not a measured peak or an eight-hour memory-stability certification.
- DLI `0,0` → `1000,0` → `500,250` created object 286,997 with measurement 1000;
  U returned to 286,996 with original style/settings and successful chunked caches.
  Placement input took 1.073 s; undo input 0.887 s, excluding asynchronous cache writes.
- Reload restored all 286,996 visible objects in 2.222 s. Four cache checkpoints
  were `indexed`; no page errors or external drawing requests occurred.
- Evidence stays in ignored `test-artifacts/render-benchmark/`. The benchmark
  writes each step immediately and bounds waits after an earlier diagnostic helper
  failed to terminate; a hung validation helper is not app performance evidence.

The old
launcher only checked server health while a detached child attempted the browser
open; that did not prove a window appeared. Browser launch now belongs directly
to the interactive CMD. Automatic approval review rejected a direct native Edge
launch test with "blocked by policy"; the user then executed the modified launcher
and confirmed the new window opened. Local HTTP health also passed.

## Previously delivered scope and priority

The user ends this increment at usable DWG opening, basic drawing and internal
folder cleanup, with future work documented beside the original prompts. Advanced
2D tools and 3D are deferred. Overlapping behavior follows the supplied master
prompt; all work remains in this independent project and drawing data stays local.

`HanCAD 실행.cmd` is the only root launcher. It rebuilds the browser app, opens
`http://127.0.0.1:1420/` in Edge and keeps the local server in the background.
Startup errors remain visible. File actions are in the top File menu/open icon;
the permanent file-action row is removed.

Original ZIP/prompts/references, `PRIORITIES.md` and `NEXT_STEPS.md` are together in
`docs/prompt-source/`. The original master prompt remains at the root. Retired
standalone UI, HTML, shortcuts, duplicate build scripts and the development CMD
are under `archive/retired-standalone/`. A complete original backup is retained in
`archive/pre-hancad-20261014.zip`. Required geometry/I/O source now lives in
`packages/legacy-bridge/runtime/`; vendor source and licenses remain intact.
See `FOLDERS.md` for the project layout.

## Verified runnable milestones

| Milestone                                  | Status  | Evidence / remaining work                                                                                                                              |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1 Preserve baseline and organize prompts | Done    | Backup; original ZIP, 26 phases, five utilities and references; priority/continuation documents                                                        |
| 0.2 Pin/install tools                      | Partial | Node/pnpm/Rust/WASM/lint tooling ready; native MSVC/SDK missing                                                                                        |
| 0.3 Strict browser workspace               | Done    | Typed packages, Korean/English chrome, physical command input, Platform boundary                                                                       |
| 0.4 Full production verification           | Done    | 138 unit + 23 compatibility + 19 general Edge E2E; separate actual private DWG test                                                                    |
| 0.5 Native desktop acceptance              | Pending | C++ installation rejected by automatic approval review; native startup/window-state tests pending                                                      |
| 1.1 Database journal and scoped variables  | Done    | Handles, atomic transactions, 1,000-operation undo/redo and composite data isolation                                                                   |
| 1.2 Full schemas/sysvars                   | Partial | HCD ZIP and 107 variables implemented; complete schemas and advanced UNDO/OOPS pending                                                                 |
| 4/5/6.1 Basic interactive 2D               | Done    | LINE/CIRCLE/RECTANG/PLINE, coordinate/mouse input, preview, local Undo/Close, Esc semantics, pick/Shift/all selection, erase, shared command undo/redo |
| 9.1 Local DWG/DXF opening                  | Done    | Official and actual large DWG; failure/cancel/replacement races; import reports and original file bytes preserved during session                       |
| 9.2 Large browser recovery                 | Done    | 155,404,934-character cache in 297 IndexedDB chunks; actual reload restores 286,996 entities                                                           |
| 14.1 PDF/image/vector downloads            | Done    | Actual PDF/PNG/JPG/SVG/DXF downloads; independent PDF/SVG/image validation and visual QA                                                               |
| 25.1 Current main launcher and cleanup     | Done    | One CMD, automatic address opening, background server, obsolete active paths retired                                                                   |

## Full phase acceptance status

Milestones are verified slices. None of the complete original phases is claimed
accepted merely because a subset works.

| Phase | Name                                  | Status      |
| ----- | ------------------------------------- | ----------- |
| 00    | Bootstrap                             | In progress |
| 01    | Database, sysvars, undo and documents | Done        |
| 02    | Rendering/navigation                  | Done        |
| 03    | Commands/Korean IME                   | In progress |
| 04    | Coordinates/drafting aids             | In progress |
| 05    | Selection/grips/clipboard             | In progress |
| 06    | 2D drawing                            | In progress |
| 07    | 2D modification                       | In progress |
| 08    | Layers/properties                     | In progress |
| 09    | DWG/DXF/recovery                      | In progress |
| 10    | Text/fonts                            | In progress |
| 11    | Dimensions/leaders                    | In progress |
| 12    | Hatch/boundary/regions                | Planned     |
| 13    | Blocks/references/images              | Planned     |
| 14    | Layouts/plotting                      | In progress |
| 15    | Inquiry/settings                      | In progress |
| 16    | Advanced 2D                           | Planned     |
| 17    | Dynamic blocks                        | Planned     |
| 18    | Parametric constraints                | Planned     |
| 19    | AutoLISP, scripts and DCL             | Planned     |
| 20    | Customization and Express Tools       | Planned     |
| 21    | 3D foundation                         | Planned     |
| 22    | 3D modeling                           | Planned     |
| 23    | Visualization and 3D documentation    | Planned     |
| 24    | Performance/compatibility             | In progress |
| 25    | Packaging/release                     | In progress |

## Earlier usable-CAD baseline verification on 2026-10-14

- `HANCAD_PRODUCTION=1 HANCAD_RUNNING_APP=1 pnpm verify`: passed. WASM proof,
  ESLint, formatting, strict TypeScript, 138 unit tests, 23 migrated compatibility
  tests, production build and 19 general Edge E2E tests. The opt-in private-file
  test is skipped in this general run and was executed separately below.
- Actual 27,368,192-byte R2000 DWG: passed on the same final build. Imports 286,996
  entities in 15.054 s, with 16,035 skipped and 20,079 approximated reported.
  Explicit LAYON displays all 286,996; wheel/pan work at about 1.5 s per interaction.
  Initial/follow-up IndexedDB writes succeed; reload restores 286,996 in 5.767 s.
  No page/console errors, crashes or external drawing requests. Original file
  contents were not modified. Source layer flags can initially hide all geometry.
- Large-data storage is chunked and atomic. Composite JSON remains defensively
  copied; immutable primitive variable values avoid redundant allocation. Recovery
  tests cover quotas, failed writes and NEW/OPEN superseding delayed restoration.
- Independent actual export inspection passes after streaming-bounds changes:
  strict PDF cross-reference/A4/JPEG, independent PDFium render, PNG/JPG decoding,
  SVG XML and actual Edge rendering. Korean text and margin/stroke QA passed.
- Exact original master/glossary/shortcuts and vendor sources/licenses are retained.
  Native compilation/startup remains outside this increment and unverified.

## Manual use

1. Double-click `HanCAD 실행.cmd`. Edge opens the local address automatically; the
   launcher console can close without disconnecting the background server.
2. Choose top **파일** → **DWG / DXF 열기**, the folder icon, or Ctrl+O. Select the
   local drawing. If imported layers hide everything, choose **모든 도면층 켜기**.
3. Use wheel zoom, middle-button pan and ZOOM E. Distant geometry can make the main
   frame small in the full view; pan the frame to the middle and zoom toward it.
4. Start NEW for an empty drawing. Use the ribbon or L/C/REC/PL. Click points or
   enter `x,y`, `@dx,dy`, `@distance<angle`; a bare distance uses cursor direction.
5. Enter finishes LINE/PLINE; C closes; U removes their last segment. Esc removes
   the preview but retains accepted LINE/PLINE segments. CIRCLE takes center/radius;
   RECTANG takes two corners. F8 Ortho and initial F3 running snaps work.
6. Click/Shift-select or Ctrl+A; Delete erases editable selections. U/REDO and
   Ctrl+Z/Ctrl+Y act on complete committed commands. File menu saves supported DXF
   or exports PDF/PNG/JPG/SVG. Reload restores the last locally cached drawing.
7. Open the **주석** ribbon for dimension buttons, or use DLI/DAL/DRA/DDI/DAN.
   Linear/aligned dimensions take two origins and a placement; Enter at the first
   prompt switches to object selection. Radius/diameter select a circle or arc.
   Angular takes two lines, an arc/circle or Enter then vertex and two ray points.
8. At placement, H/V/R select linear direction; T opens editable Korean text with
   `<>` measurement substitution, and A sets text rotation. DIM shows an initial
   smart preview for a line, circle or arc. Esc discards the incomplete dimension.
9. D opens ten basic dimension settings. Increase DIMSCALE before creating dimensions
   when model units make annotations too small. Select existing editable dimensions
   and explicitly check selected application to update them. Their measurements and
   definition points remain intact. U reverses the complete application.

## Limits and exact next work

DWG saving and lossless unsupported-object preservation are pending. Current I/O
covers supported 2D model-space geometry, with omissions/approximations reported.
PDF is raster A4; exact plot scales/window selection/vector CJK output are pending.
Canvas2D is transitional; full rendering budgets and AutoCAD prompt/option parity
remain unmet. Lasso/grips, non-LINE trim/extend targets, additional offset topology,
SHX/BigFont/MTEXT, associative dimensions, the complete DIMSTYLE manager and optional
drafting aids remain future work. Basic trim/extend/offset and TEXT creation are
implemented in the current continuation above.

The current follow-up is verified. The next usable increment starts from
`prompt-source/NEXT_STEPS.md`: prioritize remaining essential 2D edit options,
font/text editing, associative/full dimensions and real-file fidelity.
Keep the app runnable; defer 3D and secondary features.

## Basic-workflow manual acceptance (2026-10-15)

1. Run the main launcher, then NEW. Enter `L`, Enter, `0,0`, Enter, `100,30`,
   Enter, Enter. Use the wheel to zoom toward the cursor, middle drag to pan and
   double-middle to fit the geometry.
2. Set `OSMODE` to `1`. F3 should show object snap enabled. Start `L`, enter
   `10,40`, then hover/click near the prior line endpoint. The green square and
   Korean endpoint tooltip identify the exact snap. F8 Ortho must not displace it.
3. Enter `DLI`, click the two endpoints and click a dimension position. `DAL`
   measures the sloped length; DRA/DDI select a circle; DAN measures an angle.
   `D` opens text/arrow/scale settings. `DI` then two snapped points reports the
   distance without adding objects. Esc cancels unfinished inputs.
4. Drag left-to-right around a complete object for a blue window; drag
   right-to-left across it for green crossing. Shift removes from the selection.
   Drag a selected object to move; hold Ctrl while dragging to copy. Escape before
   release cancels the drag and retains selection; a second Escape clears it.
5. Select an object, enter `M`, `0,0`, `@20,10`. Use U/REDO to verify one edit.
   Select again, `CO`, `0,0`, `@30,0`, `@60,0`, Enter. One U removes both copies.
   Esc retains completed copy placements and discards the next preview.
6. Save DXF from File and reload the page. Completed geometry/dimension definitions
   remain; temporary selection, preview and measurement objects do not persist.

## Essential editing manual acceptance (2026-10-15)

1. Start NEW. Enter `L`, `0,0`, `100,0`, Enter. Enter `L`, `50,-20`, `50,20`,
   Enter. Use Fit before entering TRIM, then `TR`, click the right half of the
   horizontal line and Enter. U restores it; REDO reapplies the entire command.
2. Start `TR` again. Hold Shift and click near the shortened endpoint to extend
   instead. Drag a path across several LINE targets to trim by fence. During the
   command U reverses the last pick/fence; Enter/Esc retains accepted edits.
3. Set `TRIMEXTENDMODE` to `0`, start TR, select a boundary, Enter, then select
   the target portion. Only selected boundaries act as cutters. Set the variable
   back to `1` for Quick. `EX` starts the same flow with extension as its main tool.
4. Enter `O`, `10`, click a line and then a side point. Click another object to
   repeat, or choose M at the side prompt for repeated offsets. U reverses the
   latest operation. Enter in Multiple returns to selection; Enter/Esc there ends
   the command. One global U removes all offsets from that command.
5. Enter `O`, `T`, select a circle and click its desired new radius point for
   Through. E at the initial prompt configures source deletion; L chooses the
   current/source layer. Unsupported polyline joins produce an explicit message.
6. Enter `DT`, `10,20`, `5`, `0`. Type Korean into the canvas input and Enter;
   type another line and Enter; empty Enter finishes. Esc discards only the current
   unaccepted line. U/REDO acts on the accepted line batch and remembered height.
7. Save DXF, reopen it and reload the app. Verify Unicode text and edited geometry.
   TEXTSIZE and profile editing modes persist, while OFFSETDIST resets to Through
   only when the app reloads. Actual Windows IME/Hanja parity still needs manual QA.
