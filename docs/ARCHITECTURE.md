# Architecture

Original Phases 01 and 02 are complete. Phase 00 native acceptance remains
deferred and unverified. Subsequent work stays in original phase order.
Previously delivered later-phase adapters remain supported, but their presence
does not imply acceptance of the preceding phases.

Phase 01 foundations use a native DrawingDatabase graph independently of the
transitional canvas model. Persistent hex handles, ownership, reactors, extension
dictionaries and ordered XDATA live in that graph. Nine symbol tables and the
named object dictionary own metric defaults, styles, scales and reciprocal
layout/block-record references. Model, Layout1 and Layout2 have BLOCK/ENDBLK
records; paper layouts also have viewport records. Snapshot validation checks
references, ownership cycles and optional dictionary/layout metadata while
remaining compatible with older arbitrary JSON fields.

The shared DXF schema separates editable mappings from documented opaque data.
Sixteen record types have field codecs; the remaining inventory has sourced
group-code metadata and explicitly opaque status. Numeric facts are generated
from 157 Autodesk DXF pages into 2,318 rows with code ranges, subclass/application
contexts and repeated-record notes. SCALE has common metadata only because a
standalone published code table was not found. A schema inventory does not imply
an implemented Properties palette, entmod or DXF importer. Ordered original
groups remain authoritative for unknown/repeated data; edits change only mapped
groups in their matching subclass, retaining intervening groups and per-vertex
attributes. POLYLINE headers and their owned VERTEX records remain distinct.

Pure geometry consumes canonical JSON fields through an explicit supported,
invalid or unsupported result, without a runtime database dependency. Its curve
types cover POINT, LINE, CIRCLE, ARC, ELLIPSE, bulged/width polylines, NURBS/fit
splines, XLINE and RAY. DXF OCS points use the arbitrary-axis basis; ARC angles
are degrees and ellipse parameters are radians. Inquiries provide evaluation,
closest point, bounds, length, area and affine transforms. Infinite curves and
nonplanar area have explicit results. Numerical spline/ellipse inquiries and
conservative bounds do not promise exact global minima for arbitrary high-degree
curves. Widths remain polyline attributes; length/area inquiries use the centerline.
Fit-only periodic endpoint tangents are accepted only when they match the
existing C2 interpolant; inconsistent tangents are explicitly unsupported.
Arbitrary constrained periodic fitting, natural end conditions without tangents
and exact interpolation despite a stored nonzero fit tolerance remain reference
assumptions.

The system-variable registry contains 860 distinct definitions with source links,
scope, type, description, read-only status and available validation metadata.
798 have fixed or selected metric defaults; 62 environment/document-dependent
defaults remain explicitly unavailable until a runtime provider supplies them.
214 DXF header mappings are separate from SETVAR definitions. GETVAR, SETVAR and
direct variable names share validation and bilingual diagnostics. Profile state
is shared by DocumentManager; drawing and session state belong to each document.
HANDSEED and UNDOCTL read current database state. Some numeric ranges still await
verification, including the conflicting published SELECTIONEFFECTCOLOR default
and range. Registration alone does not implement the feature controlled by a
variable. The registry generates docs/SYSVARS.md and has an offline drift check.

The database journal stores before/after changes and emits object added,
modified, erased, unerased and variable events. It supports count undo/redo,
BEgin/End, Mark/Back and Control All/None/One; UNDOCTL reflects journal flags.
OOPS restores the latest erased objects independently of intervening edits.
Auto/Combine/Layer state and grouping APIs exist, but menu macro, navigation and
layer UI integration remains pending. REDO restores the last actual U/UNDO batch
only while no intervening command has closed that window. MREDO separately retains
the remaining redo stack after informational commands or rejected input.

