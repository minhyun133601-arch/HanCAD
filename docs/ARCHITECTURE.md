# Architecture

The active implementation sequence is the original Phase 00 through Phase 25.
Previously delivered later-phase adapters remain supported, but their presence
does not imply acceptance of the preceding phases.

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
code into a local asset. There are no remote runtime dependencies. Rendering is
imperative Canvas2D during this usable transition; the specified WebGL renderer
and performance budgets remain Phase 2 requirements. Existing importer data uses
Y down only inside its adapter. The new database uses CAD WCS Y up. Conversion
between these schemas must explicitly invert Y once at the migration boundary.

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

The transitional Canvas2D renderer retains adjacent same-style Path2D runs while
preserving painter order. Bounds skip offscreen runs/entities; text and dimensions
keep the shared geometry implementation. CPU relative origins reduce transform
precision loss at large coordinates. The main canvas retains the static scene;
a separate transparent canvas draws previews and snaps without copying that scene.
View/drawing/selection/resize changes invalidate it, and input updates coalesce
through requestAnimationFrame. Display paths use one zoom bucket with at most
0.25 CSS-pixel geometric deviation; source and export geometry remain unchanged.
Diagnostic
frame/geometry timers distinguish real drawing work from deferred event callbacks.
This is practical transitional optimization, not the complete WebGL/R-tree engine
or million-entity/60 fps acceptance. Native path memory grows with visible geometry;
the additional overlay costs about four bytes per physical viewport pixel.

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
