# HanCAD: original-order handoff

## Active next step (2026-10-17; Phase 04 paused)

The user started Phase 04, then explicitly requested pausing and saving the current
state. Phase 04 is WIP, not accepted. Resume only when the user asks; read the
paused Phase 04 section of `../PROGRESS.md` for exact files, APIs, known failures,
test evidence and eight ordered continuation steps. Do not run a complete baseline
merely to resume. Current source integration/typechecking is incomplete, and the
last accepted production build remains Phase 03.

Focused evidence so far: root tracking 7 passed; coordinate batch 42/43 passed
(one optional-Z inheritance failure); settings/dynamic/-OSNAP/status 13 passed.
These are partial snapshots and do not certify the current combined source.
No Phase 04 build, E2E, manual acceptance or complete verification has run.

Start with the optional-Z test contract and snap-kind/type errors, then integrate
the new curve index, acquisition/constraints and dynamic-input UI. Do not begin
Phase 05. Preserve the pre-existing protocol edits and the Phase 03 checkpoint.

## Historical next step (2026-10-17; Phase 03 complete)

Phase 03 implementation and browser acceptance are complete. Read the completion
section of `../PROGRESS.md` for all verification evidence and native/reference
limitations. The comprehensive run passed 558 unit, 30 compatibility and renderer
checks; after correcting three E2E test-flow/timing failures, all 40 affected E2E
tests passed. Across both runs all 106 enabled E2E tests passed, with one opt-in
private-DWG test skipped.

Wait for a user request before starting Phase 04. Then read the coordinate-input/
drafting-aids prompt and plan its milestones: complete LINE, coordinate syntax,
all snaps/tracking, dynamic-input fields/Down menus and DSETTINGS/-OSNAP.
Phase 00 native startup/window and actual Windows IME/reference comparisons
remain explicitly unverified. Preserve existing later-phase subsets and their
regressions. The older Phase 03 continuation below is historical.

## Historical next step (2026-10-16; phase-end verification)

The user requested a continuation plan and then authorized batching comprehensive
verification at the end of each phase. This update changes prompt documents only.
Read `../PROGRESS.md`'s active-phase section first; it is the authoritative status
and contains the phase-end PowerShell verification commands and remaining work.

Current phase: Phase 03 command system, command line, shortcuts and Korean IME.
Milestones 3.1-3.7 are complete. Milestone 3.8 keyboard bindings and temporary
overrides is paused at commit `8bee8ab` (`wip(phase3.8)`), pending full verification.
Earlier unit/lint/type checks and the isolated keyboard E2E passed, but the full
E2E run was interrupted without a final summary. No application tests were run for
this documentation update. Keep that final verification pending while implementing
the remaining phase features.

1. Read the root protocol and active handoff, then continue implementation at 3.9.
   Do not run the full suite merely to resume or before starting 3.9. During
   implementation, use typechecking, brief checks of changed core behavior and
   focused tests when needed for bugs or complex changes. Keep the app runnable.
2. Implement 3.9: configurable right-click/Enter behavior, default/edit/command
   menus, time-sensitive right-click, Shift+right-click and MBUTTONPAN=0 snap menus.
   Verify Korean menu wording against the official reference and record any
   remaining parity checks.
3. Implement 3.10: status-bar toggle icons and settings menus, COORDS modes,
   customization and F1 command help. After all Phase 03 implementation is
   finished, run the complete `pnpm verify` pass against a fresh production build,
   verify 3.8-3.10 together and check all seven Phase 03 acceptance items and
   existing-feature regressions. Fix failures and rerun affected checks; finish
   the maintained docs and commit the verified work without rewriting the WIP
   commit. Report the completed phase in Korean only after the checks pass.
4. Start Phase 04 coordinate input and drafting aids (LINE as the reference
   command) only after Phase 03 acceptance. Phases 04-25 are 22 remaining phases;
   existing later-phase subsets are not full-phase completion.

Phases 01 and 02 are complete. Phase 00 native acceptance remains deferred and
unverified by user instruction; browser evidence cannot replace actual Tauri
startup, minimum-size and window-restoration checks. Preserve delivered features
and their regressions. Earlier Phase 01 instructions in historical material do
not override this handoff or the active section of `../PROGRESS.md`.

## Historical delivery boundary

The 2026-10-15 continuation also delivers directional selection, MOVE/COPY and
selected-object drags, exact endpoint/intersection snapping, DIST, Quick/Standard
LINE TRIM/EXTEND with Shift/fences/local Undo, basic OFFSET and inline Korean
TEXT/DTEXT. The complete Phase 07/10 acceptance remains pending. Use the latest
verification section in `../PROGRESS.md`; the older benchmark below is historical.

The historical feature handoff was Phase 7.3 ROTATE/SCALE with Copy/Reference and
one-command undo, followed by MIRROR/FILLET. It is superseded by the active next
step above. Later Phase 07 work must expand TRIM beyond LINE targets, add curved and
additional-join OFFSET through the planned geometry engine, then complete TEXT
justification/styles and existing-text editing. Keep main-app builds runnable and
preserve current dimension/import/export/recovery regressions.

