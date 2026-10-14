# @hancad/draft

## Responsibility

Pure 2D drafting sessions for LINE, CIRCLE, RECTANG and PLINE, coordinate parsing and immutable drawing edits. A completed command produces one entity batch for the app's undo journal.

## Allowed dependencies

@hancad/legacy-bridge for typed transitional drawing state and normalization. No UI or renderer dependencies.

## Current status

Mouse/coordinate drafting, relative Cartesian/polar coordinates, direct distance along the cursor, circle radius entry, line/polyline close and local undo, Enter finish, Escape cancellation, preview geometry and safe append/delete are implemented. Escape keeps accepted LINE/PLINE segments in one commit and discards only the current preview; an incomplete first point creates nothing. Preview coordinates use legacy model Y down; user coordinate entry uses Y up. Full AutoCAD option sets, associativity, grips and modification commands remain planned.
