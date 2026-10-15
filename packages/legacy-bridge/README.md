# @hancad/legacy-bridge

## Responsibility

Typed local adapter for the proven standalone CAD import/geometry/export modules. The bundled runtime includes the existing offline LibreDWG worker and DXF parser; drawings never leave the user's computer.

## Allowed dependencies

None. The runtime is loaded by apps/web from `/runtime/cad-runtime.js`. Its GPL reader stays isolated inside the worker and keeps the original vendor source/license provenance.

## Current status

Importer errors expose validated `cad-import` identities independently of UI.
The optional diagnostic progress callback and aligned report warning identities
are additive; legacy Korean diagnostic strings remain available to old callers.
Structural guards support errors crossing VM boundaries and reject malformed
metadata. The app translates known identities while retaining external text.

DWG/DXF import and reports, original-byte retention, normalized 2D view state and SVG/DXF serialization are usable. This transitional state uses model Y down and is separate from the new database (Y up). Unsupported objects are reported and skipped; curved/3D objects can be approximated. The original file bytes are retained, but exporting the normalized drawing is not a lossless DWG/DXF round trip. Full database migration, ODA integration and complete format parity remain planned.

Files up to 64 MB and up to 500,000 normalized entities are accepted. Overflow is rejected explicitly without replacing the active drawing; the model does not silently truncate entity arrays. The current layer limit is 256, and individual normalized polylines allow up to 10,000 points. These safety bounds are not a performance guarantee for every supported drawing.
