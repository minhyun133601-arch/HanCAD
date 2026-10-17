# Phase 05 grip implementation evidence

## Scope and contract

`packages/draft/src/grip-*` supplies an extensible `GripProvider` registry, pure
entity transforms, multifunction actions and a headless `GripSession`. Current
editable entity families are LINE, POLYLINE/RECT, CIRCLE, ARC, TEXT and DIMENSION.
Every valid current family has exact definition or geometry grips. GRIPS=1 omits
additional polyline segment midpoint grips; GRIPS=2 includes them. GRIPOBJLIMIT=0
removes the limit. Locked and hidden geometry has no editable grips.

`apps/web/src/useGrips.ts` owns selection hot state, Shift multi-hot picking,
hover state/menu timing, command routing and one final `GRIP` journal publication.
The renderer receives `DisplayGrip` values with entityId, key, point, kind, hot and
hover; original source ids are hidden separately during replacement previews.
GRIPCOLOR/GRIPHOVER/GRIPHOT/GRIPCONTOUR/GRIPSIZE are renderer settings. GRIPTIPS uses
the native canvas title tooltip. GRIPMULTIFUNCTIONAL bit 1 permits bare Ctrl
cycling and bit 2 permits the 500 ms hover menu. A Ctrl shortcut or pointer click
while Ctrl is held does not trigger multifunction cycling. Value 0 suppresses
multifunction actions. Optional selected-subobject input restricts polyline
segment grips to their endpoints and segment midpoints.

Space and Enter cycle STRETCH, MOVE, ROTATE, SCALE, MIRROR. Base point, Copy, Undo,
Reference (rotate/scale), eXit and full-mode shortcut menus use the same coroutine.
Accepted copies stay provisional; Exit/Esc commits all retained placements once,
and local Undo removes only the last copy. Replacement finishes after one accepted
transform. Esc retains accepted copies and discards the unaccepted rubber band.

GRIPBLOCK=0 exposes one base grip for a persistent clipboard block; stretching that
grip moves every child. GRIPBLOCK=1 exposes child entity grips. Full-block
transforms update the block base point; copies get fresh block names and child
ids. Local Undo also removes the matching copied block metadata. The object limit
counts each selected clipboard block as one logical object.

GROUPDISPLAYMODE=1/2 exposes a single exact bounding-center grip for selectable
groups; GROUPDISPLAYMODE=0 or disabled PICKSTYLE exposes member entity grips.
Aggregate group stretch moves all members together, including nested clipboard
block insertion points. The root draws group bounds only for mode 2.
Grip copies retain separate anonymous groups when group selection is enabled;
each provisional placement receives unique group membership and local Undo removes
that placement's groups together with its entities. `getSnapEntities()` exposes
only accepted provisional copies for the shared snap index.

## Drafting integration

The session reuses `PointInputController` for coordinates, FROM, M2P, coordinate
filters, temporary tracking and typed snap overrides. Its snapshot exposes the
point input stage, temporary base, tracking points and angle lock. The root
editor resolves mouse points through the shared object snap/polar/tracking/
dynamic input pipeline before calling the grip session. Typed points use the
same resolver. The grip session does not reapply Ortho to an exact resolved point.
Interactive typed coordinates respect OSNAPCOORD=0/1/2; queued script coordinates
use script priority. Explicit typed or menu snap overrides take precedence.
Angle locks project preview and accepted mouse points identically. Subsidiary
modifier prompts replace the grip prompt; modifier source picks suppress edit
previews, and Enter at a TK continuation finishes tracking rather than cycling modes.
Circle quadrant scalar input specifies a new radius measured from its center.
Line Lengthen scalar input measures from the fixed opposite endpoint.

## Grip dimensional input

DYNDIVIS and DYNDIGRIP now control real object-result dimension fields, rather than
relabeling pointer displacement. DYNDIVIS=0 displays length change only; 1 displays
length change and resulting length; 2 filters the available result/change/absolute
angle/angle-change/arc-radius fields by DYNDIGRIP bits 1/2/4/8/16. The first two
settings ignore the bitmask, as documented by Autodesk. DYNMODE's dimensional bit
must also be enabled. Tab locks a field and cycles the visible fields. Editing a
complementary result/change field supersedes its previous equivalent constraint.

Single LINE endpoints and straight POLYLINE/RECT vertices measure length and
heading from the fixed neighbor. CIRCLE quadrant grips measure radius and radius
change. ARC and curved-polyline midpoint grips expose arc length/change, included
sweep/change and radius; radius inversion keeps the current minor/major branch.
Locked result lengths follow live cursor direction through the common point
constraint projector; length plus absolute angle produces one exact point.
Zero/negative resulting length and impossible arc radius remain pending and cannot
commit through either Enter or a mouse click. Computation retains full doubles.

TEXT/DIMENSION grips, ARC endpoints, centers, whole-object midpoint moves, aggregate
group/block grips and multiple hot grips retain the existing displacement input.
They do not expose fabricated object-result dimensions. Rich native dimension
annotation lines/placement and the exact AutoCAD cycle order for every imported
entity family are not claimed. Arc midpoint result-as-arc-length and
angle-as-included-sweep, and choosing the previous straight neighbor for an
interior polyline vertex, are explicit assumptions for installed-AutoCAD review.

