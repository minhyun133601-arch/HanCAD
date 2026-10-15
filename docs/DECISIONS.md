# Decisions

## 2026-10-15: Complete the next bootstrap diagnostic boundary

Continue Phase 00 only, as the user explicitly reaffirmed sequential phase
completion. Importer messages have stable namespace/code identities with typed
parameters; dynamic line numbers, limits and nested geometry reasons are data,
not parsed Korean strings. Preserve legacy fallback text and callbacks for
existing importer consumers. Fatal entity limits use identities instead of a
language-dependent regular expression.

Format current progress and persisted warning identities at display time so
changing the shell language also changes an ongoing read and a recovered report.
Untyped external diagnostics and old warning-only caches retain their original
text. Validate optional aligned warning metadata before publishing any recovered
drawing. File failure/cancellation must preserve the existing drawing and view.

Canvas initialization failures release resources and display a catalog-based
alert while the command line remains available. Export, command value and Editor
queue failures use typed domain errors. Inject app error presentation into the
headless runner so registered export failures do not become untranslated strings
before reaching the UI. UI catalogs may consume legacy-bridge diagnostic types
and guards without invoking the CAD runtime. No dependency is installed and no
parser, converter or drawing behavior is introduced by this diagnostic work.
Visual QA at 1280x720 exposed overlapping English ribbon buttons. Retain the
bootstrap ribbon's existing button/tooltip content while giving buttons a stable
width and constraining label ellipsis to that width. Full adaptive ribbon
customization remains its original later-phase requirement.

The refreshed native prerequisite inventory still lacks MSVC and the Windows
SDK. Respect the earlier automatic approval rejection (`blocked by policy`);
do not install through another route. Native Korean shell startup, the 1280x720
minimum and saved position/size remain Phase 00 acceptance blockers. Browser
verification does not satisfy those items, and Phase 01 must not start.

## 2026-10-15: Restore strict original phase order

The latest user instruction explicitly requests the supplied prompt order. It
supersedes the earlier practical feature priorities and the recorded Phase 7.3
handoff. Keep existing later-phase functionality and tests; implement new work
only in the earliest unfinished phase. Phase 00 remains open until its actual
native acceptance and remaining i18n requirements are verified.

Read-only inspection confirms no installed MSVC instance or Windows SDK on this
PC. The existing automatic installation rejection (`blocked by policy`) is still
respected. No packages are installed in this reconciliation. Bootstrap work can
improve prerequisite detection and localize the progress dialog while native
acceptance remains pending. Later diagnostic strings still require localization;
neither these corrections nor browser tests complete the whole phase.

Bootstrap localization also covers known SystemVariableError diagnostics in
headless commands and browser UI. Keep validation and storage unchanged, retain
Korean fallback diagnostics for existing API consumers, and carry reason/range/
symbol-reference data to typed message catalogs. Unrecognized exceptions remain
unchanged; do not translate arbitrary strings or erase their diagnostic content.
Importer errors/progress/warnings and renderer failure presentation remain open
Phase 00 i18n work. Their remaining hardcoded text prevents a universal-language
acceptance claim even though normal shell and typed variable errors are bilingual.

The pinned window-state 2.5.0 implementation restores and shows the initially
hidden main window by default; the official
[window-state usage](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/window-state)
documents automatic restoration after plugin registration. Keep the existing
plugin setup rather than adding an unverified second restoration path. Actual
startup and saved position/size require the missing native toolchain.

## 2026-10-15: Continue essential editing and single-line Korean text

The continuation follows the exact next step in PROGRESS and the saved Phase 07
and Phase 10 prompts. Their complete original acceptance is still pending. The
delivered subset is TRIM/EXTEND for LINE targets, supported finite 2D boundaries,
basic OFFSET and left-baseline TEXT/DTEXT. No new dependency or converter is needed.

