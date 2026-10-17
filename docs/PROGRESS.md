# HanCAD progress

## Active phase: Phase 05 selection, grips and clipboard (2026-10-17)

Source: `docs/prompt-source/prompts/phase-05-selection-grips-clipboard.md`.
Authorized by the user after Phase 04 completion. The recorded accepted baseline
below remains valid; do not rerun the full suite at phase start. Preserve existing
AGENTS.md/prompt protocol edits outside feature commits. Phase 06 is not authorized.

| Milestone                         | Status                              | Scope                                                                                                                           |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 Selection engine and gestures | Implemented                         | PICK* rules, all 18 selection keywords, polygon/fence/lasso, preview/effects, cycling, counts and locked filtering              |
| 5.2 Filters and groups            | Implemented                         | QSELECT, SELECTSIMILAR settings, profile-global named FILTER expressions, GROUP/GROUPEDIT and native group persistence          |
| 5.3 Grip editing                  | Implemented                         | Providers, five modes/options, multiple hot grips, multifunction actions, drafting aids, object dimensions and one-command undo |
| 5.4 Clipboard and properties      | Implemented; native QA blocked      | Cross-document/window internal+image clipboard, copy/cut/base/paste/block/original, basic Properties and Quick Properties       |
| 5.5 Acceptance and integration    | Browser verified; native QA blocked | Comprehensive verification, production UI checks, performance/persistence and documentation                                     |

Implementation is split across selection/filter/group, grip and clipboard/property
workstreams, while the root integrates canvas gestures, render preview/cycling,
command routing and shared aid ownership. Add meaningful feature tests alongside
implementation; use focused tests/typechecking only when needed. Run pnpm verify
and additional required platform/performance/round-trip checks after implementation
is complete, fix failures and rerun affected checks. Never report unrun native or
installed-AutoCAD comparisons as passed.

### What changed

SELECT, modification and Clipboard prompts share selection sessions, method
keywords, counts, previous sets and locked filtering. Indexed preview/cycling,
directional rectangles, two-click corners and default lasso respect PICK variables.
QSELECT/SELECTSIMILAR settings, global named FILTER definitions and GROUP editing
are integrated. Native GROUP ownership/reactors and Clipboard BLOCK/INSERT records
share the command transaction and preserve stable handles during supported edits.

Every current entity family has grips. Five modes, Base/Copy/Undo/Reference/Exit,
multiple hot grips and polyline/line multifunction edits share snapping, polar,
tracking and dynamic locks. DYNDIVIS/DYNDIGRIP expose object result/change lengths,
angles and arc radii on supported single shape grips; unsupported shape dimensions
retain documented pointer-displacement input. Curved polyline edits keep exact
bulges through rendering, recovery, snaps, SVG and supported DXF round trips.

Clipboard commands transfer precise geometry/base points across drawings/windows.
Actual browser Clipboard JSON+PNG and the explicitly reported IndexedDB fallback
are covered. PASTEBLOCK retains supported block definitions, inserts and base points
through recovery/DXF. Basic Properties/Quick Properties edit common/type geometry
with WCS conversions, mixed-value handling, locks and validation.

### Final verification evidence

The final comprehensive `pnpm verify` pass ran with HANCAD_PRODUCTION=1 and
HANCAD_RUNNING_APP=1 against the freshly built production files. Results:

- WASM build/round-trip, lint, formatting, strict TypeScript and browser production
  build passed. All 794 unit tests in 108 files and 30 compatibility tests passed.
  Four additional app-level grip dimension tests passed afterward, proving
  reciprocal lock replacement, independent angle/length locks and invalid radii.
  Their strict TypeScript and focused lint checks also passed; no product code
  changed. Current total: 798 unit tests in 109 files.
- Command drift check passed for 377 commands. The additional sysvar drift check
  passed for 868 definitions and 214 header mappings; frozen offline workspace
  lockfile validation passed. No dependencies were upgraded.
- Renderer verification passed 28 scenes, 37 exact-color contracts, 3 viewport
  boundary contracts and 20 high-zoom comparisons. Translated large-coordinate
  scenes remain identical; maximum compositing channel error is 1.
- Full browser run: 140 passed, one timed out and one skipped out of 142. The
  timeout was the comprehensive dimension workflow's default 30-second budget;
  its trace had already passed geometry, five exports, reload and error checks.
  Only that workflow now has a 60-second budget. Its isolated rerun passed in
  38.1 seconds with command exit 0. Final unique browser result: 141 passed and
  one skipped; the optional personal DWG check requires HANCAD_DWG_PATH.
  The complete verify command exited nonzero for that timeout; the failed check
  and focused lint passed after the test-only correction. Product code did not
  change after the comprehensive production run.
