# Project folders

| Path                                  | Purpose                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `HanCAD 실행.cmd`                     | The only main launcher; rebuilds the web app and opens its local address |
| `apps/web/`                           | Main user interface and browser integration tests                        |
| `apps/desktop/`                       | Prepared Tauri wrapper; native toolchain acceptance pending              |
| `packages/`                           | Typed drawing, commands, drafting, rendering, geometry and I/O packages  |
| `crates/`                             | Rust/WASM geometry source                                                |
| `scripts/`                            | Build, local launch/server and independent output verification           |
| `docs/`                               | Current architecture, status, command coverage and decisions             |
| `docs/prompt-source/`                 | Original ZIP, original prompts, priority index and next-work handoff     |
| `vendor/`                             | Offline DWG/DXF engines, official fixture, complete source and licenses  |
| `test/`                               | Migrated compatibility regression tests                                  |
| `archive/`                            | Original backups and retired standalone screens/launchers                |
| `test-artifacts/`                     | Ignored screenshots, output samples, profiles and startup logs           |
| `.tools/`, `node_modules/`, `target/` | Ignored local tooling, installed dependencies and Rust build output      |

The old standalone `src/`, generated HTML, shortcut and duplicate build/smoke
scripts are retired from active paths. The development CMD and temporary main
shortcut are archived; `pnpm dev:web` remains available to developers. Root build
configuration is required source, not user-facing launch clutter. User drawings
are kept local and excluded from Git.
