# @hancad/render

## Responsibility

Imperative drawing renderer, display lists and view navigation. Drawing canvas rendering stays outside React.

## Allowed dependencies

Current adapter: @hancad/legacy-bridge. Future renderer: @hancad/db, @hancad/geom, @hancad/sysvars.

## Current status

The imperative Canvas2D adapter renders real imported and drafted 2D geometry, with fit, cursor-centered wheel zoom, middle-button pan and resize handling. Editing updates can preserve the view; rubber-band previews, selected objects, geometric click picking and a fixed-size snap marker are supported. A new empty drawing starts at metric 0,0 to 420,297 limits. It uses the typed legacy bridge and is transitional. The custom WebGL2 renderer, million-entity performance budget, instancing and floating-origin backend remain pending Phase 2.

`setDrawing` borrows an immutable drawing snapshot; callers must replace the snapshot for edits and must not mutate its geometry in place. The renderer changes only its own view, preview and selection, which avoids duplicating a large drawing for every visibility change.