- The integration pass exposed actual TRIM click/two-corner ownership and grip
  popup/REDO focus regressions; both were fixed and focused regressions passed.
  Old rectangle/body-drag fixtures now set PICKAUTO=1 and avoid actual midpoint
  grips. DWG cancellation holds the worker pending to test cancellation before
  completion. Full-pass logs retain the original failures separately.
- The official DWG fixture now imports 71 editable entities, skips 133 and
  approximates 17. A valid closed 3,635-vertex bulged polyline formerly exceeded
  the tessellation limit; exact-vertex/bulge assertions prevent its omission.
  This fixture remains supported-geometry conversion, not lossless foreign I/O.
- `pnpm test:render:stress` passed with 1,000,000 entities at 1920x1080 on Intel
  UHD 730: load 241.1 ms, pan 60.0 fps, zoom 59.60 fps, frame p95 16.8 ms,
  submit p95 1.6/7.3 ms and GL error 0. Artifacts are in render-stress/.
- Production screenshots cover lasso, exact bulged grips, all grip dimension
  fields, QSELECT, FILTER, DDGRIPS and Properties. Dialog layouts/scrolling were
  inspected; the isolated dialog browser reported no page errors.
- `cargo fmt --all` passed. `pnpm check:desktop` and the attempted
  `cargo check -p hancad-desktop --locked --offline` are blocked by missing MSVC
  C++ tools/link.exe and Windows SDK. vswhere found no Visual Studio instance.
  Native Clipboard code has not been compiled or executed here.

Logs: test-artifacts/phase05-verify-final.log (current final pass),
phase05-verify-integration.log (integration failures), phase05-verify-initial.log
(initial stale assertions). Detailed sources and focused evidence are in the
phase05 selection, grip, Clipboard and integration notes. Local artifacts are
ignored by Git.

### Manual acceptance and remaining work