DocumentManager activates Drawing1, Drawing2 and subsequent documents, each
retaining its database, history, drawing variables and binary blobs. Only the
active DocumentApp owns canvas/input resources; switching documents cancels its
provisional command and remounts presentation without discarding native history.
NEW carries remembered writable session defaults into a fresh document. OPEN
creates a separate document. HCD validates both the native graph and optional
transitional view before activation; DWG/DXF use the existing lossy adapter into
a fresh default graph. Native .hcd is zipped JSON plus binary blobs, and HANSAVE
preserves the full graph. Supported-entity DXF exports remain separate and lossy.

Recovery stores the full native snapshot and blobs alongside the transitional
view, excluding the reserved view variable from the nested snapshot to prevent
recursive growth. Restored current-style overlays are applied to native drawing
variables before a clean history baseline. A shared cache publication queue and
version prevent an older document's asynchronous write/failure from replacing or
deleting the latest active recovery. Recovery persists the active document, not
the entire open document set or undo journal. HCD also reloads a clean history.

Desktop startup uses one read-only prerequisite inventory shared by
`check:desktop` and the `tauri dev/build` wrapper. It inspects the installed tools,
Rust targets, actual compiler/linker and SDK files before dispatching the Tauri
CLI. A missing native prerequisite produces an actionable failure before Vite or
Cargo starts; help/info remain available. This is discovery rather than a proof
of native compilation or window-state restoration.

Development progress data contains a mandatory ko-KR/en-US entry for each visible
feature, limitation, phase name and phase detail. A typed frontend selector resolves
the current locale; phase IDs and implementation statuses remain language-neutral.

SystemVariableError retains its code and diagnostic fallback while carrying
structured reason/range/reference details. A pure formatter accepts a typed
message contract; command and UI catalogs provide the chosen locale without
introducing a sysvars dependency on UI. Unknown external diagnostics retain their
original text. Importer diagnostics use a validated namespace/code union across
the JavaScript runtime boundary. Legacy error/progress/warning strings remain
available to existing consumers; the app stores progress identities and formats
them with current catalogs. Import reports retain index-aligned optional warning
identities through recovery, including explicit nulls for external diagnostics.
Malformed identity metadata is rejected before a drawing is published.

Renderer context failures carry main/preview/cache identities. Initialization
releases overlay canvases, pointer handlers and ResizeObservers before rethrowing;
the application removes its host canvas and displays a localized alert while
keeping the shell and command line available. Command/input and export errors use
independent typed formatters. The command runner accepts an optional presentation
callback so application command failures reach the current catalogs without a
commands dependency on UI or export packages.

The essential-editing continuation adds TrimExtendSession and OffsetSession.
They borrow the immutable baseline and own replacement shadow states for accepted
operations. The canvas displays the shadow while the recovery cache/database stay
at the previous committed command. Enter/Escape publishes the final state once;
U restores command-local operations, including an entire fence gesture. A generic
controller facade coordinates command cancellation, prompts, preview, selection
and provisional drawing ownership. Unsupported geometry is rejected explicitly.

Trim previews suppress the hovered original via a separate hidden-ID set in the
retained renderer without rebuilding its scene or making the source unpickable.
The pointer controller emits actual fence paths separately from rectangular
selection. Standard boundaries may include visible locked entities; targets remain
protected. Offset operations create fresh IDs and preserve source attributes.

TextSession owns accepted independent TEXT lines; only the current unaccepted
line lives in the inline editable DOM input. Numeric/point prompts retain physical
key input. The input follows the renderer's model-to-screen mapping, keeps Korean
composition at the caret and ignores composing Enter. Accepted lines and TEXTSIZE
share one journal transaction. Drawing-scoped text defaults use a small validated
per-document recovery overlay, avoiding a large drawing reserialization for an
isolated setting. OFFSETDIST is session-only and excluded from drawing recovery.

Browser profile settings are validated against known profile-scoped definitions
before loading from the small profile preference cache. Drawing/session/read-only
values cannot enter that cache; restoration does not create undo records. Profile
storage is independent of drawing recovery. Every complete drawing-cache publication
also refreshes the text-default overlay, so an older standalone/Undo value cannot
override a newer snapshot after Redo/reload.

