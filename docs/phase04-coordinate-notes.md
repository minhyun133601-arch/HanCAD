# Phase 04 coordinate and LINE implementation notes

## Decisions and reference assumptions

- Model presentation uses Y down; typed Cartesian Y and WCS headings are converted
  at the point-input boundary. Z is optional in the transitional `CadPoint` and
  remains WCS elevation. Absolute XY uses ELEVATION and does not inherit an earlier
  point's Z. Relative XY inherits its base elevation. An omitted zero elevation
  remains absent so ordinary 2D geometry retains its existing representation.
- Unit notation is parsed without applying display precision. LUNITS/LUPREC and
  AUNITS/AUPREC format output. ANGBASE and ANGDIR affect heading input and output;
  explicit compass bearings use compass axes. ANGBASE and SNAPANG command inputs
  use current angle units, but numeric APIs and persisted variables use radians.
  POLARANG and POLARADDANG remain degrees. Coordinates and rotation prompts in
  existing drawing, dimension, text, inquiry, modification, offset and navigation
  sessions read a live coordinate-settings provider.
- OSNAPCOORD=0 gives running snaps priority; 1 gives typed input priority; 2 gives
  typed input priority except when the input source is a script. Explicit typed
  or shortcut-menu overrides take priority independently, and NON bypasses snap
  lookup. Script source metadata is available to queued/headless sessions; this
  does not implement the later SCRIPT command. The explicit-override interaction
  and direct-distance behavior should also be checked in desktop AutoCAD.
  [Autodesk OSNAPCOORD](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-94994960-5E62-4044-BEF7-9CF91667F641.htm)
- Point filters, FROM, M2P/MTP, TT/TK and angle locking share a state machine for
  text and pointer input. Modifier samples do not create entities or change
  LASTPOINT. A successful sample consumes one pending snap override. Invalid
  acquisition and rejected zero-length/deferred input retain their modifier.
  Inline forms such as `M2P 0,0` and `.X 10,20` use the same sequence.