See [the keystroke-by-keystroke sequence](phase05-integration-notes.md#current-build-manual-sequence)
for all five original acceptance scenarios, basic Properties and selection
settings. The current browser build implements these scenarios. Installed Korean
AutoCAD comparison remains pending for exact prompt punctuation, visual glow,
hover timing, overlap order, adjacent grip dimensions and default clipboard bounds.
TEXT schema, full Properties customization and opaque foreign-object preservation
retain their documented later-phase limits.

Exact next step: prepare MSVC x64 C++ tools and Windows
SDK, pass `pnpm check:desktop` and the locked native cargo check, then exercise
COPYBASE/PASTECLIP between two native HanCAD windows, JSON+PNG/DIB formats,
clipboard failure/cut safety and desktop-reserved shortcuts. Preserve actual
Windows IME/startup checks from Phase 00 as pending. Phase 05 is not fully accepted
until the required native checks pass; the last accepted whole-phase baseline
remains Phase 04. Phase 06 awaits a separate user request.

## Completed phase: Phase 04 coordinate input and drafting aids (2026-10-17)

Source: `docs/prompt-source/prompts/phase-04-coordinate-input-and-drafting-aids-line-as-the-reference-com.md`.
Resumed at the user's request and completed through the final integration audit.
At that checkpoint Phase 05 had not started. Pre-existing protocol edits in
AGENTS.md and the prompt copies remain outside the feature commit.

| Milestone                               | Status | Scope                                                                                                                        |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 4.1 Coordinate input and LINE           | Done   | Unit/angle formats, optional Z, filters/FROM/M2P/TT/TK, source priorities, continuation, U/C and deferred previews           |
| 4.2 Object snaps                        | Done   | All 14 modes, all six required curve families and 21 intersection pairs, native sources, acquired/deferred modes and markers |
| 4.3 Drafting constraints and tracking   | Done   | Cached index, Ortho/grid/polar/isometric constraints, seven-point hover acquisition, paths and live variables                |
| 4.4 Dynamic input and drafting settings | Done   | Physical-key focus, pointer/dimension locks, Tab/Down, DSETTINGS/OSNAP/-OSNAP and canonical aid commands                     |
| 4.5 Acceptance and integration          | Done   | All five original acceptance items, comprehensive verification, current-build UI inspection, performance and round trips     |

### What changed

LINE shares unit-aware coordinate parsing with dynamic input and queued sessions.
All original syntax, optional elevation, modifiers, OSNAPCOORD source priority,
continuation/local undo and deferred tangent/perpendicular previews are covered.
Supported normalization/recovery/DXF retains optional Z and stored doubles; this
remains XY display and supported-entity I/O rather than complete 3D/lossless I/O.

Prepared curves and an R-tree are cached between pointer moves. Native/legacy
sources include block transforms, dimensions and hatch boundaries. The editor
owns candidate cycling, stationary hover acquisition/re-hover removal, seven
points, alignment crossings, extension/parallel paths and two-pick extended INT.
Conic extension paths clip to the current viewport and bound tessellation work.
Exact snaps, live constraints, dynamic locks and noneditable IME-safe focus share
one accepted-point pipeline. Empty tooltip regions pass clicks to the drawing.

DSETTINGS remembers seven tabs and status-specific entry. OSNAP/-OSNAP and
GRID/SNAP/ORTHO/ISOPLANE/ISODRAFT execute through the common command registry.
SNAPGRIDLEGACY defaults to modern point-prompt-only grid snapping; Legacy also
shows idle snapped crosshairs. Settings for later 3D/grip/quick-property/selection
editors are stored without claiming those editor features are implemented.

### Final verification evidence

The final comprehensive `pnpm verify` pass ran against the new production build
with HANCAD_PRODUCTION=1 and HANCAD_RUNNING_APP=1 (the existing local server serves
current dist without caching). Results:

- WASM build and round-trip smoke passed; lint, formatting and strict TypeScript
  passed. All 740 unit tests in 98 files and all 30 compatibility tests passed.
- Command documentation drift check passed for 376 commands; the additional
  sysvar drift check passed for 864 definitions and 214 DXF header mappings.
  Frozen offline workspace lockfile validation passed; no dependency upgrade
  was selected. The browser production build passed.
- Renderer validation passed 28 scenes, 37 exact color contracts, 3 viewport
  boundary contracts and 20 high-zoom comparisons. Translated large-coordinate
  scenes remained identical; maximum compositing channel error was 1.
- Full browser pass: 116 passed, one failed and one skipped. The only remaining
  failure was a progress-dialog test expecting the old Phase 02 limitation text.
  Updating that stale assertion to Phase 04 and rerunning the failed test passed.
  The final unique browser result is 117 passed and one skipped out of 118.
  The skipped check requires the optional HANCAD_DWG_PATH personal drawing;
  official DWG and supported DXF round trips passed independently.
- The earlier integration pass exposed tooltip interception during navigation,
  DIM and TEXT picks. Actual screen cursor positioning, pointer pass-through and
  explicit-focus reset fixed those failures; all affected cases passed in the
  final complete browser pass. Explicit menu snap testing now rejects an invalid
  typed sample before accepting a valid one and verifying one-pick expiry.
- New browser checks cover every original acceptance item, physical IME-code
  input, Shift+E/Shift/F-keys, stationary two-endpoint alignment crossing,
  length/angle locks, typed keywords/modifiers, initial <angle input, settings
  routing and canonical command prompts. A pixel probe verifies immediate LINE
  preview redraw after locking, before another mouse move.
- Cached 20,000-entity snap query p95 remains below 4 ms in its fixture. A
  radius-1e9 conic at scale 262144 produces fewer than 128 visible points, stays
  within a 0.25-pixel chord error and passes a 100-query p95 below 4 ms. Full output
  is bounded to 4,097 points to prevent unbounded display work.
- Actual Edge production screenshots of locked dynamic fields and all seven
  drafting settings tabs were inspected at test-artifacts/phase04-production/.
  Final documentation/status presentation changes are rebuilt and checked with
  the affected progress-dialog test after this comprehensive pass.

Logs: test-artifacts/phase04-verify-final.log; screenshots and other artifacts
remain local and ignored by Git. Detailed official references, assumptions and
focused failures/fixes are in phase04-coordinate-notes.md,
phase04-snap-notes.md and phase04-dynamic-notes.md.

### Manual acceptance steps

1. Refresh the running app. Type `L` Enter, `100,50` Enter, `@100<30` Enter,
   `#0,0` Enter, then Enter. Two LINE entities result; `U` Enter removes both
   and `REDO` Enter restores both as one command group.
2. Type `DYNMODE` Enter, `3` Enter; type `L` Enter, `0,0` Enter. Move the cursor,
   type `100`, press Tab, type `30`, press Tab, then click and press Enter.
   Both fields lock and the endpoint is (86.6025403784, 50) in WCS. F12 toggles
   dynamic input. Explicit command-line `<30` Enter followed by `100` Enter
   locks the same direction; initial canvas Shift+Comma remains Center.
3. Draw lines (40,0)-(70,0) and (0,60)-(0,90). Set OSMODE=1, AUTOSNAP=63 and
   POLARMODE=0. Start LINE; hover (40,0) and (0,60) for about 400 ms each until
   plus markers appear, then move near (40,60). Two tracking paths and a tooltip
   appear; clicking chooses the exact crossing. F3/F8/F10/F11 toggle the aids.
4. Type `DS` Enter. Verify seven tabs, change SNAPANG to 45 and accept; reopen
   to confirm the remembered tab. Right-click a status toggle and choose Settings
   to open its tab. Try `SNAP` Enter, `S` Enter, `I` Enter, `10` Enter; F5 cycles
   isoplane cursors. `ISODRAFT O` Enter returns to orthographic style.

### Remaining reference differences and exact next step

Installed AutoCAD comparison remains pending for exact Korean wording, 400 ms
acquisition/sensitivity, isometric spacing, near-tied candidate order, original
marker/tooltip appearance, spline extension/radial perpendicular assumptions,
canonical aid subprompts and complete ISODRAFT numeric-state restoration. The
current editor has no arbitrary UCS or active face-based dynamic UCS; negative-Z
OSOPTIONS suppression is exercised through the pure geometry API when active
UCS metadata is explicitly supplied. Windows-native startup/real IME checks from
Phase 00 remain deferred. These limits are recorded in PARITY_CHECKLIST.md.

The user subsequently authorized Phase 05; its active milestones and current
verification evidence are recorded at the top of this document.

## Completed phase: Phase 03 command system, command line, shortcuts and Korean IME (2026-10-17)

Source: `docs/prompt-source/prompts/phase-03-command-system-command-line-shortcuts-korean-ime.md`.
The user requested Phase 03 on 2026-10-16. The baseline passed lint, formatting,
strict TypeScript, 402 unit and 30 compatibility tests before work started.
Reference facts come from the Autodesk 2026 Korean help pages for temporary
override keys, shortcut keys, macro control characters, DIESEL, the status bar,
shortcut menus, command aliases/AutoCorrect and the command window.

| Milestone                                 | Status | Scope                                                                                                                                  |
| ----------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Command catalog and aliases           | Done   | Canonical/global names, Korean/English names and help, flags, implementation status, completed acad.pgp aliases, generated COMMANDS.md |
| 3.2 Input parsing and ImeController       | Done   | Prompt input modes, Hangul normalization, Space/Enter rules, PGP grammar incl. external commands, transparent-command rules            |
| 3.3 Command line window                   | Done   | Floating/docked bar, temporary prompt lines, F2/Ctrl+F2/Ctrl+9, command-name prompt, history recall, right-click menu                  |
| 3.4 AutoComplete and input search options | Done   | Suggestion list, auto-append, mid-string, sysvars, frequency order, delay, AutoCorrect DB, INPUTSEARCHOPTIONS dialog                   |
| 3.5 Transparent commands                  | Done   | `>>` prompts for 'ZOOM/'PAN/'SETVAR/sysvars/'DIST; HELP panel; pending CAL/OSNAP report and resume                                     |
| 3.6 PGP import, ALIASEDIT and REINIT      | Done   | User acad.pgp import/merge (user wins), persistent profile copy, ALIASEDIT dialog, REINIT/RE-INIT reload                               |
| 3.7 Macros and DIESEL                     | Done   | ^C^C, ;, space, \ pause, \*^C^C repeat, $M=, ^P and other controls; DIESEL evaluator; MODEMACRO; ribbon macros                         |
| 3.8 Keyboard bindings and overrides       | Done   | Every SHORTCUTS.md binding with ordered scopes, toggle messages, TEMPOVERRIDES key-down/key-up macros                                  |
| 3.9 Mouse and shortcut menus              | Done   | SHORTCUTMENU bits, time-sensitive right click, Korean default/edit/command menus, Shift+right-click object snap menu                   |
| 3.10 Status bar and F1 help               | Done   | All toggles with icons/menus, COORDS display, customization menu, F1 Korean help panel, phase acceptance                               |

### Completion and exact next step (2026-10-17)

Phase 03 implementation and browser acceptance are complete. This section
supersedes the older Phase 03 resume instructions below. Phase 04 subsequently
started and is now complete; its acceptance evidence and next step are at the top
of this document. Original Phase 00 native acceptance and installed-AutoCAD
comparison remain unverified.

Delivered 3.8-3.10: focus-safe temporary key overrides with physical Shift release
handling; Alt ribbon/application/quick-access keytips; contextual default/edit/
command menus and timed right-click; Shift/right and MBUTTONPAN=0 snap menus;
single-use supported snap modes through drafting, edits and transparent navigation;
16 status toggles with original icons, settings and visibility preferences;
COORDS 0/1/2 and actual accepted LASTPOINT, plus explicit unavailable geographic
display; context-sensitive Korean/English registry help via F1/HELP.

Final verification used the fresh production build, not Vite HMR:

- `pnpm verify` ran WASM, lint, formatting, strict TypeScript, 558 unit tests,
  30 compatibility tests, command-doc drift, web build, renderer goldens and all
  107 E2E entries. Every non-E2E check passed. Renderer QA passed 28 scenes,
  37 exact-color contracts, 3 viewport-boundary contracts and 20 high-zoom
  precision comparisons; translated scenes were identical.
- Initial E2E result: 103 passed, 3 failed, 1 opt-in skip. The old MBUTTONPAN=0
  navigation test needed to dismiss the newly required snap menu. Two single-line
  selection tests exposed a camera-helper race: it sampled the camera between
  the asynchronous ribbon macro's ZOOM and Extents steps. The helper now waits
  for typed ZOOM's prompt and completion before reading the camera. Ribbon
  macro behavior remains covered by the independent macro tests.
- After these test-only corrections, all 40 E2E tests using that shared helper
  passed against the same production build (including all three failures).
  Across the comprehensive run and affected rerun, all 106 enabled E2E tests
  passed; the user-specified private-DWG opt-in test was not run. The complete
  `pnpm verify` command was not repeated after these test-only corrections.
- `pnpm docs:sysvars:check` passed for 860 variables/214 headers. Final lint,
  formatting and documentation drift checks cover the corrected tests/docs.
- The final in-app progress data now records Phase 03 completion and its native
  limitations. After this data-only update, the production web rebuild and the
  bilingual progress-dialog E2E passed (1 test). No drafting code changed after
  the comprehensive run.
- Browser UI inspection verified F1 during LINE and return to its original
  prompt, Shift/right snap menu, status customization and Alt tips, including
  1280x720 layout. Screenshots are in `test-artifacts/phase03-manual/`; run logs
  are `phase03-verify.log` and `phase03-affected.log` in `test-artifacts/`.
  Existing drawing geometry was preserved during this inspection.

All seven original acceptance items have browser coverage: IME physical-key and
Hangul reversal in `command-input.spec.ts`; free-text composition in
`text-creation.spec.ts`; OSMODE completion in `autocomplete.spec.ts`; imported PGP
and REINIT in `pgp-files.spec.ts`; F/Ctrl toggles in `keyboard.spec.ts`; transparent
ZOOM in `transparent-commands.spec.ts`; right-click Enter and Shift menu in
`mouse-menus.spec.ts`. Synthetic composition does not certify actual Windows IME
candidate placement, Hanja or native WebView2 key routing. These remain explicit
native/reference checks, not claimed passes.

Remaining scope boundaries: cursor dynamic-input fields/Down menus, complete
object snaps and DSETTINGS/-OSNAP belong to Phase 04; CAL's functions belong to
Phase 15. Their transparent invocation currently reports the pending command and
resumes correctly. Advanced snap-menu entries are explicit pending features;
letter mnemonics for that placeholder menu and exact Korean wording require
reference comparison. Later drafting toggles change their variables and identify
pending behavior. Phase 03 does not claim those later features are implemented.

Manual smoke sequence: type `SHORTCUTMENU`, Enter, `0`, Enter; `L`, Enter,
`0,0`, Enter, `100,0`, Enter, right-click to finish. Start `L` again and press F1,
then Esc to return to LINE. Shift+right-click opens the snap menu. Esc cancels;
Alt, H, L, I starts LINE through ribbon tips. Status buttons toggle with left
click, expose settings with right click, and the far-right customization menu
shows coordinates and extra controls. Restore `SHORTCUTMENU` to 11 afterward.

### Historical execution plan (2026-10-17)

Resume Phase 03 at 3.9. Implement the drawing-area shortcut-menu policy and menus,
one-shot object-snap overrides, then complete 3.10 status controls and registry
help. Audit 3.8 keyboard behavior in parallel. Add feature-level coverage during
implementation; keep comprehensive validation pending until the implementation
is complete. Then run `pnpm verify`, exercise the current application, resolve
failures, update phase evidence and commit the verified Phase 03 work. Preserve
the existing user-authorized protocol/document changes. Phase 04 is out of scope.

### Historical resume handoff (2026-10-16; phase-end verification)

The user requested a saved continuation plan and then authorized a protocol
update: implement the remaining phase work before comprehensive verification.
Only prompt and handoff documents were changed; no application implementation or
test run was performed for this update. The application checkpoint is `8bee8ab`
(`wip(phase3.8): keyboard bindings and temporary overrides, paused at user request`).

- Current phase: original Phase 03, milestone 3.8. Milestones 3.1-3.7 are Done;
  3.8 is implemented but still needs complete verification. Continue with 3.9
  implementation; carry 3.8's pending verification into the final phase pass.
- Remaining in this phase: implement 3.9 mouse/shortcut menus and 3.10 status
  bar/F1 help, then verify 3.8-3.10 together with all seven original acceptance
  checks and existing-feature regressions. Seven of ten milestones are accepted;
  this count is not an effort-based completion percentage.
- Overall roadmap: Phase 00-25 contains 26 phases. Phases 01 and 02 are complete;
  Phase 00 native acceptance remains deferred and unverified. After the remaining
  Phase 03 work, Phases 04-25 (22 phases) still require completion, even where
  later-phase adapters already provide some functionality. No reliable remaining
  time estimate follows from the phase count alone.
- Next phase after Phase 03 acceptance: Phase 04 coordinate input and drafting
  aids, using LINE as the reference command.

The detailed 3.9/3.10 implementation and final verification plan appears below.
This active-phase section takes precedence over historical handoffs elsewhere.

### Milestone 3.3 command window (2026-10-16)

The user paused 3.3 as work in progress and asked to continue the same day.
Delivered in `apps/web/src/command-line/`: the AutoCAD-style translucent floating
bar (grip, × with close confirmation, wrench customize menu, recent-commands menu,
command name before the prompt, keyword buttons with hidden slashes), temporary
prompt lines (CLIPROMPTLINES, fade after 5 s), F2 expanded history (floating) or
text window (docked), Ctrl+F2 and TEXTSCR/GRAPHSCR text window, Ctrl+9 and
COMMANDLINE/COMMANDLINEHIDE, drag-to-dock with the drawing area shrinking, the
transparency dialog and the right-click menu (recent commands, copy, copy history,
paste, paste to command line, options). `menus/ContextMenu.tsx` is shared by later
menus; Up/Down recall uses `InputHistory` per prompt context.

The four E2E failures at the pause were not a pick bug: the floating bar covers the
bottom of the drawing area exactly as AutoCAD's does, and those tests clicked
objects on the bottom edge of a ZOOM Extents view. The shared `mapping` helper now
zooms 0.8X after Extents. A real bug surfaced while testing docking: equal CSS
specificity let `workspace.css` override the docked inset, so a docked window
covered the drawing instead of shrinking it; the rule is now scoped under
`.workspace`.

Verification: lint, formatting, strict TypeScript, 486 unit, 30 compatibility,
the command-doc drift check and the production build pass; E2E runs against the
rebuilt production app with 67 passed and one opt-in skip (new
`command-window.spec.ts` covers COMMANDLINEHIDE, TEXTSCR, Ctrl+F2, the close
confirmation, docking with drawing-area resize and persistence, and the right-click
menu).

Note: `HanCAD 실행.cmd` leaves `scripts/serve-app.mjs` serving `apps/web/dist` on
port 1420, and Playwright reuses that server. Run `pnpm build:web` before E2E so
the tests exercise current source.

### Milestone 3.4 AutoComplete and input search options (2026-10-16)

Delivered: the suggestion list above the command input (after INPUTSEARCHDELAY),
inline completion of the top prefix match, exact/alias-first ranking with prefix,
mid-string and AutoCorrect tiers in frequency or alphabetical order, system
variables in the same list or a separate Tab list, transparent-only suggestions
for apostrophe input inside commands, Up/Down/Tab/Shift+Tab/Backspace/mouse
handling, AutoCorrect learning after n corrections (AutoCorrectUserDB.pgp form,
applied to every open drawing), profile storage of options and usage counts, the
INPUTSEARCHOPTIONS dialog, -INPUTSEARCHOPTIONS prompts, and the Input Settings
flyout in the customize and right-click menus. Commands with their own prompt
sequence share `CommandDefinition.nextPrompt` (UNDO, MREDO and
-INPUTSEARCHOPTIONS). Content search stores its settings, and the dialog states
that its results arrive with the layer, style, hatch and block phases. The
`DrawingNotices` component was split out of DocumentApp to keep that file near
the 400-line limit.

Verification: lint, formatting, strict TypeScript, unit, compatibility and
command-doc checks, the production build and the full E2E suite (including the
new `autocomplete.spec.ts`) pass: 505 unit, 30 compatibility and 72 E2E tests
(one opt-in skip).

### Milestone 3.5 transparent commands (2026-10-16)

Delivered: apostrophe entries inside any running command with the outer-prompt
echo, `>>` prompts and `LINE 명령 재개 중.`; 'ZOOM/'PAN (navigation), 'DIST
(measurement takes priority over the interrupted command), 'SETVAR, 'GETVAR and
'variable names (a nested session prompt slot), and other transparent commands
through the runner, with unimplemented ones reporting and resuming. Nested,
self-interrupting and non-transparent entries are refused with AutoCAD's message.
Esc cancels the whole command stack once. Command-line routing moved from
DocumentApp to `useCommandRouting`. LINE now offers Close only from its second
segment, as AGENTS.md specifies.

Verification: lint, formatting, strict TypeScript, unit, compatibility and
command-doc checks, the production build and the full E2E suite (including the
new `transparent-commands.spec.ts`) pass: 506 unit, 30 compatibility and 76 E2E
tests (one opt-in skip). One full run hit a timing flake in the VTFPS=1 animation
test (`view-navigation.spec.ts:77`); it passed 5 isolated and 3 parallel reruns.

### Milestone 3.6 PGP import, ALIASEDIT and REINIT (2026-10-16)

Delivered: the user's acad.pgp chosen in ALIASEDIT (File System Access handle when
available, file input and stored copy otherwise), merged over the built-in aliases
with removable built-ins; REINIT (PGP file option) and RE-INIT 16 re-read the file
on disk and report unreadable lines; ALIASEDIT tabs for command aliases, external
commands, the AutoCorrect list and a synonym list, with line-preserving edits written
back to a linked file; UTF-8/CP949 detection for support files; synonyms in the
suggestion list. Acceptance item "My own acad.pgp imports and its aliases work
right after REINIT" passes in `pgp-files.spec.ts` with a mocked file on disk.