HanCAD follows the supplied master prompt. `apps/web` is the browser application;
`apps/desktop/src-tauri` wraps the same frontend in Tauri. React renders application
chrome. The drawing surface is owned by an imperative renderer, not React.

Packages have explicit responsibilities and dependency boundaries documented in
their own READMEs. The database owns persistent objects and transactions, sysvars
own typed settings and scope, input owns prompt-aware keyboard normalization, and
commands execute through a registry shared by UI and headless tests. Rendering,
geometry, Editor APIs, I/O, fonts, automation and 3D have independent packages.
Unimplemented packages are documented as pending rather than exposed as working
features.

Phase 03 command input has three layers. `packages/commands/src/catalog/` is the
single source of command names, Korean/English help, flags and owning phase; the
registry, ribbon, F1 help and AutoComplete read it. `packages/input` owns
`interpretCommandInput` (command, alias, PGP external command, system variable,
repeat, transparent rules) and `ImeController`, which maps physical keys for
command/keyword/number/point/osnap/selection prompts and leaves names, free text
and file names to an editable element. `apps/web/src/command-line/` is the
command window: `CommandWindow` composes the floating or docked `CommandLine`,
the text window (F2 when docked, Ctrl+F2, TEXTSCR), the transparency and close
dialogs. Placement is a profile preference (`layout.ts`); a docked window sets
`--command-dock-height` on the workspace so the drawing area shrinks, while a
floating bar overlays the drawing like AutoCAD's and only its input row and an
expanded history take pointer input. `HistoryView` keeps one accessible log and
only changes how many recent lines are visible; `InputHistory` stores Up/Down
recall per prompt context. `menus/ContextMenu.tsx` is the shared keyboard-aware
menu for the command line and later shortcut and status-bar menus.

AutoComplete is split the same way. `packages/commands/src/input-search.ts` ranks
suggestions and computes the inline completion; `autocorrect.ts` learns
corrections in AutoCorrectUserDB.pgp form; `input-search-command.ts` implements
INPUTSEARCHOPTIONS and its command-line form through the shared
`CommandDefinition.nextPrompt` prompt sequence. In the app, `InputSearchStore`
keeps profile-wide options, usage counts and learned corrections in browser
storage; `useInputSearch` loads corrections into each drawing's registry and
builds the Input Settings menu; `useAutoComplete` owns the delay, highlight and
key handling that `CommandLine` consults before its own Enter/Up/Down/Tab
handling; `SuggestionList` and `InputSearchDialog` render them.

`useCommandRouting` decides where command-line input goes and what the window
shows: a transparent command first, then navigation, drawing tools and the
command session. `useTransparentCommands` starts apostrophe entries inside a
running command, refuses nested or non-transparent ones, and prints the resume
line when the owner (navigation, measurement or the session's nested prompt
slot) finishes. The session keeps two prompt slots, `main` for a command's own
prompts and `nested` for transparent SETVAR/GETVAR/variable prompts.

User support files: `@hancad/input` decodes support text (UTF-8 or CP949);
`pgp-edit.ts` in commands edits PGP text line by line; `PgpStore` keeps the user's
acad.pgp and synonym list per profile with an optional File System Access handle
(`support-file-handles.ts`); `PgpCommands` loads them into each drawing's registry
and owns REINIT, RE-INIT and ALIASEDIT.

Macros: `packages/commands/src/macro.ts` parses CUI macro strings into steps and
`diesel.ts` (with `diesel-format.ts` for rtos/angtos) evaluates DIESEL. In the app,
`useMacroRunner` replays the steps through `useCommandRouting` (submit, cancel,
synchronous `isActive`), waiting for each React commit; DocumentApp's `execute`
runs every menu or button command as a macro, and user input or Esc answers a
pause or ends a repeat. The status bar evaluates MODEMACRO.

