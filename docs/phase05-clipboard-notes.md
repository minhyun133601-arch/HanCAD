# Phase 05 Clipboard and basic Properties notes

Current native execution evidence is in [native acceptance](phase05-native-acceptance.md).
The MSVC/SDK hold in the historical verification below has been resolved by the
user-authorized installation; actual native processes now exercise the bridge.

## References and decisions

- [COPYCLIP Korean help](https://help.autodesk.com/cloudhelp/2024/KOR/AutoCAD-Core/files/GUID-8C693775-7BB2-48D6-9A6B-770F8A870707.htm)
  describes offering all available formats and preferring the richest format when
  pasting in a drawing. HanCAD writes an exact JSON drawing format plus an image.
- [Autodesk Clipboard workflows](https://help.autodesk.com/cloudhelp/2025/KOR/AutoCAD-DidYouKnow/files/GUID-39A97950-6A89-4A01-A713-255600556C76.htm)
  confirms COPYBASE, CUTCLIP, PASTEBLOCK and PASTEORIG responsibilities and unique
  automatically assigned block names. COPYBASE stores the specified base point;
  PASTEORIG preserves stored coordinates regardless of that base point.
- [QPMODE Korean help](https://help.autodesk.com/cloudhelp/2025/KOR/AutoCAD-Core/files/GUID-1803CDBC-C0C9-4AB9-B76B-FF6AB214D97B.htm)
  specifies 0 disabled, 1 all objects, 2 supported configured types, negative
  values disabled with the magnitude remembered, and requires PICKFIRST=1.
  All current transitional entity types are supported by the basic palette.
- [Microsoft clipboard operations](https://learn.microsoft.com/windows/win32/dataxchg/clipboard-operations)
  and [clipboard formats](https://learn.microsoft.com/en-gb/windows/desktop/dataxchg/clipboard-formats)
  underpin the native ownership/format handling. The native bridge uses the
  actual Tauri HWND, registered `HanCAD.Drawing.v1` and `PNG`, CF_DIB, CF_BITMAP and
  CF_UNICODETEXT. Windows owns HGLOBAL only after SetClipboardData succeeds.

The [official Korean copy workflow](https://help.autodesk.com/cloudhelp/2022/KOR/AutoCAD-Core/files/GUID-345B759D-D758-488A-9E85-542A30A901C4.htm)
confirms COPYBASE's base-point-then-selection order.

COPYCLIP's inferred default base point is the lower-left selected-object bound
in WCS (min X/max Y in the transitional Y-down display model). COPYBASE prompts
for a base point before selecting objects when no PICKFIRST set is present.
The default bounds require an installed Korean AutoCAD comparison. JSON stores
double coordinates and optional Z directly; the image never reconstructs CAD.

## Implementation boundaries

`drawing-clipboard.ts` validates versioned payloads, filters noneditable entities,
remaps identifiers and merges missing layer/linetype definitions. Existing target
definitions win name collisions. Pasting is one state replacement and one undo
transaction; cutting removes objects only after copying succeeds. Point placement
uses the shared PointInputController and editor aid resolution.

Native Windows application instances exchange the system clipboard. Browser
ClipboardItem exposes image/png and text plus the web custom format when
supported; when browser OS permissions are unavailable, shared-origin IndexedDB
provides cross-window transfer and the command line explicitly reports that
fallback. A successfully read externally replaced clipboard never falls back to
stale HanCAD data. No cloud or network transfer is involved.

PASTEBLOCK stores persistent block membership separately from flattened display
geometry. `syncClipboardBlockRecords` materializes BLOCK_RECORD, BLOCK, native
children, ENDBLK and INSERT inside the same database transaction as the view.
Native records are updated in place so INSERT and member handles remain stable
through moves and property edits, including undo/redo.
Selection expands its membership regardless of PICKSTYLE; move/copy update base
points and identities. Supported DXF export writes actual BLOCK_RECORD/BLOCK/
ENDBLK definitions and INSERT entities, without also writing the members in model
space. Supported DXF import reconstructs top-level INSERT membership and base
points while baking rotation, scale, array spacing and nested transforms into
display geometry. Nested block definition sharing is not retained. INSERT Z
translation/scaling and text elevation now survive this path; selection GROUP
references resolve to the top-level INSERT and its imported member set.

This transitional representation is not complete block authoring: nested block
editing, complete dimension DXF records, OLE objects,
AutoCAD's proprietary clipboard formats and lossless foreign DWG transfers remain
later-phase work. Existing broad I/O fidelity limitations remain applicable.

Properties and Quick Properties expose common properties and current type-specific
geometry, with WCS coordinate/angle conversion, mixed values, layer locking and
validation before committing. Each accepted edit is one PROPERTIES undo item.
Full palette customization, anchoring/docking, user-defined QPMODE=2 type lists,
and per-property AutoCAD UI parity remain Phase 08 work.
Lineweight choices display ByLayer/ByBlock, the localized default and millimeters;
transparency choices display canonical ByLayer/ByBlock labels while retaining
their stored numeric/symbolic values. GLOSSARY.md keeps those two style names in
English in the Korean UI.

## Verification

### 2026-10-19 continuation

The native audit moved all HGLOBAL allocation/locking ahead of EmptyClipboard,
with RAII freeing unpublished blocks and releasing ownership only after
SetClipboardData succeeds. Preparation failures preserve the previous Clipboard;
publication itself can still partially fail because Win32 offers no transaction
across formats. A rejected write never authorizes CUTCLIP source deletion.
Native read limits now apply to NUL-terminated UTF-8 content, allowing allocation
padding. Four Rust payload/limit tests were added but cannot be compiled or run
until the native prerequisites are available.

The browser no longer reports success from a memory-only backup. IndexedDB is
the sole authoritative shared backup. The old localStorage path could retain a
newer copy while recovered IndexedDB returned an older COPYBASE packet; the
reproduced stale-base-point case motivated removing that second backend. Old
localStorage Clipboard data is ignored. If OS access and IndexedDB both fail,
the command reports a localized error and leaves source/selection/undo intact.
A successful system write remains valid when IndexedDB is unavailable.

`phase05-native-clipboard-contract.spec.ts` adds five production-command tests
with a mocked Tauri transport: exact JSON and decoded PNG/matching top-down
32-bit DIB, native paste routing, rejected CUT, Escape during pending CUT,
drawing switch during pending CUT, and unavailable OS/persistent browser storage.
The packet/paste checks share one scenario. The five tests plus the five existing
Clipboard/Properties tests passed together in 47.9 seconds against Vite.
Actual browser JSON+PNG Clipboard access was included. This is not actual Win32
or native application execution. A separate phase05-clipboard-backup.spec.ts
covers stale localStorage data, unavailable IndexedDB and successful system
writes without browser backup. Final results belong to PROGRESS.md.

### Historical verification before the authorized tool installation

The locked offline native Cargo check was attempted again and exited 101 at
dependency build scripts because link.exe is missing. Its log is
`test-artifacts/phase05-native-check-20261019.log`. The complete continuation
verification result is recorded in PROGRESS.md. Native build/two-window/format/
shortcut steps are prepared in phase05-native-acceptance.md.

- Focused Clipboard/Properties unit suite: 11 tests across drawing-clipboard.test.ts,
  entity-properties.test.ts and clipboard-block-dxf.test.ts. The native-handle
  regression additionally proves stable INSERT/member identities across movement,
  property edits and undo. The original eight tests passed before the DXF follow-up;
  its two round-trip tests and the additional handle test also passed.
- Supported-block round-trip follow-up: 2 added tests in clipboard-block-dxf.test.ts,
  plus affected importer/style/group regressions: 14 tests passed across four
  files. The fixtures cover all six supported entity families, curved polylines,
  dimensions/text, GROUP references, actual INSERT output, repeated round trips,
  survey coordinates, rotated/scaled/nested/array INSERT and transformed Z.
- Focused ESLint: passed for new Clipboard/Properties source and test modules.
- `cargo fmt --all`: passed for the native bridge.
- `pnpm check:desktop`: blocked by missing MSVC C++ tools and Windows SDK;
  native Clipboard code has not been compiled or executed in this environment.
- `cargo check -p hancad-desktop --locked --offline`: attempted; failed at
  dependency build scripts because `link.exe` is unavailable. The vswhere search
  for all Visual Studio products returned no installed instance, and no cl.exe,
  link.exe, rc.exe, vcvars64.bat or VsDevCmd.bat was found in the two Visual Studio
  installation roots. No Windows Kits installation was found. No packages were
  installed for this investigation.
- Production UI suite before the DXF follow-up: 5/5 passed in 19.6 seconds against the integrated
  build, output `test-artifacts/phase05-clipboard`. It covers Ctrl+Shift+C followed
  by Ctrl+V in another drawing, separate-window fallback, CUTCLIP/PASTEORIG/block
  persistence, Properties/Quick Properties and a real browser system clipboard
  containing exact HanCAD JSON plus PNG. This last test grants browser clipboard
  permissions and uses the actual Clipboard API; the independent-window test
  deliberately denies permissions to prove the fallback.
- The final integrated production pass also passed all five clipboard/property UI
  tests, including the added DXF save/reopen branch that asserts INSERT membership
  and base-point preservation. This evidence is recorded in
  `test-artifacts/phase05-verify-final.log`; failures elsewhere in that comprehensive
  pass are tracked by the root in PROGRESS.md.
- Browser UI/system-clipboard passes do not establish native Tauri/Win32
  clipboard acceptance, which remains blocked by the local native toolchain.

Installed AutoCAD comparison is outstanding for default clipboard bounds, exact
Korean prompt punctuation, duplicate definition messages and block grip behavior.

The official DWG fixture now has 71 editable entities, 133 skipped and 17
approximated, compared with the prior 70/134/18. An isolated HEAD/current importer
comparison identified exactly one recovered object: closed LWPOLYLINE handle
75B on Tavolo 3, with 3,635 finite vertices and 3,635 finite bulges. Its segment
lengths are 0.35367–0.51300 units, so it is not a degenerate object. The previous
importer expanded its arcs beyond the 10,000 tessellated-point guard and skipped
it (`polyline-curve-vertices`); current exact bulges avoid that expansion. The
official compatibility fixture now asserts the retained vertex/bulge counts and
bulge values. Detailed audit: `test-artifacts/phase05-dwg-audit.json`.