Verification: lint, formatting, strict TypeScript, 517 unit, 30 compatibility and
the command-doc checks, the production build and 79 E2E tests (one opt-in skip)
pass.

### Milestone 3.7 macros, DIESEL and MODEMACRO (2026-10-16)

Delivered: the CUI macro language (^C, ;, Space, \\ pause, automatic trailing
space, ^Z, *^C^C repeat, $M= DIESEL, ^B/^G/^O toggles, ^P/MENUECHO, ^Q, ^M/^H/^I,
explicit messages for the remaining controls); ribbon, menu and button commands
run as `^C^C_NAME` macros and the extents button as the transparent `'_zoom _e`;
a DIESEL evaluator with the documented functions and error forms; MODEMACRO in the
status bar; DEVMACRO for tests; free-text prompted command steps. An apostrophe
entry at the idle prompt now runs as an ordinary command.

Verification: lint, formatting, strict TypeScript, 527 unit, 30 compatibility and
the command-doc checks, the production build and 83 E2E tests (one opt-in skip)
pass.

### Milestone 3.8 keyboard bindings and temporary overrides (2026-10-16)

Delivered: every Reference B function key, Ctrl shortcut and Delete as a binding
table (macros, toggles, shell actions) resolved after text editors, dialogs and the
command line; shared drafting toggles with `<… 켜기/끄기>` echoes, ortho/polar
exclusion and live status-bar buttons; Ctrl+J/M repeat, drawing and layout
switching; TEMPOVERRIDES keys at point prompts as an effective-value layer; the
input wiring moved from DocumentApp into `useCommandInput`. Acceptance item "F3,
F7-F12 and Ctrl+B/E/F/G/L/U/W flip the right sysvars and status-bar buttons"
passes in `keyboard.spec.ts`.