Autodesk's [Korean TRIM reference](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-B1A185EF-07C6-4C53-A76F-05ADE11F5C32.htm)
defines Quick/Standard, all-boundary defaults, Shift alternate operation, fences
and local Undo. Quick trim deletes an otherwise untrimmable supported LINE;
Standard reports no intersection. Actual dragged paths are finite fences. LINE,
polyline, rectangle, circle and arc boundaries are supported, including visible
locked boundaries. Only editable LINE targets are modified. Project, Crossing,
Erase, hatch boundaries and non-LINE targets remain pending; no 3D projection is
implied by this model-space subset. EDGEMODE permits implied straight boundary
extensions. The new [TRIMEXTENDMODE](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-52B3803E-FADC-4D7B-9BF2-A176C7FB7535.htm)
uses profile scope/default 1 (Quick), with 0 selecting Standard.

[OFFSET](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-LT/files/GUID-C0E4246D-C420-42BD-A6FC-8B1852EFD005.htm)
uses remembered distance/Through, Erase, Source/Current layer, Multiple and Undo.
Supported lines/circles/arcs are exact; straight open and convex closed polylines
support miter joins with OFFSETGAPTYPE 0. Self-crossing/concave/collapsed/topology-
changing results and gap types 1/2 are explicitly rejected. Curved polylines,
cavalier_contours integration, ellipses/splines/xlines/rays remain pending.
Multiple uses the most recent result as its next source; Enter returns to object
selection. Accepted offsets enter one command transaction. Autodesk documents
[OFFSETDIST](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-Core/files/GUID-4296AA53-76EF-4BDA-8B73-1AF08EA0B523.htm)
as not saved, default -1/Through. The prior drawing-scoped definition is corrected
to session scope; NEW keeps it and application reload resets it.

[TEXT](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-D1C664DD-63D9-467E-8EC1-2F5A1777A924.htm)
creates independent lines at a baseline point, height and rotation. The current
subset uses an inline Korean composition input and existing local TrueType/browser
fallback rendering. Readable editing size is clamped to 12-64 CSS pixels and is
horizontal; final model rotation/height remain unchanged. The provisional 1.25-height
line advance and cap-height/font metrics require installed-reference comparisons.
Height is limited to the transitional model's 0 < height <= 1000 and each line to
2000 UTF-16 code units; invalid entries and capacity overflow are rejected before
mutation. Justification/style options, TEXTED/DTEXTED alternatives, SHX/BigFont,
control codes, in-place existing-text editing and full MTEXT remain pending.
Esc discards current text while retaining accepted lines; a height accepted before
Esc is remembered atomically even if no lines were created.

Browser profile scope persists in a separate validated local preference cache,
including TRIMEXTENDMODE/EDGEMODE/OFFSETGAPTYPE. It neither saves drawing/session
values nor creates drawing undo records. TEXTSIZE uses a document-ID-scoped overlay
for standalone edits and is refreshed on complete cache publications. A regression
found that an Undo overlay could otherwise override a newer Redo snapshot; browser
tests now cover both normal/empty TEXT and foreign-document overlay isolation.

## 2026-10-15: Make the basic drawing workflow reliable

The user's priority is dimensions, endpoint recognition, dragging and wheel
navigation. This slice adds exact snaps, true intersections, directional rectangular
selection, selected-object drag/move/Ctrl-copy, MOVE/COPY and read-only DIST. It
does not claim complete Phases 2/4/5/7/11/15 acceptance.

Autodesk's [Korean object-snap reference](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-50383F73-4F23-4F70-B4FC-52D5748D80AF.htm)
defines endpoint/corner, midpoint, center, quadrant and true intersection modes.
Exact object snaps bypass grid and Ortho. APERTURE controls the screen-space search
radius; AUTOSNAP bits 1/2 control markers/tooltips. Candidate selection remains
nearest-distance based. Advanced snap modes and Tab cycling require reference QA.
Intersection scanning is locally pruned, not the complete R-tree/four-ms budget.