Keyboard: `useCommandInput` gathers routing, macros, toggles, global shortcuts and
temporary overrides for a drawing. `useWorkspaceShortcuts` runs the
`@hancad/input` binding table after the command line's own handler;
`drafting-toggles.ts` flips variables for keys, macros and status buttons;
`temp-overrides.ts` holds the effective-value layer that drafting and snapping read
(`tempOverrides.number`), fed by the capture-phase `useTempOverrideKeys`.

Drawing shortcut menus live in `menus/DrawingShortcutMenus.tsx`. The pure
`@hancad/input` right-click policy selects Enter or a menu from SHORTCUTMENU,
the active prompt, selection and press duration. Menu actions use the shared macro
runner; keywords and Enter answer the current prompt. Object-snap menu choices
live separately from held keys in `TempOverrides` and expire after one successful
point input, including navigation. Failed acquisition and rejected input retain
the choice; cancellation and drawing disposal clear it. Session acceptance
callbacks publish exact constrained points to a per-document status-point store.

The status strip shares the keyboard drafting toggles, original vector icons,
profile visibility preferences and `ContextMenu` settings. `status-coordinates.ts`
formats static, absolute and relative polar coordinates with drawing unit
variables. `CommandPanels` hosts the menu and registry-generated help panel;
transparent HELP preserves the interrupted command. `RibbonKeyTips` routes
Alt and displayed physical-key sequences through existing chrome buttons while
respecting text/dialog focus and MENUBAR.

The bootstrap geometry crate is compiled to WASM and exercised from TypeScript.
Native OS integration belongs to Rust behind a Platform interface. The browser
adapter must explicitly report unavailable OS features. Drawing files must not be
uploaded to an external service.

The new application is the user's main application. Required standalone geometry
and local I/O implementations are retained in `packages/legacy-bridge/runtime`
behind typed adapters. The previous standalone screen and duplicate build/startup
paths are retired after the new import/export workflow passes browser validation.
The pre-migration backup remains in `archive/pre-hancad-20261014.zip`.

`scripts/build-runtime.mjs` bundles the preserved vendor and adapted geometry/I/O
code into a local asset. There are no remote runtime dependencies. The main model
canvas now requires WebGL2; Canvas2D remains for transient drafting overlays,
font rasterization and existing exports. Existing importer data uses Y down only
inside its adapter. The renderer-neutral display model and native database use
CAD WCS Y up. The legacy source explicitly inverts Y, arc direction and text
rotation once at that boundary; the public canvas/input API retains legacy Y down.

Compatibility requires preservation of unsupported data and reference graphs.
The transitional importer is a lossy editable-geometry conversion and must never be
presented as a lossless DWG/DXF editor. Later I/O phases must retain opaque
objects, handles, ownership and ancillary records.

Export uses the same drawing geometry on a white canvas. PNG/JPG and the initial
A4 PDF bake text into pixels; SVG and supported-entity DXF retain vector geometry.
The PDF writer embeds its JPEG and writes its own cross-reference table. Vector
PDF, searchable CJK text, exact plotting scale and multi-layout output remain
explicit Phase 14 requirements.

The initial interactive drafting package emits immutable entity batches from a
single session. Mouse inputs use model Y down; explicit WCS coordinates convert Y
once. A completed command, including accepted LINE/PLINE segments retained after
Esc, enters the shared database journal as one transaction. The transitional view
session is serialized under the reserved `HANCAD_VIEW_STATE` drawing variable;
database events update the canvas and local recovery cache. OPEN/NEW establish a
fresh history baseline. Selection remains ephemeral; hidden/locked geometry cannot
be erased. Drawing edits preserve the current view; imports/new documents fit it.