- LINE Close becomes available after two accepted segments. Enter can continue
  from the latest line/polyline endpoint or the tangent at an arc endpoint.
  Deferred Perpendicular/Tangent resolves the first point when the second point
  fixes the geometry; the preview uses the same resolver as acceptance. Local U
  removes the latest accepted point; at the first point it returns to the first
  prompt. The latter and the exact Korean no-continuation wording remain manual
  checks because the published LINE page does not spell them out.
  [Autodesk LINE](https://help.autodesk.com/view/ACDLT/2026/ENU/?caas=caas%2Fdocumentation%2FACD%2F2014%2FENU%2Ffiles%2FGUID-E8C1190C-A26C-484C-ADDD-DDF81666F69F-htm.html)
- Surveyor cardinal headings are East=0, North=90, West=180 and South=270 degrees.
  DIESEL/status angular formatting shares the coordinate formatter, correcting
  the earlier cardinal-axis swap. Angular DMS examples and all unit families are
  covered by fixtures. UNITMODE/DIMZIN suppression behavior beyond the existing
  supported display format still needs reference comparison.
  [Autodesk string conversions](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-AutoLISP/files/GUID-A38E30D4-684E-44FA-A910-E08522876414.htm)

## Supported-model elevation preservation

The transitional normalizer validates and preserves finite optional Z instead of
silently deleting it. LINE accepts a vertical segment with no XY displacement.
MOVE/COPY retains elevation and supports a Z displacement. Supported DXF LINE,
CIRCLE/ARC and TEXT point records retain Z. Uniform polyline elevation uses
LWPOLYLINE group 38; varying elevation uses 3D POLYLINE/VERTEX records with owned
handles. The vendor parser omits VERTEX group 30, so the adapter restores those
values from source DXF records without editing the vendor source. DXF serialization
retains stored doubles instead of rounding coordinates to six decimals.

These changes preserve supported point data and do not establish full 3D editing,
arbitrary INSERT Z transformations, lossless unsupported DXF-object preservation
or DWG save acceptance. The renderer continues to display an XY projection.

## Actual focused verification on 2026-10-17

- Initial new-feature run: 66 tests across eight files, 63 passed. Two failures
  required tolerance-based floating-point assertions; a real failure exposed
  the vendor POLYLINE VERTEX Z omission. All three were corrected. The affected
  three-file batch then passed all 17 tests.
- Expanded focused run: 135 tests across 18 files, 134 passed. The remaining
  failure exposed a TEXT rotation regression for 450-degree input. Restoring
  full-turn normalization fixed it; the affected TEXT/settings/editing batch
  passed all 13 tests afterward.
- `pnpm typecheck` passed after the expanded batch. This is a whole-tree strict
  TypeScript check, not phase acceptance or a production-build claim.
- The later shared DIST display-format adjustment passed the affected eight
  settings/inquiry tests. It now applies angular base/direction in radians through
  the shared formatter instead of treating ANGBASE radians as degrees.
- Final coordinate review: six coordinate/LINE/Z/unit/sysvar/DIESEL test files
  passed all 55 tests. Focused ESLint on all owned TypeScript changes passed with
  zero warnings. Runtime JavaScript retains each file's original line-ending and
  formatting style, including the existing CRLF exporter file.
- New fixtures cover OSNAPCOORD's six keyboard/script combinations, explicit
  override priority/expiry/rejection, inline M2P/filter/FROM/TT input, exact Phase
  04 LINE examples, no continuation/local U, deferred tangent preview/commit,
  live unit settings and optional-Z normalization/precise DXF round trips.

The parent phase owns final `pnpm verify`, production-build/manual acceptance,
osnap fixtures, renderer checks and the phase-completion documentation. No actual
AutoCAD executable comparison has been performed by this task.

## Canonical drafting commands added during final audit

GRID, SNAP, ORTHO, ISOPLANE and ISODRAFT now share pure prompt replay and queued
execution through `CommandDefinition.nextPrompt`. GRID supports spacing and X
multiples, On/Off, Snap, Major, Adaptive/subdivision, Limits, Follow and independent
Aspect. SNAP supports spacing, On/Off, Aspect, Legacy, Standard/Isometric style
with follow-up spacing and Polar/Grid type. Isometric Aspect is explicitly
rejected. ORTHO On disables polar tracking as the existing keyboard toggle does.
ISOPLANE changes the stored plane independently; ISODRAFT enables/disables the
isometric style and selecting a plane selects grid snap type. Related drawing
variable writes form one undo group; prompt inspection and rejected/cancelled
answer sequences do not mutate settings.

SNAPGRIDLEGACY was missing from the inventory and is now registered with its
published profile scope, integer 0/1 range and default zero. The catalog now has
864 definitions, including 802 available fixed/selected defaults.

The official command pages describe the option behavior but omit several literal
subprompt strings. Korean subprompts use the published option terms; exact
punctuation/default wording, isometric vertical-spacing storage, conditional
subdivision prompting, and automatic restoration of all ISODRAFT-related settings
remain desktop-reference checks. The command layer changes SNAPSTYL/SNAPTYPE and
SNAPISOPAIR; derived axes remain the shared editor's responsibility.

Sources: [GRID](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-LT/files/GUID-7EC38AD6-FA34-4115-9E1C-6F13E1BA033D.htm),
[SNAP](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-F47F4AAF-4859-45D4-846C-3742268834A9.htm),
[ORTHO](https://help.autodesk.com/cloudhelp/2024/KOR/AutoCAD-MAC-Core/files/GUID-128AC5D7-72B0-498F-958D-7F619A73EC5F.htm),
[ISOPLANE](https://help.autodesk.com/cloudhelp/2015/KOR/AutoCAD-LT/files/GUID-9B1EEA63-BEC1-413E-B69F-541B5865F1A1.htm),
[ISODRAFT](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-061FA171-5425-481C-B24C-887C4E195A7B.htm),
[SNAPGRIDLEGACY](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-4ED2C55C-B432-4AEF-A8E8-FBD3F6A7A689.htm).

Focused final-audit verification: drafting-command and sysvar-catalog suites passed
all 16 tests, and whole-tree strict TypeScript passed. COMMANDS and SYSVARS were
regenerated. The new canonical-command browser test passed on the live dev build
at port 1421 (one test), including Korean multi-step prompts, invalid Major input,
SNAP style/Legacy, ISOPLANE/ISODRAFT and transparent ORTHO during LINE. The temporary
dev-only Playwright config was removed afterward. The production build remains
owned by the parent verification pass.
