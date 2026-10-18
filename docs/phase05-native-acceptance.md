# Phase 05 native Windows acceptance

Status on 2026-10-19: blocked before native compilation. `pnpm check:desktop`
reports MSVC C++ tools and Windows SDK missing; Git, Node LTS, pnpm, Rust MSVC,
the WASM target, wasm-bindgen and WebView2 are present. No native success is
claimed. The previous Build Tools installation attempt was rejected by automatic
approval review with `blocked by policy`; this continuation does not retry it.

## Prerequisite gate and build

The [official Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows)
require Microsoft C++ Build Tools and WebView2. Once the user has prepared the
machine, verify that the Desktop development with C++ workload includes the x64
MSVC compiler/linker and Windows 10/11 SDK headers, libraries, rc.exe and mt.exe.
Do not treat an Installer registration or SDK headers alone as readiness. Record
the actual installed toolset and SDK versions from the inventory; repository
dependency versions and Cargo.lock remain pinned.

In a fresh Developer PowerShell for the installed Visual Studio tools, change to
the repository root, then run these commands individually and record their exit
codes. Stop on the first failure and retain its output in test-artifacts/.

```powershell
pnpm check:desktop
& "$env:USERPROFILE\.cargo\bin\cargo.exe" check -p hancad-desktop --locked --offline
& "$env:USERPROFILE\.cargo\bin\cargo.exe" test -p hancad-desktop --lib --locked --offline
pnpm tauri build --no-bundle
```

The local executable is `target/release/hancad-desktop.exe` with the default
workspace target directory. Packaging/installer work is outside Phase 05. Launch
that same executable twice from Explorer for the two independent native windows;
do not substitute two browser tabs or count a mocked IPC test as Win32 evidence.
If a locked offline check reports an uncached dependency, record the exact error
before deciding whether an online locked fetch is needed; do not upgrade packages.

## Clipboard geometry and undo

Use fresh drawings in windows A and B. Focus the canvas before each shortcut.

1. In A, type `NEW` Enter. Create one line: `L` Enter, `10,10` Enter, `30,10`
   Enter, Enter. Press Ctrl+A, Ctrl+Shift+C, type `20,30`, Enter. The command
   must finish without the browser fallback message.
2. In B, type `NEW` Enter, focus the canvas, Ctrl+V, type `100,100`, Enter.
   The pasted line must have WCS endpoints (90,80) and (110,80). Ctrl+1 shows
   those coordinates. Close Properties and focus the command line.
3. Type `U` Enter: the entire paste disappears. `REDO` Enter restores it.
   `PASTEORIG` Enter adds a line at original WCS endpoints (10,10), (30,10).
4. Focus B's canvas, Ctrl+Shift+V, type `50,50`, Enter. A block is inserted at
   that point; supported DXF save/reopen retains the block and its members.
5. In A, select the original line and press Ctrl+X. A successful cut removes
   it once. `U` Enter restores it; B can still paste the copied line.

## Clipboard formats and replacement

After the COPYBASE step, use a separate Windows PowerShell started with `-STA`.
Run these read-only commands there; retain only metadata in the QA log.

```powershell
Add-Type -AssemblyName System.Windows.Forms
$drawingClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
$drawingClipboard.GetFormats($false)
$drawingPacket = $drawingClipboard.GetData('UnicodeText') | ConvertFrom-Json
$drawingPacket | Select-Object format, version, basePoint
$drawingPacket.state.entities.Count
```

Expected explicit formats: `HanCAD.Drawing.v1`, `PNG`, a CF_DIB mapping (commonly
`DeviceIndependentBitmap` in .NET), and `UnicodeText`. The text JSON must describe
HanCAD.Drawing version 1, the COPYBASE point and the selected entity count.
For the sequence above, the raw model-space basePoint is `{x:20,y:-30}`;
the JSON uses the documented transitional Y-down model, while Properties uses WCS.
Names for standard Win32 formats may be mapped by .NET; check CF_DIB value 8 if
the display name differs. Microsoft documents the [standard format values](https://learn.microsoft.com/en-us/windows/win32/dataxchg/standard-clipboard-formats).

Paste into Paint with Ctrl+V to confirm that an image is offered and its
orientation/colors are correct. Then copy unrelated text in Notepad and run
PASTECLIP in B: it must report that no drawing objects are available, leave the
drawing unchanged and never resurrect the earlier HanCAD packet.

## Failure, cancellation and shortcuts

For an actual busy-clipboard failure, run the bounded helper in a separate
PowerShell from the repository root:

```powershell
powershell.exe -NoProfile -File scripts/hold-clipboard.ps1 -Seconds 15
```

It creates a unique message-only HWND and holds the clipboard on one thread
without replacing data. A finally block closes the clipboard and destroys the
hidden HWND. While it prints the locked message, run
CUTCLIP in A. Record the actual native error and verify that the source and its
undo history remain intact. An ordinary GetDataObject call does not keep the
clipboard locked. Do not mark this scenario passed without creating contention.

The browser IPC contract tests separately cover rejected/delayed native requests;
they are repeatable command-level regression evidence, not this Win32 failure
test. On a delayed CUTCLIP, Escape before the native response must preserve the
source. Switching drawings before completion must never erase the other drawing.

Verify Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Shift+C, Ctrl+Shift+V, Ctrl+1 and
Ctrl+Shift+P on the canvas; editable fields must retain their normal text keys.
Repeat the five original acceptance cases in
[the integration sequence](phase05-integration-notes.md#current-build-manual-sequence)
in the native application. Check selection colors/lasso, noun/verb selection,
Space three times then scalar 2 on a line grip, and polyline Add/Remove/Arc.

Phase 00 Korean Windows IME, minimum size and window-state restoration retain
their separate pending status. Installed Korean AutoCAD prompt, visual and
clipboard-bound comparisons remain on PARITY_CHECKLIST.md.

## Evidence to record

| Check                                                           | Result on 2026-10-19                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Prerequisite inventory                                          | Failed: missing MSVC and Windows SDK                                            |
| Locked native Cargo check                                       | Failed: link.exe missing, exit 101                                              |
| Native unit tests and release build                             | Not run; prerequisite gate still fails                                          |
| Contention helper itself                                        | Passed: distinct HWND blocks a second process; reopening succeeds after release |
| Two native windows: COPYBASE/paste, cut and undo                | Not run                                                                         |
| Actual JSON/PNG/CF_DIB/Unicode formats and external replacement | Not run                                                                         |
| Native busy-clipboard/cancellation and desktop shortcuts        | Not run                                                                         |
| Original acceptance cases in the native app                     | Not run                                                                         |

Retain command logs, the actual binary path/build date and screenshots of both
native windows. Phase 05 remains unaccepted until the required native checks pass.

The helper result is in `test-artifacts/phase05-clipboard-contention-result.json`:
the holder remained alive, the competing helper exited 1, and opening after
release exited 0. No Clipboard contents were read or replaced. This validates
only the helper; HanCAD's Rust bridge and its CUTCLIP contention scenario remain
unexecuted. Initial NULL-HWND helper experiments did not reliably establish an
overlap and are not counted as acceptance evidence.