Running object snaps respect the supported OSMODE bits and its suppression bit.
The implementation supports endpoints, midpoints, centers, quadrants, nearest
points and true intersections. Snap input carries an exact-point flag through the
drafting session, taking precedence over grid and Ortho. Intersection candidates
are limited to aperture-near primitives and pruned by overlapping bounds; the full
dynamic spatial index remains pending. APERTURE is screen-relative, and AUTOSNAP
controls marker/tooltip visibility. Advanced modes, tracking and grid/display toggles remain explicit
future work. Shared adapter entity-capacity guards reject oversized inputs instead
of silently truncating them. Bounds accumulate incrementally to limit peak memory
for large drawings, and visible-layer filtering uses a set.

Accepted LINE/PLINE segments participate in snaps before their command commits.
The session supplies only accepted geometry as a separate candidate source; the
live cursor leg is excluded, preventing self-snapping to a rubber band. This
does not copy the complete drawing or create premature undo entries.

DimensionSession uses the same immutable-batch boundary as DraftSession. A
dimension definition is committed once after placement; cancelled construction
points and previews do not enter history. Definition coordinates remain model
geometry, DIMSCALE changes annotation sizes, and DIMLFAC separately formats linear
measurements. Supported style fields are copied into each dimension, preserving
imported styles until an explicit selected-dimension application. Local recovery
stores the supported current style variables alongside the drawing. DXF output
writes editable DIMENSION records, anonymous *D graphics blocks and per-definition
style records; full associativity and lossless style-table preservation are pending.

Phase 02 display geometry is independent of the database and GPU. It includes
lines, directed arcs, stride-five Float64 polylines with bulges/widths, points,
infinite lines/rays, baseline text, composite dimension graphics and native curves.
Adaptive tessellation uses a 0.25 CSS-pixel chord target at the current power-of-two
LOD bucket. Rational splines use their actual weights and knot intervals. Wide
polylines produce fills or FILLMODE-controlled outlines. PDMODE/PDSIZE symbols
capture view-relative size at regeneration. Large arcs and infinite geometry can
be clipped against the current view. An R-tree maintains finite bounds; exact
primitive distance refines picks and later source order breaks equal-distance ties.
The existing running-snap subsystem retains its separate candidate pipeline.

The WebGL2 backend groups retained geometry by spatial cells with bounded chunk
sizes, performs chunk/view culling and rebuilds changed chunks or LODs. Culling
and precise clipping retain stroke/fringe padding, and view-dependent keys include
scale so same-center zooms do not reuse stale clipped endpoints. Global
entity slots retain draw rank independently of spatial grouping. Every chunk has a double
precision origin. Coordinates are subtracted in JavaScript before float32 upload,
and the draw uniform contains only origin minus eye. Extremely broad geometry is
clipped around the view before upload when its float precision would exceed the
display tolerance. Thin lines use one-physical-pixel GL_LINES at unit DPI; higher
DPI and enabled heavier lineweights use instanced screen-space quads to preserve
CSS widths. The single-sample framebuffer uses a LINESMOOTHING-controlled screen
presentation pass. Shaders fit linetype dashes from cumulative model
distance. Fills and GPU glyph quads share entity style/rank data. Depth and an
opaque/transparent pass structure preserve the tested overlap cases. Opaque
glyphs draw after screen smoothing with copied depth; transparent entities replay
in individual source-order chunks after glyphs so mixed primitives retain order.

Resolved display properties occupy two RGBA32F texels per entity; a separate R32F
texture stores linetype elements. Color, selection, visibility, lineweight and
linetype scale are resolved on the CPU when styles change. Color, selection,
visibility and lineweight updates upload textures without rebuilding geometry.
View-clipped buffers additionally rebuild when a width change alters their
conservative clip margin. Thin-only packed chunks defer their wide buffers until
first needed, including high-DPI transitions; uniform locations are cached per
shader program. The stress generator writes directly into growable Float32Arrays.
Linetype/scale changes invalidate distance-phase caches: very long dash runs are
split/rebased in double precision before float32 upload, and wide-polyline fill
triangles carry measured run distances for shader gaps. This implementation does not keep separate GPU layer or
integer entity-property tables. Native LTYPE records override imported and built-in
definitions. Imported legacy layers remain authoritative over matching native
metric placeholders until native layer editing owns that state. New drafting
entities snapshot current CECOLOR/CELTYPE/CELWEIGHT/CELTSCALE, CETRANSPARENCY and
PLINEGEN; optional native display attributes survive legacy normalization/recovery.

