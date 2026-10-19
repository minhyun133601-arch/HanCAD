# Phase 07 acceptance

Requested source: `prompt-source/prompts/phase-07-2d-modify-commands.md`.
Implementation and comprehensive web/native functional acceptance are complete.
Installed-AutoCAD reference comparisons remain on PARITY_CHECKLIST.md.

## Build audit

| Family                                      | Implementation                                                                                                     | Evidence                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| MOVE/COPY/ROTATE/SCALE/MIRROR/STRETCH/ALIGN | Displacement, copy modes/reference points, physical Shift, selection provenance and affine geometry                | Transform tests and `phase07-transforms.spec.ts`                |
| OFFSET                                      | Through/Erase/Layer/Multiple/Undo, Cavalier WASM, gap 0/1/2, conics/infinite curves and numerical spline parallels | Offset tests and `phase07-offset-corners.spec.ts`               |
| TRIM/EXTEND                                 | Quick/Standard, Fence/Crossing, Project/Edge/Erase/Undo, Shift and native hatch boundaries                         | Trim tests and `phase07-cleanup-trim.spec.ts`                   |
| FILLET/CHAMFER/BLEND                        | Radius/Distance/Angle/Method/Polyline/Trim/Multiple/Undo/Expression, analytic corners and spline continuity        | Corner tests and `phase07-offset-corners.spec.ts`               |
| BREAK/JOIN/EXPLODE/LENGTHEN                 | First point/@, source-specific joins, type-specific explosion and scalar/dynamic length edits                      | Curve tests and `phase07-curve-edit.spec.ts`                    |
| ARRAYRECT/ARRAYPOLAR/ARRAYPATH/-ARRAY       | Nonassociative previews, independent entities, spacing/orientation and metadata                                    | Array tests and `phase07-transforms.spec.ts`                    |
| PEDIT/SPLINEDIT/REVERSE                     | Nested shared selection, vertex/fit/CV edits, rational refinement, persisted tangents and conversion               | Poly/spline/selection/persistence tests and curve browser cases |
| DRAWORDER/CHANGE/CHPROP/OVERKILL            | Stable ranks, property batches, block insertion/rotation and validated dialog/CLI cleanup                          | Property/cleanup/block tests and `phase07-cleanup-trim.spec.ts` |
| Shared host                                 | Physical keys/free text, provisional geometry, stable replacements, metadata and command undo                      | Existing input/grip suites and Phase 07 browser cases           |

## Original acceptance scenarios

- [x] Quick TRIM dragged-fence trimming and Shift extension pass in production
      browser and native WebView2.
- [x] Closed arc-polyline OFFSET gap 0/1/2 produces extension, arc and chamfer
      connectors; exact geometry and one-command U/REDO pass in both modes.
- [x] Shift FILLET produces a sharp corner while retaining FILLETRAD=25.
- [x] JOIN produces one LINE from collinear lines and a polyline from connected
      LINE+ARC; wide-polyline EXPLODE warns and preserves restorable source data.
- [x] Each native modifying scenario checks one U restores the complete source
      graph and REDO restores exact IDs/geometry. Navigation is performed after
      this check because view commands can themselves enter the undo journal.

These checks validate constructed results and prompt behavior. Matching the
installed AutoCAD kernel's proprietary numerical choices remains a reference
comparison, as recorded below.

## Reproducible manual steps

Use a new drawing. Enter every token separately; `""` means an empty Enter.

1. Disable aids: `OSMODE`, `0`, `ORTHOMODE`, `0`, `SNAPMODE`, `0`, `DYNMODE`, `0`.
2. Transform: `L`, `0,0`, `100,0`, `""`; then `MOVE`, `ALL`, `""`, `D`, `20,30`.
   U restores the line. COPY with base 0,0 and Array/4/Fit/300,0 makes three
   additional placements. Escape retains them and U removes all three.
3. Trim: draw a horizontal line crossing two vertical lines. Start TRIM and drag
   a fence across its middle interval. Hold Shift and pick an endpoint to extend
   a short line. Enter finishes; U restores both edits together.
4. Corners: draw two perpendicular lines. Set `FILLETRAD`, `25`, run FILLET,
   pick the first line and Shift-pick the second. The corner is sharp and
   FILLETRAD remains 25. U restores both lines.
5. Offset: draw a closed PLINE with line and arc segments. For each
   OFFSETGAPTYPE 0/1/2, OFFSET outward by 10. Inspect extension/round/chamfer
   connectors; U removes the offset and REDO restores its exact source.
6. Join/explode: select collinear LINEs for JOIN and finish selection. The result
   is one LINE. Connected LINE+ARC joins as a polyline. EXPLODE of a wide
   polyline warns about width loss and creates primitives. U restores widths,
   bulges and identity.
7. Cleanup: draw overlapping LINEs. `OVERKILL`, `ALL`, `""` opens the Korean
   dialog. Negative tolerance disables OK. Cancel preserves the source; OK
   combines permitted overlaps. U restores the original entities.
8. Properties/order: CHPROP Color/Truecolor `12,34,56`, Lweight `0.26`
   (rounded to 0.25), Thickness 20 and Transparency 35 change in one command.
   DRAWORDER Front followed by MOVE preserves rank. Undo each separately.

## Reference boundaries

The family notes contain primary references, mathematical construction choices
and installed-AutoCAD comparison cases. Numerical spline offsets use a sampled
residual target rather than asserting identical proprietary control points.
Top-level nonassociative native HATCH definitions support MIRRHATCH 0/1 through
raw boundary/pattern transformation and atomic copy/erase/undo. Native pattern
rendering/authoring and gradient/association graphs remain later hatch work;
unsupported graphs fail explicitly. Material rendering, complete font styles and
later 3D producers retain their owning-phase boundaries. These limitations and
the supported native/SVG/raster style evidence are in the family/export notes.

