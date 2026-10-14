# Migration to the new main application

The user authorized the complete ZIP specification and clarified that the new app
should be continuously runnable as features are added. Keeping the old standalone
app usable is not required.

Before changing configuration, a complete baseline was saved in
`archive/pre-hancad-20261014.zip`. Unused standalone UI, startup/build scripts, HTML
and shortcut were moved into `archive/retired-standalone/`. Automated approval
review rejected the deletion command, so reversible archival cleanup was used.
Those files are not in active build paths and are excluded from the new Git tree.

The geometry, modification, importer and exporter implementations required by the
new app were migrated to `packages/legacy-bridge/runtime/`. The exporter has small
adaptations for bounds and readable SVG output. Their regression tests now load
those migrated paths using `pnpm test:compat`. Vendor engines, original source and
licenses are preserved separately.

`HanCAD 실행.cmd` refreshes the browser build and runs it through a local-only Node
static server. Edge opens its address in a browser window; the local server stays
in the background, and startup failures keep
the console open. The launcher's Node/npm PATH
bootstrap avoids relying on an already-open Explorer inheriting changed paths.
`pnpm dev:web` runs live development. Both use the same origin so the user's
current displayed drawing can be restored across builds. Rebuild with `pnpm build`
and refresh the browser to review new features.

New model schemas use WCS Y up. Imported transitional view states still use the
proven Y-down adapter; schema migration must invert Y exactly once. The original
file and bytes are retained in memory after successful import. Errors and
cancellation leave the displayed drawing intact. Cached geometry and import reports
are restored together; the original file bytes are not stored in localStorage.

The importer can omit or approximate unsupported entities. Current normalized DXF
export is not lossless, and DWG saving is not available. These limitations remain
visible in the app and progress metadata while full compatibility is developed.