Paused at user request (2026-10-16) before the milestone was accepted. Lint,
formatting, strict TypeScript, 533 unit tests, compatibility and command-doc checks
passed; the new `keyboard.spec.ts` (3 tests) passed on its own; the full E2E run
was interrupted with progress reaching 48 of 87 test entries. The pasted log has
no final E2E summary, so it does not establish 48 successful tests or a successful
full run. The work is committed as `8bee8ab` (`wip(phase3.8)`).

Exact next step for the next implementation session: read the root `AGENTS.md`,
this active-phase section, `ARCHITECTURE.md`, `SHORTCUTS.md` and the Phase 03
prompt, then implement 3.9 followed by 3.10. Under the user's updated protocol,
do not run a full baseline before 3.9 or repeat full checks at each milestone.
Use typechecking and brief checks of the changed core behavior during
implementation; use focused tests when needed for a bug or complex change.
Add meaningful test coverage alongside the features and keep 3.8's final
verification pending.

After the remaining Phase 03 implementation is finished, run the comprehensive
verification once, including 3.8, existing-feature regressions and all seven
Phase 03 acceptance items. In PowerShell:

```powershell
$env:HANCAD_PRODUCTION = '1'
$env:HANCAD_RUNNING_APP = '1'
pnpm verify
```

`pnpm verify` includes WASM, lint, formatting, strict TypeScript, unit and
compatibility tests, command-doc checks, a fresh web build, renderer goldens and
the full E2E suite. The launcher serves `apps/web/dist` on port 1420; the rebuild
must finish before testing against that server. Reuse an existing server only
after confirming that it serves this workspace's production build; otherwise
stop the stale server or remove `HANCAD_RUNNING_APP` and let Playwright start it.