## Final verification

The first comprehensive pass found two regressions: the legacy SVG readable
screen-pen fallback and a full-capacity TRIM fence timeout. The source tests
were retained. Fence acquisition now rejects disjoint exact bounds before
intersection preparation and caches immutable entity inquiries. Its three-file,
22-case affected suite completed in 0.6 seconds. The second pass exposed the
same export fallback leaking into a dark Canvas scene; display/export policy is
now explicit. Both failed logs are retained for traceability.

Passed before the gate: locked Rust format/check/tests (6 tests), offline frozen
pnpm install, Windows readiness and the unchanged million-entity renderer stress
gate (pan 60.00 fps, zoom 59.80 fps, frame p95 16.8 ms, GL error 0).

The third full pass passed units/compatibility/rendering but exposed browser
integration regressions and stale expectations: Previous/FILTER selection
handoff, Korean JOIN diagnostics, MOVE prompts, OFFSET coordinate shape, and
newly implemented FILLET startup/help. Product defects were repaired and old
expectations updated to the implemented flow while retaining geometry/undo
assertions. The 11 affected cases then passed. Failed logs remain available.

The complete fourth pass of
`HANCAD_PRODUCTION=1 HANCAD_RUNNING_APP=1 pnpm verify` exited 0:

- WASM round-trip, ESLint, Prettier and strict TypeScript pass.
- 1,181 unit tests in 161 files and 32 compatibility cases pass.
- Generated documentation matches 381 commands; system-variable documentation
  separately matches 875 variables and 214 headers.
- Production build and renderer QA pass: 28 scenes, 37 color contracts,
  3 viewport boundaries and 20 high-zoom comparisons. Translated scenes are
  identical; the largest compositing channel error is 1.
- 192 browser cases pass in 6.6 minutes. One personal-DWG case is skipped
  because no personal file was supplied; the public official DWG case passes.

Log: `test-artifacts/phase07-verify-run4-20261019.log`.

The final native selection identity fix then received the required affected
pass: lint/format/strict TypeScript, all **1,184 unit tests**, all 32 compatibility
cases, documentation check, production rebuild and **43 browser cases** pass.
This covers all Phase 07 browser families plus selection and modification
regressions. Log: `test-artifacts/phase07-final-affected-20261019.log`.

`pnpm tauri build --no-bundle` succeeded, embedding the same product behavior.
`node scripts/verify-native-phase07.mjs` passed **13 native cases**, including all
five original acceptance scenarios, properties and the OVERKILL dialog, with
no page errors. Real two-process Windows Clipboard/grip regressions and native
WIPEOUT display/export/image-consumer checks also pass. PNG/DIB/Bitmap consumer
comparisons report zero RGB pixel mismatches. Logs:
`phase07-native-build-20261019.log`, `phase07-native-modify-20261019.log`,
`phase07-native-clipboard-20261019.log`, and
`phase07-native-wipeout-20261019.log` under `test-artifacts/`.

The phase owner directly inspected the native valid-options OVERKILL dialog and
Quick TRIM fence-in-progress captures. Korean labels are readable, the complete
dialog fits inside the window, and the fence/trim preview remains visible above
the command prompt. The family owners inspected the production OFFSET 0/1/2,
Shift FILLET and curve-edit captures; their notes record the observed geometry.

`node scripts/verify-native-hatch-mirror.mjs` passes **two native HATCH cases**
for MIRRHATCH 0/1, copy/erase and mixed legacy/native geometry. Raw boundary,
pattern, styles and XDATA are verified, along with Previous selection, exact
U/REDO, recovery reload and no page errors. Pattern drawing is explicitly
reported as unsupported. Log: `test-artifacts/phase07-native-hatch-20261019.log`.
The initial harness assumed an identity field absent from its minimal fixture,
then compared a reflected -9.999999999999998 coordinate with exact -10. It now
waits for the active tab/native graph and compares mathematical coordinates
within 1e-9, retaining exact full-graph U/REDO/reload assertions. No product fix
was needed for these harness failures.

Native automation launches actual Tauri/WebView2 processes and exercises real
Win32 Clipboard formats. Its keyboard/mouse events are dispatched through CDP;
physical Windows IME/Hanja and OS-reserved shortcut routing are not certified.

Clean generation also passes: with the ignored generated geometry-WASM folder
moved to a contained artifact backup, `pnpm build:web` regenerated WASM and
built successfully. Both web startup/build and the Tauri prebuild now include
WASM generation, removing the hidden clean-checkout prerequisite. Evidence:
`test-artifacts/phase07-clean-web-build-20261019.log`.

After completed progress metadata was published, the final
`pnpm tauri build --no-bundle` passed the automatic WASM/web pipeline in 2m 08s.
The final bundle is `index-D1CEJ06A.js`; only the progress data differs from the
fully tested behavior bundle. The existing bilingual progress browser case
passes. A final actual Tauri smoke confirms the completed Phase 07 row,
expected MOVE coordinates, exact one-command U/REDO and no page errors. The
completed progress screenshot was directly inspected. Final executable:
`target/release/hancad-desktop.exe`, SHA-256
`ec7580c3f708b19d0048475011e76d5c2b3366848e4f4944c128b523cee2d726`.
Evidence is in `test-artifacts/phase07-native-build-final-20261019.log`,
`phase07-final-progress-browser-20261019.log`,
`phase07-final-artifact-20261019.log` and `phase07-final-artifact/`.
