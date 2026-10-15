# @hancad/db

## Responsibility

Persistent drawing objects, symbol tables, layouts, transactions, undo journal and typed event bus.

## Allowed dependencies

None. Geometry, UI and I/O must not be imported here.

## Current status

Persistent metric defaults include named dictionary entries, reciprocal layout/block
references, BLOCK/ENDBLK records and paper-space viewport records. Drawing limits,
units and grid/snap defaults are stored in the drawing. Font substitution, complete
style parameters and exact installed acadiso.dwt layout/scale defaults still need
reference verification; bundled Autodesk resources are not used.

The DXF registry indexes standard entity, object and symbol-table families. The
required Phase 1 curve records, VERTEX, DICTIONARY, LAYOUT and BLOCK_RECORD have
field-code mappings. Other indexed types explicitly remain opaque; their complete
ordered group streams are retained without fabricated geometry or field mappings.
This registry is a foundation, not a claim that every type-specific schema is done.

Every indexed family also carries factual `documentedGroups` from Autodesk's
official 2026 DXF reference: numeric codes/ranges, repetition, subclass/application
context and source links. Complex annotation, hatch and surface definitions include
their subordinate code tables. 157 reference documents provide 2,318 numeric fact
rows, including shared metadata tables; original explanatory prose is not copied.
Mapped codecs and raw documentation are separate: an opaque type's raw definitions
do not enable fabricated field edits. `documentationStatus` explicitly identifies
the common-only SCALE case where no type-specific DXF table is published.
The generator `scripts/update-dxf-reference.py` uses only Python standard-library
HTTP/JSON tools and stores small deterministic source chunks. `dxfGroupValueType`
records wire-value widths, including 64-bit integers and binary data; explicit
mapped edits validate values without coercing preserved opaque source data.

`decodeDxfFields` reads subclass-scoped mapped fields. `editDxfFields` applies an
explicit patch, preserving unknown groups, duplicate codes, subclass/application
markers and XDATA. Per-vertex optional widths/bulges and dictionary entries retain
their own record association. `applyDxfFieldPatch` synchronizes a pure object copy
for transaction callers. DXF angles remain degrees, ellipse parameters radians,
and point coordinates are JSON tuples in the coordinate system specified by DXF.
POLYLINE/VERTEX records stay separate; an upper-layer adapter assembles their
geometry without a database dependency on the geometry package.

Unknown entity fields and DXF groups remain opaque JSON. `.hcd` persistence uses a
ZIP container with JSON, binary blobs, UTF-8 filenames and CRC32 validation.
Reference validation applies only to explicit known dictionary/layout metadata;
legacy snapshots without that optional metadata remain readable.