Exercise the keyboard bindings, text/dialog focus priority, temporary override
press/release, shortcut menus, status bar and F1 help in the running app. Fix
failures and rerun the failed and affected checks; repeat the full pass only
when changes or unresolved concerns justify it. When every required check
passes, record the actual totals, accept 3.8-3.10 and Phase 03, finish the docs
and commit the verified work, preserving the WIP commit. Do not start Phase 04
without a user request.

Implement the remaining milestones in this order, batching comprehensive
verification and final documentation at phase completion:

- 3.9 Mouse and shortcut menus. Right-click on the drawing area (none today; the
  browser menu appears): SHORTCUTMENU bits 1/2/4/8 choose default, edit and command
  menus, otherwise right-click is Enter; bit 16 with SHORTCUTMENUDURATION makes a
  quick click Enter and a long press the menu. Korean menus: default (반복 <명령>,
  최근 입력, 클립보드 ▸, 분리 ▸, 명령 취소, 명령 복구, 초점이동, 줌, 빠른 선택...,
  빠른 계산기, 찾기..., 옵션...), edit (adds 지우기, 이동, 선택 복사, 축척, 회전,
  그리기 순서 ▸, 그룹 ▸, 선택 항목 추가, 유사 객체 선택, 모두 선택 해제, 특성,
  빠른 특성), command (입력, 취소, 최근 입력, current prompt keywords, 스냅 재지정 ▸,
  초점이동, 줌, 빠른 계산기). Shift+right-click and MBUTTONPAN=0 middle click open
  the object snap menu; endpoint, midpoint, center, quadrant, intersection,
  nearest and 없음 set a one-shot override for the next pick (extend
  `temp-overrides.ts`, clear it after the pick), other entries print the
  not-implemented message, and at a non-point prompt an entry submits `_ENDP`
  etc. as AutoCAD does. Reuse `menus/ContextMenu.tsx`; menu commands go through
  `useCommandInput().execute` (macros). The official Korean menu wording was not
  verified yet; list it in PARITY_CHECKLIST.md.
- 3.10 Status bar and F1 help: every toggle with icons and right-click settings
  menus, COORDS display modes, the customization menu to show or hide items, and
  F1 (now `'_HELP`, not implemented) opening a Korean help panel for the active
  command from catalog metadata. Then check all seven Phase 03 acceptance items and
  write the Korean phase report.

Phase 03 acceptance status: IME command entry, free-text composition, OSM
AutoComplete, acad.pgp + REINIT, F-key/Ctrl toggles and transparent 'Z pass in
E2E; right-click as Enter and the Shift+right-click menu remain for 3.9.

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