The [pointing-device reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT-Customization/files/GUID-B1CDEE41-F8BF-48A4-A895-273DBB295378.htm)
documents cursor-centered wheel zoom, middle pan and double-middle extents.
Browser wheel events normalize 100 pixel-delta units, three line units or one page
unit to one notch, then apply reciprocal ZOOMFACTOR scaling. Mouse/browser delta
differences need reference QA. MBUTTONPAN=0 disables pan; its full snap-menu
alternative is pending. Left drag starts after four CSS pixels. This increment
implements rectangular window/crossing; default lasso, PICKAUTO/PICKDRAG, grips
and click-click selection remain pending.

Autodesk documents [selected-object dragging and Ctrl copying](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-0BFF5C5E-B1B4-4996-9AA4-57396FD6F6F2.htm)
and [two-point COPY](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-1CF9287F-06E8-4D03-8377-2E130862FE02.htm).
Initial MOVE/COPY supports selection, base/second points, exact coordinates, Ortho,
snaps, direct distance and repeated copies. COPY placements are one undo group,
retained when Esc ends accepted placements. Full COPYMODE/Array/Undo/Displacement
options are pending. Coordinates remain exact; dimensions remain non-associative.

[DIST](https://help.autodesk.com/cloudhelp/2024/KOR/AutoCAD-Core/files/GUID-A72EADC7-EF79-463C-B4F1-862C6139B004.htm)
reports two-point distance, WCS deltas and XY angle without document mutation.
LUPREC/AUPREC/ANGBASE/ANGDIR are read; display is initially decimal millimeters and
degrees. Other unit formats/Multiple/transparent nesting remain pending. Dimension
point input also accepts direct distance along the cursor, relative to the most
recent definition point; verify that reference for each placement prompt. Empty
clicks at dimension entity prompts leave the prompt active.

## 2026-10-14: Measure complete paint and remove repeated drawing allocation

The first retained-path benchmark exposed a misleadingly small geometry submission
time: some frames submitted in 7-42 ms but took several seconds to reach paint and
readback. Copying the backing canvas synchronized expensive queued raster work;
initial transient JavaScript allocation also exceeded 2 GB. A callback or path
submission timer alone is insufficient performance evidence.

Static drawing now renders directly to the main canvas, with a transparent canvas
for previews/snaps. Display-only adaptive paths bound geometric deviation to
0.25 CSS pixels and retain only the current zoom bucket. All model entities and
export geometry remain unchanged and reappear at finer detail when zooming.
This remains a Canvas2D transition; the complete WebGL/R-tree performance budgets
are pending.

Owned reader results no longer receive another full deep clone. Direct commits
validate/normalize once, serialize once, and reuse the exact prepared session in
the synchronous journal observer. A finally block releases the temporary reference;
untrusted caches and undo/redo retain full parsing/validation. Composite metadata
remains independently copied. Large strings bypass Web Storage's likely quota
failure and use the existing atomic chunked IndexedDB path. The mandatory command
journal is retained; recovery still has one additional normalization pass.

## 2026-10-14: Deliver the initial dimension subset from Phase 11

The user requested dimension creation/display now, extending the previous usable
2D slice. DIMLINEAR, DIMALIGNED, DIMRADIUS, DIMDIAMETER, DIMANGULAR, smart DIM and a
basic DIMSTYLE dialog are implemented ahead of complete Phases 7-10. This does not
declare those prerequisites or the complete Phase 11 acceptance criteria done.
The original aliases remain authoritative: D opens DIMSTYLE; DLI/DAL/DRA/DDI/DAN
start dimension tools. Full named-style management, associativity, leaders,
tolerances, fit rules and additional dimension commands remain pending.

The ten supported style values are captured per dimension. Editing defaults does
not silently restyle imported dimensions. Explicit selected application is an
undoable operation and preserves definition coordinates and text overrides.
Measured model geometry remains independent of annotation size: [DIMSCALE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-AEA309F0-B831-4432-8085-FB6CD49CDC78.htm)
scales text/arrows/offsets, while [DIMLFAC](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-B6063785-B199-4A9A-8BD7-2108EB0AB7ED.htm)
formats linear/radial measurements and does not affect angular measurements.
DIMSCALE 0 resolves to 1 in the current model-only application; annotative and
paper-space scaling remain pending. Negative DIMLFAC is ignored in model space,
following the documented paper-space-only meaning.

[DIMZIN](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-A1860981-FE1C-4947-927B-7CD6B8CEF8EE.htm)
defaults to metric trailing-zero suppression (8); the initial implementation
supports decimal leading/trailing-zero bits, not feet/inch formatting.
[DIMPOST](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-79CCF9B1-BE33-4158-891C-50E4BF795D8E.htm)
and explicit Text overrides use the measurement placeholder `<>`. Korean free
text uses editable IME input. DIMTXT 0 fixed-font-height behavior, negative DIMGAP
text boxing and complete text fitting need later font/style work and reference QA.

DXF stores editable DIMENSION definitions, their supported style values and *D
graphics blocks. This is a supported-geometry round trip, not full original DWG
or unsupported-table preservation. Current definitions are non-associative even
though DIMASSOC is a registered system variable.

The emitted style fields were checked against Autodesk's [DIMSTYLE group codes](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-F2FAD36F-0CE3-4943-9DAD-A9BCD2AE81DA.htm)
and [linear/rotated dimension codes](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-F0004556-493C-48D5-8619-61D6ADF05C04.htm).
Independent tag assertions cover degree/sign conversion for rotation and text,
dimension-kind flags, supported style values, graphics-block references and
HEADER DIMASSOC = 1. Text rotation assumes World UCS; arbitrary UCS and associative
OBJECTS records remain pending. No installed AutoCAD regeneration test was performed.

## 2026-10-14: Launch from the interactive CMD

The user reported that a healthy local server still did not produce a new browser
window. The detached launcher/port-reuse path delegated browser opening to a short
lived child process and only checked HTTP, which is insufficient evidence of GUI
launch. `HanCAD 실행.cmd` now directly invokes Windows `start` after server health,
using the installed Edge path or the default URL handler. Server scripts only
manage the local server. The user executed the changed CMD and confirmed that the
new browser window appeared. Headless/server checks explicitly skip GUI launch;
they must not be reported as proof of a visible window.

Native Edge launch verification through a shell was rejected by automatic approval
review with "blocked by policy". No alternate automated native launch was used
to bypass it; GUI confirmation came from the user running the reviewed launcher.

## 2026-10-14: Adopt the full supplied specification

The user's latest instructions authorize all phases and resolve overlapping
behavior in favor of the ZIP prompts. The original master prompt is installed
verbatim. Full 3D, automation, customization and desktop scope is accepted, while
each implementation phase remains subject to its acceptance criteria.

Existing implementation is preserved for reuse and rollback. The original alias
map does not apply to the new app: D means DIMSTYLE, DV means DVIEW and DRE means
DIMREASSOCIATE. Canonical commands, aliases and UI macros must share one registry.

## 2026-10-14: Deliver continuously usable new-app builds

The user clarified that the old standalone app need not remain usable: they are
switching to the new application and want to try each implemented feature. They
also explicitly require DWG opening and PDF/image conversion. Therefore the new
app is the main app, with a continuously refreshed browser build and a main
launcher. Necessary geometry and I/O code is migrated behind typed adapters;
obsolete screens, duplicated source and old launch/build paths are retired after
the replacement workflow is verified. A complete original backup is retained.

Usable DWG viewing and PDF/PNG/JPG/SVG output are delivered early as partial slices
of Phases 2, 9 and 14. This does not mark those phases complete or cancel the full
specification. The new app's progress dialog distinguishes usable features from
complete phases. The initial PDF is a self-contained A4 raster output; vector
plotting and exact scale controls remain pending and are shown to the user.

## 2026-10-14: Prioritize the usable simple 2D application

The user subsequently asked for essential features first and explicitly deferred
3D and secondary features. The immediate delivery target is local file opening,
viewing, basic mouse/coordinate drafting, selection/erase, command-level undo/redo,
DXF saving and PDF/image output. Move/copy, snapping, text, dimensions and practical
2D modifications follow before optional automation or 3D. Original prompts remain
organized separately with an implementation-order index in
`docs/prompt-source/PRIORITIES.md`. This changes priority without declaring full
phase acceptance or changing the reference behavior.

## 2026-10-14: Version selection

Versions were queried from the npm registry before installation and pinned in
`package.json` and the lockfile. Node 24.18.0 is already installed; pnpm 12.11.2 is
installed for the workspace. React 19.3.0, Vite 8.3.4, Vitest 5.0.4, Playwright
1.64.0, ESLint 10.12.0, typescript-eslint 8.71.2, Prettier 3.9.10, Tauri CLI 2.12.2
and API 2.12.3 were selected.

The latest TypeScript was 7.0.2, but typescript-eslint 8.71.2 declares support only
for TypeScript below 6.1.0. TypeScript 6.0.3 is therefore pinned as the latest
supported stable version for this verified toolchain.

Rust stable 1.99.0 and the wasm32-unknown-unknown target are installed. The official
wasm-bindgen 0.2.129 Windows binary is installed. WebView2 155.0.4283.45 already
exists. The attempted Microsoft C++ Build Tools installation command was rejected
by automatic approval review with the reason "blocked by policy"; no MSVC
installation was performed. The missing native toolchain must be recorded as a
desktop acceptance dependency, not worked around by bypassing that rejection.

## 2026-10-14: Bootstrap WASM ABI

The initial geometry proof uses a dependency-free Rust crate with raw WASM numeric
exports and a typed JavaScript adapter. This allows the browser/WASM acceptance
test to run without native host linking while MSVC is unavailable. The installed
wasm-bindgen CLI remains available for later binding generation. This does not
replace or bypass the missing native desktop prerequisite.

## 2026-10-14: Practical large-DWG capacity and visibility

The user's 27.4 MB R2000 drawing exposed the original 20,000-entity limit, then the
initial 200,000 transition limit. Parser diagnostics found 117 layers, 189 block
definitions with 357,382 internal entities, and a conservative reachable expansion
of 303,031 entities. All 1,453 INSERT records were 1x1, so this was legitimate
block content rather than array multiplication. A consistent 500,000-entity hard
ceiling is sufficient for this file; it imports 286,996 supported/approximated
entities. Oversized inputs are rejected explicitly instead of silently sliced.

Bounds use streaming extrema and visible-layer sets to limit memory/work. The
imperative renderer borrows immutable drawing snapshots rather than defensively
cloning all geometry. It must never mutate those inputs. Preview and selection
remain privately owned.

The imported layer flags can produce an initially blank drawing. Explicit LAYON
preserves an undoable layer change. When making an entirely hidden drawing visible,
the usable transition also fits it before the first paint: painting large circles
or text at an empty-drawing zoom can stall the browser. This automatic fit is a
documented transitional behavior requiring reference parity review; regular edits
preserve the current view.

Large cache data exceeds localStorage quota. Browser-local IndexedDB fallback
stores the serialized view without uploading it. OPEN/NEW supersede late restore
results, and failed cache writes must never resurrect a previous drawing.

## 2026-10-14: Resolve ambiguous input behavior

Dropping a drawing on the drawing canvas will insert it as a block once Phase 13
is implemented. Dropping it on the file-tab/open area will open a document. This
separates the Phase 9 and Phase 13 requirements without changing either operation.
Before insertion is implemented, its drop target must explicitly report that it
is unavailable rather than replacing the current drawing.

Selection follows PICKAUTO/PICKDRAG settings. A press-and-drag uses lasso when
enabled; otherwise it uses direction-sensitive rectangular selection. Record
reference-version parity checks before implementing these settings.
