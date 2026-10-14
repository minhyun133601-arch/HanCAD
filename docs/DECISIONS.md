# Decisions

## 2026-10-14: Adopt the full supplied specification

The user's latest instructions authorize all phases and resolve overlapping
behavior in favor of the ZIP prompts. The original master prompt is installed
verbatim. Full 3D, automation, customization and desktop scope is accepted, while
each implementation phase remains subject to its acceptance criteria.

Existing implementation is preserved for reuse and rollback. The original alias
map does not apply to the new app: D means DIMSTYLE, DV means DVIEW and DRE means
DIMREASSOCIATE. Canonical commands, aliases and UI macros must share one registry.

## 2026-10-14: Deliver continuously usable new-app builds

The user clarified that the old standalone app need not remain usable: they are
switching to the new application and want to try each implemented feature. They
also explicitly require DWG opening and PDF/image conversion. Therefore the new
app is the main app, with a continuously refreshed browser build and a main
launcher. Necessary geometry and I/O code is migrated behind typed adapters;
obsolete screens, duplicated source and old launch/build paths are retired after
the replacement workflow is verified. A complete original backup is retained.

Usable DWG viewing and PDF/PNG/JPG/SVG output are delivered early as partial slices
of Phases 2, 9 and 14. This does not mark those phases complete or cancel the full
specification. The new app's progress dialog distinguishes usable features from
complete phases. The initial PDF is a self-contained A4 raster output; vector
plotting and exact scale controls remain pending and are shown to the user.

## 2026-10-14: Prioritize the usable simple 2D application

The user subsequently asked for essential features first and explicitly deferred
3D and secondary features. The immediate delivery target is local file opening,
viewing, basic mouse/coordinate drafting, selection/erase, command-level undo/redo,
DXF saving and PDF/image output. Move/copy, snapping, text, dimensions and practical
2D modifications follow before optional automation or 3D. Original prompts remain
organized separately with an implementation-order index in
`docs/prompt-source/PRIORITIES.md`. This changes priority without declaring full
phase acceptance or changing the reference behavior.

## 2026-10-14: Version selection

Versions were queried from the npm registry before installation and pinned in
`package.json` and the lockfile. Node 24.18.0 is already installed; pnpm 12.11.2 is
installed for the workspace. React 19.3.0, Vite 8.3.4, Vitest 5.0.4, Playwright
1.64.0, ESLint 10.12.0, typescript-eslint 8.71.2, Prettier 3.9.10, Tauri CLI 2.12.2
and API 2.12.3 were selected.

The latest TypeScript was 7.0.2, but typescript-eslint 8.71.2 declares support only
for TypeScript below 6.1.0. TypeScript 6.0.3 is therefore pinned as the latest
supported stable version for this verified toolchain.

Rust stable 1.99.0 and the wasm32-unknown-unknown target are installed. The official
wasm-bindgen 0.2.129 Windows binary is installed. WebView2 155.0.4283.45 already
exists. The attempted Microsoft C++ Build Tools installation command was rejected
by automatic approval review with the reason "blocked by policy"; no MSVC
installation was performed. The missing native toolchain must be recorded as a
desktop acceptance dependency, not worked around by bypassing that rejection.

## 2026-10-14: Bootstrap WASM ABI

The initial geometry proof uses a dependency-free Rust crate with raw WASM numeric
exports and a typed JavaScript adapter. This allows the browser/WASM acceptance
test to run without native host linking while MSVC is unavailable. The installed
wasm-bindgen CLI remains available for later binding generation. This does not
replace or bypass the missing native desktop prerequisite.

## 2026-10-14: Practical large-DWG capacity and visibility

The user's 27.4 MB R2000 drawing exposed the original 20,000-entity limit, then the
initial 200,000 transition limit. Parser diagnostics found 117 layers, 189 block
definitions with 357,382 internal entities, and a conservative reachable expansion
of 303,031 entities. All 1,453 INSERT records were 1x1, so this was legitimate
block content rather than array multiplication. A consistent 500,000-entity hard
ceiling is sufficient for this file; it imports 286,996 supported/approximated
entities. Oversized inputs are rejected explicitly instead of silently sliced.

Bounds use streaming extrema and visible-layer sets to limit memory/work. The
imperative renderer borrows immutable drawing snapshots rather than defensively
cloning all geometry. It must never mutate those inputs. Preview and selection
remain privately owned.

The imported layer flags can produce an initially blank drawing. Explicit LAYON
preserves an undoable layer change. When making an entirely hidden drawing visible,
the usable transition also fits it before the first paint: painting large circles
or text at an empty-drawing zoom can stall the browser. This automatic fit is a
documented transitional behavior requiring reference parity review; regular edits
preserve the current view.

Large cache data exceeds localStorage quota. Browser-local IndexedDB fallback
stores the serialized view without uploading it. OPEN/NEW supersede late restore
results, and failed cache writes must never resurrect a previous drawing.

## 2026-10-14: Resolve ambiguous input behavior

Dropping a drawing on the drawing canvas will insert it as a block once Phase 13
is implemented. Dropping it on the file-tab/open area will open a document. This
separates the Phase 9 and Phase 13 requirements without changing either operation.
Before insertion is implemented, its drop target must explicitly report that it
is unavailable rather than replacing the current drawing.

Selection follows PICKAUTO/PICKDRAG settings. A press-and-drag uses lasso when
enabled; otherwise it uses direction-sensitive rectangular selection. Record
reference-version parity checks before implementing these settings.
