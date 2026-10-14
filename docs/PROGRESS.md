# HanCAD progress

## Delivered scope and priority

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
| 1.2 Full schemas/sysvars                   | Partial  | HCD ZIP and 100 variables implemented; complete schemas and advanced UNDO/OOPS pending                                                                 |
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

## Final verification on 2026-10-14

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

## Limits and exact next work

DWG saving and lossless unsupported-object preservation are pending. Current I/O
covers supported 2D model-space geometry, with omissions/approximations reported.
PDF is raster A4; exact plot scales/window selection/vector CJK output are pending.
Large-file pan/zoom is slow. Canvas2D is transitional; full rendering budgets and
AutoCAD prompt/option parity remain unmet. Advanced selection, move/copy, trim,
offset, text/dimension creation and optional drafting aids are future work.

Stop feature work for this increment. The next agent starts from
`prompt-source/NEXT_STEPS.md`: prioritize measured large-file performance, essential
2D editing, text/dimensions, accurate snapping and real-file fidelity. Keep this
verified app runnable; defer 3D and secondary features.
