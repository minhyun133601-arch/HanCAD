# @hancad/draft

## Responsibility

Pure 2D drafting sessions for LINE, CIRCLE, RECTANG and PLINE, coordinate parsing and immutable drawing edits. A completed command produces one entity batch for the app's undo journal.

DimensionSession supplies DIMLINEAR, DIMALIGNED, DIMRADIUS, DIMDIAMETER, DIMANGULAR and basic smart DIM through the same point, object-pick, text, preview and single-commit contract.

## Allowed dependencies

@hancad/legacy-bridge for typed transitional drawing state and normalization. No UI or renderer dependencies.

## Current status

Mouse/coordinate drafting, relative Cartesian/polar coordinates, direct distance along the cursor, circle radius entry, line/polyline close and local undo, Enter finish, Escape cancellation, preview geometry and safe append/delete are implemented. Escape keeps accepted LINE/PLINE segments in one commit and discards only the current preview; an incomplete first point creates nothing. Preview coordinates use legacy model Y down; user coordinate entry uses Y up. Full AutoCAD options, associativity, grips and advanced modifications remain planned.

Running snaps cover endpoints, midpoints, centers, quadrants, nearest points and
true intersections with local primitive/bounds pruning. Exact snap flags bypass
grid/Ortho constraints. Selection helpers distinguish containment and crossing
geometry and protect hidden/locked layers. ModifySession supplies MOVE/COPY input
and previews; immutable translations preserve originals and give copies fresh IDs.
MeasureSession supplies read-only DIST and disposable distance previews.

The basic dimension subset supports horizontal, vertical and rotated linear dimensions, aligned distances, circle/arc radius and diameter, and angular dimensions from two lines, an arc, a circle or three points. Smart DIM previews/selects line → linear, circle → diameter, arc → radius. Placement offers Text with `<>` measurement substitution and text Angle; DIMLINEAR also offers Horizontal, Vertical and Rotated. A cancelled dimension never commits construction geometry.

Supported style values are DIMTXT, DIMASZ, DIMDEC, DIMSCALE, DIMEXO, DIMEXE, DIMGAP, DIMLFAC, DIMZIN and DIMPOST. DIMSCALE affects annotation sizes only; DIMLFAC affects formatted linear measurements only. Existing dimensions change only when callers explicitly applyDimensionStyle. DXF writes editable DIMENSION records, anonymous graphics blocks and styles, retaining these values and Unicode text overrides.

This is a model-space, non-associative subset. DIMASSOC=2 does not yet link definitions to source entities. DIMSCALE=0 resolves to 1 in this model-space-only editor; annotative layouts are pending. DIMASZ=0 suppresses arrowheads. DIMTXT=0 currently falls back to 2.5 because fixed-height text styles are pending. Negative DIMLFAC has no effect in model space. Negative DIMGAP uses its absolute spacing; text-box rendering is pending. Decimal DIMZIN leading/trailing suppression is supported, while architectural units, alternate units, tolerances, full fit rules, leader commands and the remaining Phase 11 options are pending.
