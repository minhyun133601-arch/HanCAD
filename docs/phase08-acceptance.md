# Phase 08 integration and acceptance

Source: `prompt-source/prompts/phase-08-layers-and-properties.md`.
Implementation is complete only after the final gates below pass. This document
does not replace the actual results recorded in PROGRESS.md.

| Original Build scope                                                          | Implementation and meaningful evidence                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAYER modeless manager, twelve columns, F2/sort/search                        | `layers/LayerPalette*`, layer-model/records tests and phase08-layers browser cases                                                                         |
| Property/group filters, inversion, saved states/LAS, previous state           | `layer-filters`, `layer-states`, native handles and selective restoration; UTF-8/CP949 input and Korean LAS browser round trip                             |
| Full -LAYER and listed LAY tools, COPYTOLAYER/SETBYLAYER                      | Shared CLI walker/session, accepted Escape changes, transparent nested prompts, point-input copy jig, native assignment/merge/delete/copy/property patches |
| Notifications, special layers and locked fading                               | Documented lifecycle event masks, LAYEREVAL/profile binder, 0/Defpoints rules, separate On/Freeze flags and LAYLOCKFADECTL                                 |
| ACI/RGB/HSL, LINETYPE, original LIN, LWEIGHT/transparency                     | `styles08/`, native complex LTYPE persistence, original standard/ISO resource, dialog/CLI and actual WebGL browser probes                                  |
| Properties, mixed values/type filter, expressions, Quick Properties, rollover | `entity-properties`, validated current defaults, shared native inquiry adapters; six property browser scenarios                                            |
| Ribbon live layer and property controls                                       | Same layer/property updates, selection-aware values, native/legacy style names and dialog callbacks                                                        |
| MATCHPROP Settings and object isolation                                       | Per-target remembered settings, provisional previews, accepted Escape changes, one journal group; layered hidden sets and mode-0/1 recovery boundaries     |

All four original acceptance scenarios have browser coverage: immediate ribbon
freeze and exact LAYISO/LAYUNISO restoration; mixed line/circle common editing;
user-authored complex Korean LIN retention through HCD/reload; real native
nested INSERT ByLayer/ByBlock rendering, parent freeze and exact raster Undo.

Focused native integration tests additionally check mixed native/legacy property
Undo, OCS displacement, owned dictionary/XRECORD cloning and handle references,
raw DXF style values, layer merge, hidden native snap eligibility and locked
ancestor display/picking. They do not certify unsupported displaced opaque
geometry; that operation fails explicitly before mutating the drawing.

## Final required gates

- Comprehensive `HANCAD_PRODUCTION=1 pnpm verify`: lint, formatting, strict TS,
  all unit/compatibility/catalog checks, production build, renderer and E2E.
- System-variable documentation drift and Windows readiness.
- Rust formatting and workspace tests, actual final Tauri release build.
- `node scripts/verify-native-phase08.mjs`: six actual Windows WebView2 cases.
- Unchanged million-entity renderer stress and affected prior native regressions.
- Review actual logs/screenshots, final docs and feature commit. The existing
  user-owned constitution/prompt edits stay outside that commit.

## Reference boundaries

Installed Korean AutoCAD overlays and physical Windows IME/Hanja comparisons
remain unverified. CDP sends browser keys and cannot establish physical keyboard
or IME routing. Complex LIN text/shapes retain their definitions; full glyph/SHX
rendering is Phase 10. Viewport columns/overrides and PLOT events are Phase 14;
xref/block insertion events belong to their reference phases. Full opaque foreign
DWG/DXF round-trip fidelity remains Phase 09. Family notes and the parity checklist
identify numeric/rendering assumptions without claiming unrun reference checks.

## Gate evidence and corrections

The final `HANCAD_PRODUCTION=1 HANCAD_RUNNING_APP=1 pnpm verify --workers=2`
run 4 exits 0: 1,290 unit tests in 179 files, 32 compatibility cases, the
393-command check, production build, renderer QA and 213 browser cases pass.
One personal-DWG case remains conditionally skipped without a supplied file.
Browser duration is 10.4 minutes. Log:
`test-artifacts/phase08-verify-run4-20261019.log`.

