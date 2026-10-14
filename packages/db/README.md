# @hancad/db

## Responsibility

Persistent drawing objects, symbol tables, layouts, transactions, undo journal and typed event bus.

## Allowed dependencies

None. Geometry, UI and I/O must not be imported here.

## Current status

Implemented foundation. Unknown entity data and DXF groups are retained as opaque JSON. Local `.hcd` persistence uses a standard ZIP container with JSON, binary blobs, UTF-8 filenames and CRC32 validation. Full DXF entity schemas and advanced UNDO grouping/OOPS behavior remain planned.
