# @hancad/render

## Responsibility and dependencies

Imperative WebGL2 model rendering, renderer-neutral display geometry, spatial
picking and view navigation. React never renders drawing geometry. Current
dependencies are `@hancad/legacy-bridge`, `@hancad/geom` and type-only native
database contracts. System variables and style tables enter through callbacks.

## Sources and geometry

`sources/legacy-source.ts` converts immutable Y-down snapshots into WCS display
entities and reports ID-based additions/modifications/removals. Legacy arcs,
text rotations and dimension graphics cross that boundary exactly once. Optional
ACI/true color, lineweight, linetype, scale, transparency and PLINEGEN fields
survive normalization and recovery. Imported original LTYPE patterns are retained.

`sources/database-source.ts` adapts supported native fields through the pure
geometry package. It returns explicit unsupported/invalid diagnostics. Native
TEXT/MTEXT, complete dimensions, block expansion and opaque objects remain owned
by their later producers; the ordinary app still uses its transitional geometry
state. `sources/style-tables.ts` combines original built-ins, imported LTYPEs and
native LTYPE records. Matching imported legacy layers remain authoritative over
the transitional database's metric placeholders.

Adaptive display geometry covers arcs/circles, ellipses, rational/fit splines,
bulged and tapered polylines, POINT symbols, XLINE/RAY, text and composite arrows.
The LOD chord target is 0.25 CSS pixels. FILLMODE controls wide-polyline fills;
PLINEGEN controls run continuity. View-relative PDSIZE is captured at regeneration.
The dynamic R-tree refines picks with exact primitive distances and source-order
tie breaking. Running object snaps retain their separate input implementation.

## GPU and overlays

The main canvas requires WebGL2. Spatial cell chunks retain opaque geometry buffers;
changed chunks, LOD changes and view-dependent clipping rebuild only the affected
geometry. Double-precision chunk origins are subtracted before float32 upload;
draw uniforms contain origin minus eye. Extremely broad geometry is clipped
around the eye when needed for precision. Unit-DPI thin strokes use
one-physical-pixel GL_LINES; high-DPI thin strokes and heavier visible lineweights
use instanced quads to preserve CSS width. The canvas uses a single-sample
framebuffer and a LINESMOOTHING-controlled screen presentation pass. Shaders evaluate cumulative-distance
linetype dashes. Fills and glyphs share the same entity style/rank representation.

Two RGBA32F texels per entity hold CPU-resolved RGBA, lineweight, pattern index and
scale; a separate R32F texture holds dash patterns. Selection, visibility, color
and lineweight updates replace style data without rebuilding geometry.
Linetype/scale changes invalidate distance-phase caches; long runs rebase phase
in double precision and wide-polyline fill triangles retain measured dash
coordinates. Layer properties are
currently resolved on the CPU, not through a separate GPU layer table. Opaque and
transparent passes use global source rank and depth to preserve tested overlaps.
Opaque glyphs draw after the screen filter with copied depth, then transparent
entities replay individually in source order across primitive types and chunks.

Arial/Malgun Gothic glyphs are rasterized into cached atlas pages keyed by
character and projected device-pixel font size, then drawn
as GPU triangles. Text uses an alphabetic baseline, WCS rotation and 1.25-height
line spacing. Legacy dimension middle anchors receive a documented baseline
adaptation. Half-pixel raster sizes preserve 7.5-pixel dimension labels; sizes are
bounded to 4-256 pixels. SHX/BigFont, rich MTEXT and full font substitution remain Phase 10 work.

A transparent Canvas2D overlay owns previews, AutoSnap symbols/tooltips,
window/crossing/fence gestures, the crosshair/pickbox and the WCS icon. Preview
motion reuses the GPU framebuffer without a bitmap copy. The grid is drawn on the
GPU. Canvas context failures expose `CanvasContextError`; failed initialization
releases owned overlays, observers and pointer resources. Application chrome
owns localized failure presentation. There is no Canvas2D model fallback.

## Navigation

`CadCanvasSurface` retains the public legacy Y-down input API. World views expose
a center and height. `view-navigation.ts` provides fit/window/scale calculations,
ten previous views and cancellable transitions. The command layer drives ZOOM,
PAN/-PAN and regeneration through the same pointer/text state machines.

Wheel zoom retains the cursor point and reads ZOOMFACTOR/ZOOMWHEEL live. Middle
pan uses pointer capture and MBUTTONPAN; double-middle fits extents. Escape, blur,
capture loss and disposal release gestures without delivering an extra pick.
The cursor appears only inside the canvas. Area selection begins after four CSS
pixels, uses directional window/crossing colors, and supports separate fence paths.
Full lasso/PICKAUTO/PICKDRAG, selectable/3D UCS icons and layout viewports belong to
later producers. Numeric nXP is explicitly unavailable without a floating layout
model viewport. Dynamic UCS grid orientation is likewise deferred.

## Verification

`node packages/render/qa/verify-golden.mjs` bundles the actual WebGL renderer in
memory and compares 28 Edge scenes against independent Canvas2D instructions.
The scenes include Korean text/dimensions, both arc directions, native widths,
NURBS/ellipses, POINT/XLINE/RAY, light-background ACI 7, custom dashes and
transparent/text/fill overlap. Exact-color probes allow at most two channel
levels, including mixed transparent primitives inside and across chunk boundaries;
geometry coverage allows at most 0.5% unmatched pixels within a one-pixel
neighborhood. GPU antialiasing permits mean channel error below 1.25/255 and
coverage differences of 30% for thin-line scenes or 8% otherwise. Translated
legacy and native scenes must have identical framebuffer hashes at
(200000000, 450000000). These are independent renderer references, not AutoCAD
screenshot certification. PNGs and metrics stay in ignored
`test-artifacts/render-golden/`.

The same command runs 37 exact-color contracts for mixed transparent primitive
ordering across chunks, two-hundred-million-unit dash phases, wide dashed fills,
object scale and PDMODE 0/1. All contract probes allow at most two channel levels
of error and assert zero WebGL errors. Current machine results are in DECISIONS.

Twenty further precision comparisons use view scales 65536/262144 and five
one-eighth-pixel pan steps near zero and (200000000, 450000000). Binary-fraction
lines must have identical hashes at both origins and all pan steps must produce
distinct frames. Small-circle/tapered-width differences must remain below mean
error 0.005/255 and maximum channel error 16, with zero missing/extra geometry in
a one-pixel neighborhood. Reports and the final high-zoom comparison image are
saved beside the golden evidence.

Three retained-viewport contracts additionally sample two frames each: opaque and
translucent 9-pixel strokes whose centerline is one pixel outside the viewport,
and a precise 200-million-unit line after a same-center zoom from scale 4 to 1.
Each frame must retain its expected visible stroke color. Results are written to
`viewport-contracts.json`.

`benchmark-stress.mjs` exercises a renderer-only DEVSTRESS dataset independently
of the legacy model/journal limits. `benchmark-real.mjs` retains the opt-in local
DWG workflow. Performance acceptance and machine results are recorded in
`docs/PROGRESS.md`; passing functional/golden tests alone does not establish
the million-entity frame budget. Diagnostic datasets expose CPU submission,
chunk rebuilds and frame reuse separately from real event-to-paint timings.

Packed stress geometry writes directly into growable Float32Arrays. Thin-only
chunks retain their source array and create wide instances only when the draw
first requires them (including a DPR change), avoiding unused GPU uploads.
Uniform locations are cached per program; buffer lifecycle tests cover promotion
and disposal.