The actual Windows Tauri release builds in 2m 15s. All six Phase 08 native
scenarios pass without page errors, including Korean local support-file reads
through the new Rust command, exact native graph/pixel Undo and recovery.
Logs: `phase08-native-build-20261019.log` and
`phase08-native-acceptance-20261019.log` under `test-artifacts/`.

All affected prior native regressions also pass: thirteen Phase 07 modifying
cases, two MIRRHATCH cases, two-process Windows Clipboard/grip operations and
WIPEOUT display/export. PNG/DIB/Bitmap consumer comparisons have zero RGB
pixel mismatches. Logs: `phase08-native-modify-regression.log`,
`phase08-native-clipboard-regression.log`, `phase08-native-wipeout-regression.log`
and `phase08-native-hatch-regression.log` under `test-artifacts/`.

The final release rebuild (completed progress metadata only) passes in 1m 44s.
The bilingual progress browser case and final actual Tauri progress/LINE/U/REDO
smoke pass with no page errors. Final asset: `index-nWjGk44B.js`.
Executable SHA-256:
`a795fa49a2ef288d68a1188978b36ca91e8e90cce443124c08d36a5ac01c44bc`.
Logs: `phase08-native-build-final-20261019.log`, `phase08-progress-final.log` and
`phase08-final-artifact-20261019.log` under `test-artifacts/`.

Run 2 stopped at lint for an unused test import, which was removed. Run 3 passed
all 1,286 unit tests and the build/renderer gates; browser results were 208 passed,
one conditional skip and five failures under four workers. Three failures showed
navigation waiting indefinitely for an animation frame with the camera/frame
unchanged, while two additional grip/Clipboard cases timed out under the same
load. ViewTransition now has a cancellable VTDURATION deadline and generation
guards; four new focused tests prove stall completion, normal completion, cancel
and restart. The final comprehensive pass uses two browser workers on this host
without reducing assertions or the separate renderer stress workload.

The first comprehensive production pass reached 1,266 unit tests in 176 files,
32 compatibility cases, the 393-command check, production build and renderer QA.
Browser results were 207 passed, one personal-DWG case skipped without a supplied
file, and two failures. One test retained the superseded automatic-fit LAYON
behavior; the corrected feature test checks view preservation, Undo and explicit
ZOOM Extents. The other still expected 17 progress features after the eighteenth
was added; it now checks the bilingual layer feature as well.
Log: `test-artifacts/phase08-verify-run1-20261019.log`.

Visual review also found clipped ribbon controls and an overflow-clipped layer
list. Compact controls and an anchored viewport-positioned list address both;
the dedicated ribbon case checks actual control bounds, creation defaults and a
layer choice below the ribbon. Final verification must include these corrections
and the additional native curve geometry/copy coverage.

The seven affected UI cases pass after the ribbon/LAYON/progress corrections
(`phase08-ui-final.log`). Native ARC/POINT geometry cases also pass, including
exact source objects, raw DXF, framebuffer U/REDO and reload. Their first fixture
omitted the empty drawing state because no drawing cache existed yet; it now uses
the actual runtime normalizer. A REGEN after the view setup normalizes the initial
retained curve LOD before exact pixel comparisons. This retains exact comparisons
instead of relaxing the raster tolerance. Output:
`test-artifacts/phase08-native-properties-focused`.

Pre-gates pass: Windows readiness, system-variable documentation (875 variables,
214 headers), Rust formatting and eight workspace tests. The unchanged
1,000,000-entity, 1920x1080 stress gate passes: pan and zoom 60.00 fps, frame p95
16.8 ms, GL error 0, final pending refinement 0. Logs: `phase08-desktop-readiness.log`,
`phase08-sysvars-check.log`, `phase08-rust-tests.log`, and
`phase08-render-stress-final.log` under `test-artifacts/`.