Korean/Latin text uses cached Arial/Malgun Gothic glyphs rasterized into multiple
atlas pages and drawn with GPU triangles. Atlas keys include the projected font
size (including device pixel ratio), quantized to half pixels and bounded to
4-256 pixels; this preserves small dimension-label hinting rather than always
downsampling a 64-pixel glyph. Display text positions use an alphabetic
baseline, 1.25-height line spacing and WCS rotation. Existing legacy dimension
geometry supplies its text, lines and filled arrowheads; its middle anchor is
adapted by an explicit 0.35-em baseline offset pending reference font validation.
SHX/BigFont, rich MTEXT, font substitution and complete native TEXT/DIMENSION
production remain owned by later font/dimension phases. The native geometry
adapter explicitly reports invalid or unsupported entities; it does not render
opaque database objects as fabricated geometry.

A separate transparent canvas draws previews, snap markers, selection gestures,
crosshair and UCS aids without copying the model framebuffer. Wheel, middle-pan
and coordinate updates coalesce through requestAnimationFrame. Selection modifies
only style data; previews reuse the current GPU frame. No Canvas2D model fallback
is used. Context failure disposes overlays/listeners and leaves the application
shell available for the localized error. CPU/frame diagnostics remain distinct
from event-to-paint and GPU completion. Renderer benchmark acceptance is recorded
in PROGRESS rather than inferred from the presence of this backend.

The real-browser renderer QA compares 28 WebGL scenes against independent
Canvas2D instructions, including native widths, NURBS/ellipses, POINT/XLINE/RAY,
ACI 7 on white, custom dashes and overlapping transparent/text/fill graphics.
Color probes, mixed-primitive transparency across chunk boundaries and
translated-scene hashes constrain large-coordinate precision. Additional exact
pixel contracts cover two-hundred-million-unit dash phases, scaled and wide
linetypes, and visible/invisible default points. Extreme-zoom contracts compare
binary-fraction lines, a small circle and tapered widths at scales 65536/262144
with five one-eighth-pixel camera steps, both near zero and at survey coordinates.
Thin-line antialiasing is measured separately from
geometry coverage; these references are not screenshots from installed AutoCAD.

Direct commits validate/normalize one owned session and serialize it once. The
synchronous database observer can reuse that prepared graph only for the exact
journal string, with its temporary reference cleared in finally. Undo/redo and
external cache data still parse and fully validate. The local reader transfers
its per-call owned graph rather than cloning it again. Strings above 2M code units
go directly to chunked IndexedDB, avoiding a predictably oversized Web Storage
write. Per-document UUIDs keep tiny current-style overlays from crossing documents.

The canvas pointer controller owns captured mouse gestures and releases them on
up, cancellation, Escape, capture loss and window blur. Idle left drags emit
directional selection events; selected-object drags emit provisional transforms
and commit once on release. Ctrl copies with fresh identities. Window selection
requires whole-object containment; crossing selection tests supported geometry.
Hidden/locked layers are excluded from edits. PICKADD/PICKFIRST are read by selection
and command entry; full PICKAUTO/PICKDRAG/lasso behavior remains pending. Navigation
reads ZOOMFACTOR/ZOOMWHEEL/MBUTTONPAN live.

ModifySession separates MOVE/COPY point input from provisional previews. MOVE
commits one displacement. Repeated COPY placements remain provisional until
Enter/Exit/Escape ends the command and enter the database as one undo group.
Esc retains accepted copies and drops the current preview. Selected dimensions
move as independent definitions; associativity remains pending. MeasureSession
implements read-only DIST with exact snaps, relative/polar/direct distance input
and a disposable rubber band/label. Measurement never enters the drawing journal.
