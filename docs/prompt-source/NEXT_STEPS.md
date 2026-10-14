# HanCAD: original-order handoff

## Active next step

The latest user instruction on 2026-10-15 supersedes the earlier feature-first
handoff: complete Phase 00, then Phase 01 through Phase 25 in numeric order.
Read `../PROGRESS.md`'s active-order section first. Preserve delivered later-phase
features, but do not implement new later-phase work while an earlier phase is
incomplete.

Bootstrap milestone 0.6 is implemented and tested: original-order docs,
complete desktop prerequisite diagnostics, bilingual progress content and typed
system-variable error presentation. Continue milestone 0.7 by replacing
raw importer errors/progress/warnings and renderer initialization failures with
structured identities and locale-catalog presentation. Preserve diagnostic
fallbacks and add actual language-switch/error-path coverage.

MSVC C++ tools and the Windows SDK remain unavailable. Their
earlier installation was rejected by automatic approval review with
`blocked by policy`. Actual Tauri startup, minimum size and window-state
restoration remain pending; do not substitute the browser launch for that proof.

After those corrections, audit remaining user-visible text against typed locales
and rerun complete verification. Resolve the native prerequisite and exercise
actual Tauri startup/window restoration before marking Phase 00 complete.
Phase 01 requires complete schemas/sysvars, geometry behavior, advanced Undo and
document/HCD integration beyond the already-tested subsets. Start that phase only
after original Phase 00 acceptance passes.

## Current delivery boundary

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
2. Run the required calculation/I/O tests and UI smoke checks before changing code.
3. Complete one small milestone within the earliest incomplete phase, keeping the
   existing app runnable. Do not skip phases.
4. Test real user-facing behavior and local exports; keep original files untouched
   and do not upload drawing data. Use ignored `test-artifacts/` for evidence.
5. Update progress, commands, decisions and in-app status; rebuild the main app and
   commit the verified feature group.

The original ZIP is `HanCAD_prompts.zip`; the combined prompt is
`HanCAD_prompts_full.md`; individual phases and utility prompts are in `prompts/`.
`PRIORITIES.md` records the agreed delivery order.
