# HanCAD progress

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

Current full verification passes 157 unit tests, 23 compatibility tests and 23
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

| Milestone                                  | Status   | Evidence / remaining work                                                                                                                              |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1 Preserve baseline and organize prompts | Done     | Backup; original ZIP, 26 phases, five utilities and references; priority/continuation documents                                                        |
| 0.2 Pin/install tools                      | Partial  | Node/pnpm/Rust/WASM/lint tooling ready; native MSVC/SDK missing                                                                                        |
| 0.3 Strict browser workspace               | Done     | Typed packages, Korean/English chrome, physical command input, Platform boundary                                                                       |
| 0.4 Full production verification           | Done     | 138 unit + 23 compatibility + 19 general Edge E2E; separate actual private DWG test                                                                    |
| 0.5 Native desktop acceptance              | Deferred | C++ installation rejected by automatic approval review; native startup/window-state tests pending                                                      |
| 1.1 Database journal and scoped variables  | Done     | Handles, atomic transactions, 1,000-operation undo/redo and composite data isolation                                                                   |
| 1.2 Full schemas/sysvars                   | Partial  | HCD ZIP and 105 variables implemented; complete schemas and advanced UNDO/OOPS pending                                                                 |
| 4/5/6.1 Basic interactive 2D               | Done     | LINE/CIRCLE/RECTANG/PLINE, coordinate/mouse input, preview, local Undo/Close, Esc semantics, pick/Shift/all selection, erase, shared command undo/redo |
| 9.1 Local DWG/DXF opening                  | Done     | Official and actual large DWG; failure/cancel/replacement races; import reports and original file bytes preserved during session                       |
| 9.2 Large browser recovery                 | Done     | 155,404,934-character cache in 297 IndexedDB chunks; actual reload restores 286,996 entities                                                           |
| 14.1 PDF/image/vector downloads            | Done     | Actual PDF/PNG/JPG/SVG/DXF downloads; independent PDF/SVG/image validation and visual QA                                                               |
| 25.1 Current main launcher and cleanup     | Done     | One CMD, automatic address opening, background server, obsolete active paths retired                                                                   |

## Full phase acceptance status

Milestones are verified slices. None of the complete original phases is claimed
accepted merely because a subset works.

| Phase | Name                                                         | Status      |
| ----- | ------------------------------------------------------------ | ----------- |
| 00    | Bootstrap                                                    | In progress |
| 01    | Database, sysvars, undo and documents                        | In progress |
| 02    | Rendering/navigation                                         | In progress |
| 03    | Commands/Korean IME                                          | In progress |
| 04    | Coordinates/drafting aids                                    | In progress |
| 05    | Selection/grips/clipboard                                    | In progress |
| 06    | 2D drawing                                                   | In progress |
| 07    | 2D modification                                              | Planned     |
| 08    | Layers/properties                                            | In progress |
| 09    | DWG/DXF/recovery                                             | In progress |
| 10    | Text/fonts                                                   | Planned     |
| 11    | Dimensions/leaders                                           | Planned     |
| 12    | Hatch/boundary/regions                                       | Planned     |
| 13    | Blocks/references/images                                     | Planned     |
| 14    | Layouts/plotting                                             | In progress |
| 15    | Inquiry/settings                                             | Planned     |
| 16    | Advanced 2D                                                  | Planned     |
| 17–23 | Dynamic blocks, constraints, automation/customization and 3D | Deferred    |
| 24    | Performance/compatibility                                    | In progress |
| 25    | Packaging/release                                            | In progress |

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
remain unmet. Advanced selection, move/copy, trim, offset, general text creation,
associative dimensions, the complete DIMSTYLE manager and optional drafting aids
are future work. Initial dimension creation is part of the active follow-up above.

The current follow-up is verified. The next usable increment starts from
`prompt-source/NEXT_STEPS.md`: prioritize essential 2D editing, general text,
associative/full dimension workflows, accurate snapping and real-file fidelity.
Keep the app runnable; defer 3D and secondary features.
