# Architecture

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
The first implementation supports endpoints, midpoints, centers, quadrants and
nearest points. Advanced modes, tracking and grid/display toggles remain explicit
future work. Shared adapter entity-capacity guards reject oversized inputs instead
of silently truncating them. Bounds accumulate incrementally to limit peak memory
for large drawings, and visible-layer filtering uses a set.

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
