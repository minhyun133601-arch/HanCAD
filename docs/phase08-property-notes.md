# Phase 08 properties and object isolation

## Implemented behavior

The Properties palette groups supported values under General, 3D Visualization,
Geometry and Misc. A type selector narrows both displayed values and the objects
affected by an edit. Quick Select and Select Objects invoke the registered
commands; the PICKADD button switches between replacement and additive selection.
Mixed values keep the existing `*VARIES*` data representation and Korean
`*다양함*` presentation. With no selection, the palette edits current CLAYER,
CECOLOR, CELTYPE, CELTSCALE, CELWEIGHT, CETRANSPARENCY and THICKNESS.
Current True Color is converted to canonical RGB CECOLOR syntax; transparency
inheritance is converted to the system variable's integer -1/-2 representation.

Numeric geometry values accept the existing safe numeric-expression parser,
including arithmetic, parentheses, powers and supported mathematical functions.
Expressions cannot access JavaScript or drawing data. Circle diameter is editable;
area and circumference are measured values. Existing LINE length remains read-only.
All selected-object validation occurs before creating the replacement state.

Native DXF entities now share the same editable geometry model as drawing-created
entities. LINE endpoints, POINT position, CIRCLE/ARC centers and radii, ARC angles,
ELLIPSE center/major and minor radii/ratio/parameters, and XLINE/RAY base points and
directions are editable. Directions normalize after an edit. LWPOLYLINE and 2D
POLYLINE expose Current Vertex, OCS vertex X/Y, elevation, bulge, global and vertex
widths, and Closed; 3D POLYLINE exposes WCS vertex X/Y/Z and Closed. SPLINE exposes
selected control and fit point coordinates, positive weights, fit tolerance and
Closed. Fit-point changes reuse SPLINEDIT fitting; control/weight edits discard
obsolete fit/tangent data. Counts, spline degree and measured lengths are read-only.

Native inquiry adapters remain transient. The property commit converts only
changed values to mapped DXF fields in the owning database, preserving persistent
handles, owners, extrusion, unedited raw groups, XDATA and other object data.
Circle/arc WCS center edits convert back into the original OCS. Old-style POLYLINE
edits patch the actual owned VERTEX records, retaining SEQEND and the ownership
graph; raw-only records also work. Mixed legacy/native edits validate before the
atomic transaction and commit both storage paths in one undo group. The existing
inquiry/identity caches and no-native entities-array identity fast path remain.

Quick Properties reads QPMODE/PICKFIRST and QPLOCATION. Location 0 places the
palette near the pointer at selection time; location 1 uses its fixed workspace
location. Rollover data shows type, color, layer and linetype. The host supplies the
hover identity and client coordinates; the tooltip opens after 500 ms and reads
ROLLOVERTIPS. Repeated movement over the same object does not rerender the palette.

MATCHPROP reads one source followed by destination selection or Settings. Settings
contain basic attributes plus supported Text, Dimension, Polyline and Material
special properties. Raw inheritance attributes are copied, including clearing a
destination True Color override when the source uses ACI/ByLayer. Locked
destinations are skipped. Text contents/height/rotation and polyline elevation are
not replaced. Polyline linetype generation and constant width are copied; a source
with variable widths does not transfer width. Native style IDs not yet exposed by
the editor remain the responsibility of later text/dimension phases.

The controller publishes a provisional MATCHPROP state, then commits once at
Enter or Escape. Earlier destinations retain the settings used at their first
acceptance even when later settings or the current selection change. The host integrates this state with the renderer. Source picks
are handled directly; destination windows/fences use the shared selection host.
Cancelling before choosing destinations leaves the drawing unchanged.

The extracted property-command registration also consumes a nonempty headless
input queue. Source/destination identities and ALL use the same selection policy,
matching session, native-capable property host and single final commit. Settings
dialog answers are supplied as booleans in the shared checkbox order after S;
these are dialog-result data rather than additional command-line keywords. An
empty queue preserves interactive command startup. Queued Escape retains accepted
MATCHPROP destinations, while invalid source/input does not create a partial edit.

ISOLATEOBJECTS and HIDEOBJECTS accumulate an independent object visibility set.
UNISOLATEOBJECTS removes it without changing entities or layer state. The drawing
contract is `objectIsolation: { hiddenIds: string[], persistent: boolean }`.
OBJECTISOLATIONMODE 0 is restored only within the current drawing session;
mode 1 retains visibility on reopening. Cache and native-file entry points end
temporary isolation; Undo/Redo retains the exact snapshot without reopen cleanup.
The host owns normalized metadata, native object identity, renderer, picker,
selection and snap filtering, and persisted file/recovery handling.

## Official references and parity checks

