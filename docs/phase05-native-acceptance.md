# Phase 05 native Windows acceptance

Status on 2026-10-19: native compilation, all four Rust Clipboard unit tests,
the real two-window Clipboard sequence and all five original acceptance cases
pass after the user-authorized tool installation. Physical Windows key delivery
and installed AutoCAD comparison remain separate unverified checks.
MSVC toolset 14.51.36231
(linker 14.51.36260.0), Windows SDK 10.0.26100.0 and WebView2 155.0.4283.62
are present. The linker help probe returned 1100 with valid Microsoft help;
the readiness check now accepts that exact signature, with a regression covering
empty/unrelated output and launch errors. `pnpm check:desktop` reports ready.

The first post-install Cargo check failed because existing generated `target/`
directories had Windows ReadOnly attributes. Clearing that attribute only on
generated directories allowed the unchanged locked dependencies to compile.
Both `cargo check -p hancad-desktop --locked --offline` and
`cargo test -p hancad-desktop --lib --locked --offline` exited 0.
The earlier approval rejection is historical; the subsequent explicit
installation authorization superseded that hold. No new rejection occurred.

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
node scripts/verify-native-clipboard.mjs
node scripts/verify-native-wipeout.mjs
```

The tracked [two-window harness](../scripts/verify-native-clipboard.mjs) includes
the original selection/grip cases; the [mask/image harness](../scripts/verify-native-wipeout.mjs)
checks current WIPEOUT frame modes through real downloads and Clipboard images.
Both accept `--workspace`, `--binary` and `--port`. Defaults resolve the repository
from the script location and use its `target/release/hancad-desktop.exe`.
Local CDP ports 9223/9224 and 9225 must be free; a pre-spawn guard aborts on an
occupied port without connecting to its owner. A regression checks this guard.
The mask harness also requires Python with Pillow, as used by the repository's
image QA. Output remains under `test-artifacts/`; only harness-owned app processes
are closed. [The STA consumer](../scripts/native-clipboard-inspect.ps1) inspects
real Clipboard formats and compares decoded PNG/CF_BITMAP RGB pixels.

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
`DeviceIndependentBitmap` in .NET), `Bitmap` (CF_BITMAP), and `UnicodeText`. The text JSON must describe
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

| Check                                                             | Result on 2026-10-19                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Prerequisite inventory                                            | Passed: MSVC 14.51.36231, SDK 10.0.26100.0, WebView2 155.0.4283.62              |
| Locked native Cargo check                                         | Passed, locked/offline exit 0                                                   |
| Native unit tests and release build                               | Passed: 4 Rust tests; release build exit 0                                      |
| Contention helper itself                                          | Passed: distinct HWND blocks a second process; reopening succeeds after release |
| Two native windows: COPYBASE/paste, cut and undo                  | Passed in two actual Tauri processes through their WebView2 CDP endpoints       |
| Actual JSON/PNG/CF_DIB/CF_BITMAP/Unicode and external replacement | Passed: exact packet, image decoding and replacement rejection                  |
| Native busy-clipboard source/history preservation                 | Passed with the actual bounded Win32 clipboard holder                           |
| Native shortcuts and editable fields                              | Passed with WebView2-dispatched keys; physical SendInput remains unverified     |
| Original acceptance cases in the native app                       | Passed all five, including PLINE Add/Remove Vertex and Convert to Arc           |

Retain command logs, the actual binary path/build date and screenshots of both
native windows. The required Phase 05 native sequence passes; physical-input and
installed-reference distinctions below must remain explicit.

## Actual native continuation evidence

The final full native acceptance executable was `target/release/hancad-desktop.exe`
(10,546,176 bytes; SHA256
`DE8E3AF4ED597B2EAD4ADAF3367BBE4DCEF3870797D5DC8CE948EED2BA8A1D46`).
It was built and launched twice on 2026-10-19. Both independent processes served
`http://tauri.localhost/`, exposed the real Tauri internals and returned native
`platform_info` with `mode: desktop` and `clipboard`. No IPC or browser Clipboard
mock was installed. Per-process `WEBVIEW2_USER_DATA_FOLDER` and local CDP ports
allowed the [official Playwright WebView2 connection](https://playwright.dev/docs/webview2).
The Windows Computer Use service failed with native pipe os error 2 after the
prescribed retry and reset; screenshots are the actual native WebView content,
and injected WebView input is distinguished from physical Windows input.
The [computer-use skill](C:/Users/user/.codex/plugins/cache/openai-bundled/computer-use/26.1013.40934/skills/computer-use/SKILL.md) requires its
[guidance](C:/Users/user/.codex/plugins/cache/openai-bundled/computer-use/26.1013.40934/docs/guidance.md)
states: "Use only the Computer Use JS APIs for Windows app automation."
No direct Windows SendInput/UI Automation fallback was used. The application
integration tests instead connected to the actual WebView2 and real Tauri IPC.

The native run confirmed WCS endpoints (90,80)-(110,80), one-step paste Undo/Redo,
PASTEORIG, PASTEBLOCK and supported block DXF download/reopen, cross-process cut
and paste, actual clipboard contention preserving the source and history, and
external WinForms text replacement preventing stale-packet resurrection. All
seven Clipboard/Properties shortcuts and ordinary Ctrl+A text editing passed
through dispatched WebView events. Directional blue/green selection, lasso,
Shift removal, both command-selection orders, grip Space three times then
factor 2 and polyline Add/Remove Vertex/Convert to Arc passed in the native
renderer. Blue solid and green dashed overlay screenshots were inspected.
The script exited 0 and closed only its own two native processes.

The release build used `CARGO_NET_OFFLINE=true` and a JSON merge override with
`build.beforeBuildCommand: null`, embedding the production assets already
verified by the parent integration pass, including the final GPU and Clipboard
frame corrections. It finished in 4m52s. SHA256 inventories
before/after embedding confirmed all five production `apps/web/dist` files were
unchanged. The inventory and binary metadata are in
`test-artifacts/phase05-final-dist-before-native.json` and
`test-artifacts/phase05-native-final-binary.json`.

An actual consumer failure was found: .NET reported `ContainsImage=true` but
`GetImage()` returned null when only the top-down CF_DIB was published. The native
adapter now stages a real HBITMAP before opening/replacing the Clipboard and
publishes CF_BITMAP as well, retaining RAII cleanup until Windows takes ownership.
The consumer now decodes a 1024x82 image matching the registered PNG. An actual
RGB pixel comparison found no differences between the decoded CF_BITMAP and PNG.
PNG/DIB formats and exact geometry remain unchanged.

The final tracked mask harness changed WIPEOUTFRAME after creating an entity
with frameMode 1. Display/On/Off produced SVG path counts 1/2/1; exported 2400x1240
PNG nonwhite-pixel counts were 0/13920/0. Actual 1024x528 Clipboard images had
counts 0/5952/0, with zero PNG/CF_BITMAP RGB differences for every mode. The exact
source/packet frameMode remained 1. The final line copy also retained exact JSON,
all native image formats and a zero-difference 1024x82 decoded bitmap.

An earlier native PLINE case exposed an intermediate Phase 06 width-array
normalization regression: typed points left the start-point prompt active with
no geometry. That host regression was fixed; the complete native replay above
created the polyline and passed each multifunction action. Physical OS shortcuts, Paint UI paste,
Windows IME and installed AutoCAD comparisons remain unverified. Delayed native
cancellation/document switching retain their separately identified mocked-IPC
evidence; the actual Win32 contention case is now verified.

Logs are `test-artifacts/phase05-native-prerequisites-20261019.log`,
`phase05-native-check-20261019-current.log`, `phase05-native-tests-20261019.log`,
`phase05-native-release-final-current-20261019.log`,
`phase05-native-runtime-final-current-20261019.log` and
`phase06-native-export-clipboard-current-20261019.log`.
The tracked harnesses above produce result JSON, drawings, native downloads and
screenshots in `test-artifacts/phase05-native-runtime/` and
`test-artifacts/phase06-native-final-smoke/`. Earlier full-pass binary evidence is
retained in `test-artifacts/phase05-native-accepted-baseline-binary.json`.

The helper result is in `test-artifacts/phase05-clipboard-contention-result.json`:
the holder remained alive, the competing helper exited 1, and opening after
release exited 0. No Clipboard contents were read or replaced by that standalone
helper probe. The later two-window native run above separately verified HanCAD's
Rust bridge and CUTCLIP source/history preservation under actual contention;
that result supersedes the earlier helper-only status. Initial NULL-HWND helper
experiments did not reliably establish an overlap and are not counted as
acceptance evidence.
