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
