# Browser UI

The shared Korean-first React shell for the browser and Tauri desktop app.
React owns UI chrome only; `CanvasSurface` creates and owns the canvas directly.
No drawing is sent to a remote server. All assets are local.

Allowed dependencies: `ui`, `input`, `commands`, `sysvars`, `db`, `draft`, `render`,
`legacy-bridge`, `io-pdf`, React, and the Tauri invoke API behind `Platform`.
The legacy bridge isolates reused local readers and serializers from the new
drawing database until their schemas can be connected safely.

Run `pnpm dev:web` from the repository root; Vite listens on `127.0.0.1:1420`.
Production output is `apps/web/dist`. The same output is embedded by Tauri.

Open a local DWG/DXF using the upper File menu, quick-access folder icon, `OPEN`,
Ctrl+O, or file drop. The imported
model drawing renders on an imperative Canvas2D surface with cursor zoom and
middle-button pan. `ZOOM E` fits the full drawing. An import report exposes
skipped/approximated objects; hidden source layers remain hidden until the user
explicitly executes `LAYON`. Cancellation and failed reads preserve the current
drawing, filename, and view.

The File menu and Output ribbon export PDF, PNG, JPG, SVG, and DXF. PDF currently
contains the complete white-paper raster drawing on one A4 page; SVG and DXF
are vector outputs. Exports contain the imported supported model subset, not
opaque unsupported source objects or full paper-space plots. Geometry, filename,
and the import report are stored locally for reload. Larger drawings fall back
from Web Storage to IndexedDB in atomic chunks; restore can be cancelled and never replaces a
new drawing or newly opened file. Original source bytes are kept in memory only.
If both local stores fail, the active drawing remains usable and the previous
cache is invalidated; save the edited drawing as DXF before closing the app.

Development progress shows all 26 phases with explicit scope and acceptance
status. Ribbon tools whose commands are pending report that status. Layout tabs
remain placeholders; paper-space viewports are pending.

`LINE`, `CIRCLE`, `RECTANG`, and `PLINE` accept mouse points, absolute coordinates,
relative coordinates, and applicable distances. Previews stay outside React.
Ortho and enabled endpoint/midpoint/center/quadrant/nearest object snaps assist
mouse input; explicit coordinates stay exact. Click to select, Shift-click to
remove a selection, and Delete or `ERASE` to delete. `U`/`UNDO` and `REDO` share
one drawing journal with system-variable edits. LINE/PLINE accepted segments
commit as one undo group on Enter, close, or Escape; a lone first point cancels.
`NEW` and successful `OPEN` establish a fresh journal boundary. DXF save and
local geometry restoration include these edits.

`SETVAR` and `GETVAR` collect variable names and values one prompt at a time.
Direct system variable names prompt for their next value. String values switch
to a real editable input for Korean IME composition; command syntax stays on a
non-editable physical-key surface. This focused bootstrap session is not yet
the full coroutine-based editor required by Phase 3.

Only implemented Ortho and Object Snap status switches are active. Other drafting
switches are disabled with a pending explanation. Browser OS calls report unavailable
capabilities; its clipboard is an isolated, explicitly identified memory mock.