- [Properties, Korean help](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-GettingStarted/files/GUID-0621F211-3587-4932-BB3D-4D92ECB58042.htm): common properties, multiple selection, no-selection defaults and MATCHPROP.
- [Properties palette, Korean help](https://help.autodesk.com/cloudhelp/2025/KOR/AutoCAD-DidYouKnow/files/GUID-94C065AB-FF9E-4752-B778-23D2FBB87E18.htm): categories and selection tools.
- [Geometry changes in Properties](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-LT-DidYouKnow/files/GUID-94C065AB-FF9E-4752-B778-23D2FBB87E18.htm): Current Vertex coordinates, polyline elevation/Closed and geometry changes.
- [Property Settings dialog](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-E228268B-F773-4911-9E61-588155B1B2C9.htm): copy eligibility and special property restrictions.
- [MATCHPROP workflow, Korean help](https://help.autodesk.com/cloudhelp/2020/KOR/AutoCAD-DidYouKnow/files/GUID-B40824DE-CE30-4664-8958-82DB21205AC7.htm): destination preview, repeated target selection, Enter/Escape completion.
- [QPLOCATION](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-9536F299-E9E4-4418-B809-5AF5AFA5DF7C.htm): cursor-relative 0 versus fixed 1.
- [OBJECTISOLATIONMODE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT/files/GUID-B4ED98BE-62D0-4982-82A2-87B744C56F99.htm): session-only 0 versus persistent 1.

Installed Korean AutoCAD comparison remains required for exact Korean MATCHPROP
prompt wording, the Quick Properties pointer offset, tooltip delay and palette
layout. Plot Style editing/matching is disabled while PSTYLEMODE indicates color-dependent plot mode.
The persistence flag is currently captured when hiding/isolating; compare changing
OBJECTISOLATIONMODE after a hide but before saving in installed AutoCAD.
No unsupported viewport, hatch, table or multileader special properties are
presented as implemented. Fixed-location Quick Properties dragging/customization
and customizable tooltip fields remain future UI parity work.

## Focused verification

On 2026-10-19, workspace strict TypeScript and ESLint on the owned property files
pass. Focused Vitest: 5 files, 19 tests pass. Coverage includes expression safety,
ACI versus True Color, geometry immutability, source inheritance, disabled match
settings, per-destination settings retention, locked destinations, special property restrictions, stacked isolation,
layer preservation and mode-dependent reopening. Full phase verification and
browser/native acceptance are owned by the integrating phase host; these notes do
not claim those gates passed.

The native geometry audit adds nine focused cases in
`native-property-geometry.test.ts`. Together with entity Properties, phase
integration and actual headless command tests, the affected pass is four files,
25 tests passing. Every successful native geometry edit checks exact serialized
database U/REDO and one journal group, including raw ARC with arbitrary OCS,
POINT/ELLIPSE, elevated LWPOLYLINE, owned raw VERTEX and 3D POLYLINE, spline refit,
control/weight changes and closing, tilted CIRCLE, normalized RAY and mixed
legacy/native ARC radius changes. Tests also cover persistent handles/owners,
raw vendor groups, vertex IDs, XDATA and validation without journal mutation.
The new `phase08-native-properties.spec.ts` provides actual HCD ARC/POINT palette
expression edits, raw DXF/render changes, U/REDO and reopen coverage; its browser
execution belongs to the integrating host's final affected pass.

The complete focused browser specification `phase08-properties.spec.ts` passes
all six cases in 1.4 minutes against the integrated development build. Artifacts:
`test-artifacts/phase08-properties-complete/`. It covers mixed edits and type
filtering, expression validation, exact entity U/REDO, MATCHPROP Settings and
Escape, no-selection defaults, three-object stacked HIDE/ISOLATE, exact layer
preservation, region-raster changes, hidden picking/selection, mode 0/1 reopening,
QPLOCATION and ROLLOVERTIPS. Earlier focused failures exposed a stale test camera
mapping, an overly broad screenshot containing command history, native inquiry
layer metadata leaking into property commits, and a native-cache recovery path
that bypassed temporary-isolation cleanup; all are fixed and the six cases pass.

## Manual checks for integration

1. Create a LINE and CIRCLE on different layers/colors. Select both, enter
   `PROPERTIES`, and verify varying common values. Edit color once and press Enter;
   both update. Press U once, then REDO, and verify the complete two-object edit.
2. Choose Circle in the palette type selector, set Diameter to `(20 + 10) * 2`, and
   press Enter. Only the circle changes and its radius becomes 30.
3. Clear selection, change current color in the palette, run LINE and create one
   segment. The new line inherits the new current color.
4. Enter `MATCHPROP`, pick a source, enter `S`, disable Color, confirm, pick a
   destination and press Enter. Layer/linetype copy while destination color stays.
   One U/REDO restores/reapplies the complete operation. Repeat with Escape after a
   destination pick; accepted destinations remain changed.
5. Select one object, enter `HIDEOBJECTS`, then select another and enter
   `ISOLATEOBJECTS`. Enter `UNISOLATEOBJECTS`; all original visibility returns,
   including the layer off/frozen states. U/REDO restore the independent hide set.
6. Set OBJECTISOLATIONMODE to 0, hide an object, save/reopen and verify it reappears.
   Repeat with mode 1 and verify it remains hidden. End isolation explicitly.
7. Set QPMODE to 1 and QPLOCATION to 0, select objects near opposite canvas corners
   and verify cursor-relative placement. Set QPLOCATION to 1 and verify fixed
   placement. Clear selection, hover an object and toggle ROLLOVERTIPS 0/1.