Sources: Autodesk [DYNDIVIS](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-C2BB4EEB-D3FC-40AC-B479-A6E001E90947.htm),
[DYNDIGRIP](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-1EB33CCE-EF2C-4334-A90D-F8D5DAC9B0FA.htm),
and [Dimension Input Settings](https://help.autodesk.com/view/ACD/2026/ENU/?caas=caas%2Fdocumentation%2FCIV3D%2F2014%2FENU%2FfilesACD%2FGUID-65DF3E4D-ED53-4EBB-A6C4-2963595CE896-htm.html).

Polyline vertex menus offer Add Vertex, Remove Vertex and outgoing-segment
Convert to Arc/Line, plus Stretch. Segment midpoint menus expose segment edits.
Convert to Arc requires a non-collinear new arc point and retains an exact signed
bulge. Add Vertex creates two straight edges through the chosen vertex. Removing
a vertex joins its neighbors with a straight edge. At least two vertices remain.
Stretching a curved segment midpoint changes its exact bulge through the moved
arc midpoint while retaining the two endpoints; a straight segment midpoint moves
its endpoints together.
Polyline bulges use signed sweep in the transitional Y-down XY system; native WCS
and DXF boundaries invert the sign once. Reflection negates stored bulges.

## Verification evidence

- Focused Vitest: 26 grip tests pass across three files. Coverage includes all modes,
  three-blank scale acceptance, Base/Copy/Undo/Reference/Exit, multi-hot, providers,
  filtering/limits, line lengthen, circle radius, exact snaps and point modifiers,
  polyline actions, mirrored text behavior, blocks, normalization, arc midpoint
  snaps and supported DXF bulge round trips, group aggregate grips, point modifier
  priority/angle locks/TK completion, typed input source priority, copied group
  memberships/Undo and curved segment midpoint shape edits.
- The eight dimension-specific pure tests cover fixed-neighbor result lengths,
  circle/arc metrics, all visibility modes and masks, minor/major inversion,
  invalid/nonfinite values and collinear radius invalidation. The pre-existing
  dynamic input state and drafting aid focused tests also pass.
- Four additional app-level tests prove reciprocal length/angular lock release,
  independent length-plus-angle preservation, consistent Enter/mouse results,
  blank Tab behavior and replacement of coupled arc result/radius constraints.
- Strict TypeScript and focused ESLint pass on 2026-10-17.
- Production browser fixtures: all four pass. Scale by two/undo/redo and Shift
  multi-hot/provisional copies/Esc/one undo passed in the first usable build.
  Multifunction add/remove/arc conversion revealed stale hover state preventing
  the final same-grip menu reopening. The source now resets hover state on
  begin/finish; the rebuilt failed fixture passes (11.4 s) and covers the final
  Convert to Line operation. Screenshots are in the phase verification artifacts.
  A separate rebuilt fixture proves endpoint snapping over Ortho, 30-degree polar
  tracking and simultaneous dynamic distance/angle locks during grip stretch
  (8.3 s, `test-artifacts/phase05-grip-aids`). The root's final production run
  passed all five grip fixtures, including the modifier/group audit fixes and
  DYNDIVIS/DYNDIGRIP result fields with invalid mouse-commit rejection.
  The earlier startup -GROUP registration crash was fixed outside this workstream
  and is not grip verification evidence.
- Additional production verification passes all ten grip/Phase 04 dynamic-input
  fixtures (31.0 s), including DYNDIVIS=0/1/2, DYNDIGRIP mask zero/selected fields,
  invalid locked result length rejected on mouse input, and a line endpoint placed
  at resulting length 150/absolute angle 90 about its fixed neighbor. A subsequent
  fixture captures all four linear fields for final visual QA.
- Full phase verification is owned by the root integration pass.

## Official references and assumptions for the parity checklist

- Autodesk [To Edit Objects Using Grips](https://help.autodesk.com/view/ACD/2026/ENU/?caas=caas%2Fdocumentation%2FACDLT%2F2014%2FENU%2Ffiles%2FGUID-484774B4-8F67-4E19-8647-83A7D314782B-htm.html)
  documents mode cycling, multifunction hover/Ctrl and Ctrl copying.
- Autodesk [Just Grip It](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-DidYouKnow/files/GUID-BBEA1F71-EB16-4D49-80D9-970A6909F508.htm)
  documents the picked grip as default base, Base Point changes and repeated copies.
- Autodesk [About Editing with Grips](https://help.autodesk.com/view/ACD/2026/ENU/?caas=caas%2Fdocumentation%2FCIV3D%2F2014%2FENU%2FfilesACD%2FGUID-01DE459C-21A7-4E92-A1D6-E2C36CD89F0C-htm.html)
  documents the circle quadrant scalar radius exception.
- Autodesk [Rotate and Scale Objects by Reference](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DidYouKnow/files/GUID-D988658E-0A92-4353-B614-6C30CF6281A2.htm)
  supports numeric/two-point references and absolute new reference values.
- Installed Korean AutoCAD has not been compared. Exact Korean grip prompt wording,
  500 ms multifunction hover timing, adjacent curved-polyline edits after Add/Remove
  Vertex, and ARC endpoint three-point reconstruction remain manual parity items.
- MIRRTEXT=0 preserves readable text rotation and reflects insertion. The current
  transitional TEXT schema lacks full alignment, oblique/width and backward-text
  flags, so this is not a claim of complete native mirrored-text parity.
