# Usable 2D CAD: handoff and next work

## Current delivery boundary

The user explicitly ends this increment at DWG opening, basic drawing and project
folder cleanup. Keep the main app runnable and preserve the original prompt set.
Do not add optional or 3D features as part of this increment.

Implemented workflows include local DWG/DXF opening, view navigation, LINE,
CIRCLE, RECTANG, straight PLINE, mouse/coordinate input, basic pick/Shift/all
selection, erase, command-level undo/redo, basic Ortho/object snaps, DXF save and
PDF/PNG/JPG/SVG output. The top file menu/open icon contains file actions rather
than a permanent action row. `HanCAD 실행.cmd` is the only root launcher; it opens
the local address in Edge and keeps the local server in the background.

The supplied large R2000 drawing imports 286,996 entities. Unsupported/invalid
objects and approximations are reported; this is not a lossless DWG editor. Show
all layers explicitly if the imported layer flags hide the entire drawing. The
file can contain remote geometry, so Zoom Extents may show its main frame small;
zoom toward the frame or pan it into the middle before zooming further.

The final menu build and actual private-drawing verification passed, including
layer visibility, pan/zoom, chunked large-data caching and reload restoration.
General verification passed 138 unit, 23 compatibility and 19 browser tests;
the actual private-file test passed separately. Read `../PROGRESS.md` for the
evidence and remaining limitations.

## Essential work for the next increment

| Order | Work | Original prompts | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Smooth large-drawing pan/zoom and faster edits | Phases 02, 24 | Profile the 286,996-entity file; reduce full redraws and cloning; preserve geometry/visibility and measure latency |
| 2 | Window/crossing selection and properties | Phases 05, 08 | Directional selections, hidden/locked rules, accurate multi-selection and undoable property changes |
| 3 | MOVE/COPY, TRIM/EXTEND, OFFSET | Phase 07 | Mouse/coordinate options, preview, one-command undo, exports retain modified geometry |
| 4 | TEXT and basic DIMLINEAR/DIMALIGNED | Phases 10, 11 | Korean free-text composition, measured values, unit handling, DIMSCALE changes display size only |
| 5 | Better geometry snapping and drafting aids | Phase 04 | Intersection/perpendicular/tangent snaps, markers, variable-driven modes, large-coordinate precision |
| 6 | Better layer controls and save/recovery | Phases 08, 09 | Individual layers, local backups, reliable interrupted-write recovery, restore races and quota handling |
| 7 | Improve real-file fidelity and plotting | Phases 09, 14, 24 | Attributes, SHX/CJK, preserved unsupported records, exact plot scale and vector PDF |

Follow the original command names, aliases, prompt options and coordinate rules.
Document any reference ambiguity in `../DECISIONS.md` and `../PARITY_CHECKLIST.md`.
Do not claim a full phase is complete until every original acceptance item passes.

## Deferred work

Advanced blocks/hatches/references, constraints, automation, customization, 3D and
native installer packaging follow the essential 2D work. The native Tauri build
also needs the unavailable MSVC/Windows SDK prerequisites; its startup/window
restoration has not been accepted.

## Continuation procedure

1. Read the root `AGENTS.md`, `../PROGRESS.md`, this document and the relevant
   original phase prompt in `prompts/`.
2. Run the required calculation/I/O tests and UI smoke checks before changing code.
3. Implement one usable feature group, keeping the only launcher working.
4. Test real user-facing behavior and local exports; keep original files untouched
   and do not upload drawing data. Use ignored `test-artifacts/` for evidence.
5. Update progress, commands, decisions and in-app status; rebuild the main app and
   commit the verified feature group.

The original ZIP is `HanCAD_prompts.zip`; the combined prompt is
`HanCAD_prompts_full.md`; individual phases and utility prompts are in `prompts/`.
`PRIORITIES.md` records the agreed delivery order.
