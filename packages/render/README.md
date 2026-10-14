# @hancad/render

## Responsibility

Imperative drawing renderer, display lists and view navigation. Drawing canvas rendering stays outside React.

## Allowed dependencies

Current adapter: @hancad/legacy-bridge. Future renderer: @hancad/db, @hancad/geom, @hancad/sysvars.

## Current status

The imperative Canvas2D adapter renders real imported and drafted 2D geometry, with fit, cursor-centered wheel zoom, middle-button pan and resize handling. Editing updates can preserve the view; rubber-band previews, selected objects, geometric click picking and a fixed-size snap marker are supported. A new empty drawing starts at metric 0,0 to 420,297 limits. The custom WebGL2 renderer, million-entity performance budget and instancing remain pending Phase 2.

Pointer handling is isolated in `pointer-controller.ts`. Live navigation settings
read ZOOMFACTOR, ZOOMWHEEL and MBUTTONPAN through the application boundary. Wheel
steps retain the cursor's model position and equal forward/backward steps restore
the view; middle-button double-click fits the drawing. Browser pixel/line/page
wheel events normalize to 100 pixels, three lines or one page per wheel notch.
This browser mapping remains a documented comparison item for physical devices.

Idle clicks are distinguished from drags at four CSS pixels. Drag callbacks carry
model start/end points and modifier state; the overlay draws a blue solid window
or green dashed crossing box. The application can suppress that box for selected
object moving/copying. Active point prompts keep immediate pointer-down input.
Pointer capture, Escape, window blur, lost capture and cancellation clear gestures
without delivering an extra pick. Full PICKAUTO/PICKDRAG and lasso parity is pending.

Snap overlays use original endpoint, midpoint, center, quadrant, intersection and
nearest symbols, plus an optional localized tooltip. Marker and tooltip display
can be controlled independently while snapping remains active.

`setDrawing` borrows an immutable drawing snapshot; callers must replace the snapshot for edits and must not mutate its geometry in place. The renderer changes only its own view, preview and selection, which avoids duplicating a large drawing for every visibility change.

Visible geometry is retained in `Path2D` batches of at most 256 adjacent entities with matching layer, color and width. Text and dimensions keep the existing drawing implementation. Bounds culling includes stroke and text margins, and CPU floating origins preserve small coordinates around large drawing origins. Selection keeps nonselected colors and painter order. Click picking filters cached bounds before exact geometry checks.

The static drawing renders directly into the main canvas. A separate transparent viewport canvas draws preview and snap markers, so their motion does not redraw the model or force a backing-canvas bitmap copy. Unattached canvases use a bitmap fallback. Drawing, selection, resize and view changes invalidate static geometry. Wheel, middle-pan and coordinate updates coalesce through `requestAnimationFrame`. No cache of previous drawings is retained. The additional overlay uses roughly four bytes per physical viewport pixel.

At distant zoom, polyline display paths use Douglas–Peucker simplification with at most 0.25 CSS pixel model deviation. Shapes whose entire bounds fit within that tolerance use a round stroke dot. One zoom bucket is retained for each adjacent style run; zooming in rebuilds the display path from unchanged source geometry. This avoids tessellating thousands of invisible curve steps into a handful of screen pixels. Native path storage and bounds grow with visible geometry; export geometry and measurements remain unchanged.

Feature tests cover order, hidden/locked layers, boundary strokes, selection, bitmap reuse and frame coalescing. `node packages/render/qa/verify-golden.mjs` compares 20 small real-browser scenes with the existing renderer, including Korean text, dimensions, both arc directions, full circles and large coordinates. It permits small anti-aliasing differences and checks geometry coverage; these scenes do not constitute an AutoCAD parity certification.

For a local drawing, set `HANCAD_PRIVATE_DWG` and run `node packages/render/qa/benchmark-real.mjs` against the running production app. It records actual frame CPU time and event-to-paint latency with canvas readback, visible counts, local cache status and heap usage. Artifacts stay in ignored `test-artifacts/`. `data-render-ms`, `data-geometry-ms`, `data-frame`, `data-draw-calls` and `data-base-reused` are diagnostics; raw event callback time alone does not measure deferred rendering.
