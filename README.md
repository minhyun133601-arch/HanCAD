# HanCAD

HanCAD is the main application replacing the previous standalone CAD. The current
instruction is to complete the original Phase 00 through Phase 25 in numeric
order. Saved prompts are in `docs/prompt-source/prompts/`. Phase 00 native desktop
acceptance is still pending; previously delivered 2D features remain available in
the runnable browser build. A working feature subset does not complete its phase.

## Run the current app

Double-click **HanCAD 실행.cmd**. The launcher refreshes the
web build, serves it locally at `http://127.0.0.1:1420` and opens that address in Edge.
Node.js is already installed on this PC. The local server runs in the background,
so closing the launch console does not disconnect the app. Build/start errors keep
the console open for inspection; startup output is in `test-artifacts/local-server.log`.
Refresh the browser after a new build to try the latest features.

The current app supports:

- LINE, CIRCLE, RECTANG and straight PLINE drafting with mouse/coordinate input.
- Linear, aligned, radius, diameter and angular dimensions, with smart DIM previews.
- Basic DIMSTYLE settings, Korean dimension text and explicit selected-dimension updates.
- Pick/Shift/Ctrl+A selection, erase, whole-command undo/redo and NEW.
- Window/crossing selection, selected-object dragging, MOVE/COPY and DIST.
- LINE TRIM/EXTEND, basic OFFSET and inline Korean TEXT/DTEXT creation.
- Absolute/relative/polar/direct-distance input, F8 Ortho and initial F3 object snaps.
- Local DWG/DXF opening, visible geometry, pan/zoom and Zoom Extents.
- Retained display paths, offscreen culling and separate preview rendering for large drawings.
- Import results listing skipped, approximated and unsupported objects.
- Explicit LAYON for drawings whose layers are all off.
- PDF, PNG, JPG, SVG and supported-entity DXF downloads.
- Restoring the last displayed drawing and its import report after reload.
- Browser-local IndexedDB fallback when a large drawing exceeds localStorage quota.
- Korean/English chrome, IME-safe command input and typed system variable prompts.
- An in-app development progress dialog covering all 26 phases.

DWG input supports R13 through R2018-format files up to 64 MB and 500,000 normalized
entities. Current conversion
covers model-space 2D geometry; unsupported data is reported. The original bytes
are retained during the session, but current DXF export is not a lossless round
trip and DWG saving is not implemented. PDF currently embeds a high-resolution
raster on A4. Vector/searchable PDF, exact plot scales and multi-layout plotting
remain pending. Full modification options, curved-polyline offsets, text
styles/justification and MTEXT remain incomplete. Associative dimensions, leaders, tolerances, the full
DIMSTYLE manager, advanced selection/grips and drawing-command options
remain pending. Unconnected drafting-aid controls are visibly unavailable.

For dimensions, use the ribbon or DLI (linear), DAL (aligned), DRA (radius), DDI
(diameter) and DAN (angular). DIM chooses an initial type from the selected object.
D opens the basic dimension settings. DIMSCALE changes annotation size only;
DIMLFAC is the separate displayed-measurement factor. Existing dimensions change
style only when explicitly selected for application. See `docs/COMMANDS.md` for
the supported input sequences and remaining options.

The supplied 286,996-object drawing was verified on this PC: import about 12 s,
six tested zoom/pan paint responses 0.03-0.40 s, and local-cache reload about 2.2 s.
Creating and undoing a dimension on that file also passed. These are measured
samples, not the complete million-entity/60 fps budget. See `docs/PROGRESS.md`.

## Develop and verify

```powershell
pnpm install
pnpm dev:web
pnpm build
pnpm verify
pnpm smoke
pnpm check:desktop
pnpm tauri dev
```

`pnpm dev:web` builds geometry WASM and launches the live development server.
`pnpm build:web` and the Tauri release build also generate WASM automatically.
`pnpm verify` builds
WASM, checks lint/format/types, runs unit and compatibility tests, builds the web
app and tests it in Edge. Set `HANCAD_PRODUCTION=1` to test the actual compiled app
using the same local server as the main launcher.

Native Windows development additionally requires Microsoft C++ Build Tools and a
Windows SDK. This prerequisite remains unavailable, so the native build and window
state restoration have not been verified. The browser build is usable independently.

`pnpm check:desktop` inventories tools, Rust targets, actual MSVC compiler/linker
files and Windows SDK headers/libraries/tools, returning a nonzero exit code with
`ready: false` when anything is missing. `pnpm tauri dev` and `pnpm tauri build`
run this check before starting the frontend or native build. CLI help remains
available without the native prerequisites.

To provide the missing components, use Visual Studio Installer's **Desktop
development with C++** workload with MSVC C++ build tools and a Windows 10/11 SDK,
as described in the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).
Reopen the terminal, run `pnpm check:desktop`, then `pnpm tauri dev`. Native
acceptance requires the Korean shell to open, enforce 1280x720 minimum size and
restore its changed size/position after closing and reopening.

The original app was backed up in `archive/pre-hancad-20261014.zip`. Obsolete
standalone screens, scripts and launch files were moved into
`archive/retired-standalone/` and removed from active build paths. Required source
was migrated to `packages/legacy-bridge/runtime/`; vendor source and licenses remain
in `vendor/`. `pnpm test:compat` validates those migrated functions.

The master prompt is `AGENTS.md`; all original prompts are organized separately in
`docs/prompt-source/`, with the revised order in `docs/prompt-source/PRIORITIES.md`.
The next-work handoff is `docs/prompt-source/NEXT_STEPS.md`.
See `docs/PROGRESS.md` for implementation status and next
steps. Planned phases are not completed features. Drawings are processed locally
and are never uploaded. User drawings belong in ignored `test-corpus/`.