The user first requested DWG opening, basic drawing and project folder cleanup,
then extended the usable slice with reliable browser launching, large-file
navigation improvements and dimension creation/display. Keep the main app runnable
and preserve the original prompt set. Optional and 3D features remain deferred.

Implemented workflows include local DWG/DXF opening, view navigation, LINE,
CIRCLE, RECTANG, straight PLINE, mouse/coordinate input, basic pick/Shift/all
selection, erase, command-level undo/redo, basic Ortho/object snaps, DXF save and
PDF/PNG/JPG/SVG output. Initial dimensions cover linear/aligned/radius/diameter/
angular and smart DIM, with ten basic style fields and Korean text overrides.
The top file menu/open icon contains file actions rather
than a permanent action row. `HanCAD 실행.cmd` is the only root launcher; it opens
the local address in Edge and keeps the local server in the background.

The supplied large R2000 drawing imports 286,996 entities. Unsupported/invalid
objects and approximations are reported; this is not a lossless DWG editor. Show
all layers explicitly if the imported layer flags hide the entire drawing. The
file can contain remote geometry, so Zoom Extents may show its main frame small;
zoom toward the frame or pan it into the middle before zooming further.

The launcher now opens the browser directly from the interactive CMD after local
server health; the user confirmed a new window appears. Read `../PROGRESS.md`
for the current verification evidence, measured large-file performance and
remaining limitations. The final follow-up passes 157 unit, 23 compatibility and
23 general production browser tests, plus 20 renderer golden scenes. The actual
private-file benchmark passed separately: import 11.889 s, six paint/readback
samples 33.0-402.4 ms, dimension creation/undo, all four IndexedDB checkpoints and
2.222 s reload restoration of 286,996 visible objects. Full WebGL rendering,
16 ms edit and complete dimension acceptance remain pending.

## Historical essential-feature backlog

This table is a retained backlog, not the active implementation order.

| Order | Work | Original prompts | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Complete large-drawing rendering and faster edits | Phases 02, 24 | Extend retained/cached rendering toward the WebGL/floating-origin budgets; preserve geometry/visibility and measure actual paint latency |
| 2 | Window/crossing selection and properties | Phases 05, 08 | Directional selections, hidden/locked rules, accurate multi-selection and undoable property changes |
| 3 | MOVE/COPY, TRIM/EXTEND, OFFSET | Phase 07 | Mouse/coordinate options, preview, one-command undo, exports retain modified geometry |
| 4 | TEXT and complete dimension workflows | Phases 10, 11 | Korean text editing, associative geometry references, seven-tab styles, fit rules, baseline/continued dimensions, leaders and tolerances |
| 5 | Better geometry snapping and drafting aids | Phase 04 | Intersection/perpendicular/tangent snaps, markers, variable-driven modes, large-coordinate precision |
| 6 | Better layer controls and save/recovery | Phases 08, 09 | Individual layers, local backups, reliable interrupted-write recovery, restore races and quota handling |
| 7 | Improve real-file fidelity and plotting | Phases 09, 14, 24 | Attributes, SHX/CJK, preserved unsupported records, exact plot scale and vector PDF |

Follow the original command names, aliases, prompt options and coordinate rules.
Document any reference ambiguity in `../DECISIONS.md` and `../PARITY_CHECKLIST.md`.
Do not claim a full phase is complete until every original acceptance item passes.

## Later original phases

Advanced blocks/hatches/references, constraints, automation, customization, 3D and
native installer packaging follow their original phase numbers. The native Tauri build
also needs the unavailable MSVC/Windows SDK prerequisites; its startup/window
restoration has not been accepted.

## Continuation procedure

1. Read the root `AGENTS.md`, `../PROGRESS.md`, this document and the relevant
   original phase prompt in `prompts/`.
2. Review recorded results and pending checks. Do not run full suites solely
   because a session starts. Follow the user's active phase and deferrals in
   `../PROGRESS.md`.
3. Continue through the requested phase's remaining milestones, keeping the app
   runnable. Use typechecking and brief changed-feature checks during development;
   add test coverage alongside the features and run focused tests when needed.
4. At the end of the current phase, review all requirements and Acceptance items,
   run complete required verification against the current build and exercise
   user-facing behavior and local exports. Fix failures and rerun affected checks;
   repeat the full pass only when justified. Keep original files untouched and do
   not upload drawing data. Use ignored `test-artifacts/` for evidence.
5. Finish progress, commands, decisions and in-app status; commit the accepted
   phase work and report in Korean. If stopping early, save a checkpoint and exact
   next step with pending checks. Start the next phase only on a user request.

The original ZIP is `HanCAD_prompts.zip`; the combined prompt is
`HanCAD_prompts_full.md`; individual phases and utility prompts are in `prompts/`.
`PRIORITIES.md` records the agreed delivery order.
