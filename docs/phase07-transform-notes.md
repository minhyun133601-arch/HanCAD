# Phase 07 transform and array implementation notes

## Implemented command surface

- MOVE: base/second point, first point as displacement, explicit/default
  Displacement, remembered displacement, provisional preview, identity-preserving
  replacement and one command result.
- COPY: those displacement forms; COPYMODE Single/Multiple; mOde; temporary
  Multiple; repeated placements; Array item count including the original; Fit;
  Exit; Undo of the latest accepted placement batch. Escape retains accepted
  copies and their block/group memberships in one command result.
- ROTATE and SCALE: Copy, scalar or cursor result, Reference by scalar or two
  reference points, and Points for the new angle/length. Coordinate notation and
  angular notation use the existing input pipeline.
- MIRROR: two-point mirror line, keep/erase originals, exact curve reflection,
  polyline bulge reversal and MIRRTEXT glyph reflection metadata. The renderer and
  exporters consume `mirroredX` outside this command package.
- STRETCH: the union of captured crossing windows/polygons, per-acquisition IDs,
  individual-pick provenance, endpoint/vertex masks,
  insertion-point movement for flattened blocks, center-point movement for
  circles and ellipses, and whole movement for a selection without crossing
  masks. The existing grip providers keep native curve data synchronized.
- ALIGN: one-pair translation, two-pair rotation with an explicit optional scale,
  and three-pair orthonormal frame alignment without scale. Coincident or
  collinear definition pairs are rejected. Exact curve data uses affine matrices.
- ARRAYRECT: independent items; Base point, Count, Spacing/Unit cell,
  Columns/Rows/Levels with Total spacing, incremental row elevation, arithmetic
  Expression, Exit and a cancelable proposed-array preview.
- ARRAYPOLAR: independent items; Base point, arbitrary two-point Axis of rotation,
  Items, Angle between, Fill angle, Rows, Levels, Rotate items, arithmetic
  Expression and Exit. A partial fill includes both ends; a full revolution does
  not duplicate its first item.
- ARRAYPATH: all supported finite path curves, endpoint-oriented path selection,
  Divide/Measure, Base point, Tangent direction by two points or Normal, Items,
  Fill entire path, Rows, Levels, Align items, Z direction and Exit. Placement
  uses adaptive arc-length inversion, not tessellated outline lengths. DELOBJ
  controls source retention for the relocated path items.
- ARRAY delegates to the three modern patterns. `-ARRAY` follows the classic
  rectangular/polar sequence with unit cells, signed spacing, SNAPANG, optional
  polar base point, count/fill/angle derivation and Rotate items.

Transforms preserve source entity identities; copies get fresh identities.
Selected complete flattened blocks retain or duplicate insertion points and
membership, including their local X-axis rotation. The CHANGE block helper edits
insertion and absolute rotation together. Complete selected groups duplicate as anonymous groups. Array edit
previews use `previewEntities`, which Escape never commits. The host is responsible
for preserving object draw ranks while applying replacements.

## Primary references consulted on 2026-10-19

- [COPY command](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-1CF9287F-06E8-4D03-8377-2E130862FE02.htm)
  documents displacement, COPYMODE, temporary Multiple, item counting and Fit.
- [Rotate and Scale Objects by Reference](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-DidYouKnow/files/GUID-D988658E-0A92-4353-B614-6C30CF6281A2.htm)
  documents angle/length reference and ALIGN point-pair semantics.
- [The Stretch and Lengthen Commands](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DidYouKnow/files/GUID-19FDC9E4-049E-40BA-AB6D-58A4C2557570.htm)
  documents several crossing selections and circle/block insertion-point masks.
- [STRETCH command](https://help.autodesk.com/view/ACD/2026/ENU/?caas=caas%2Fdocumentation%2FACDLT%2F2014%2FENU%2Ffiles%2FGUID-F000A502-D39E-4D31-A8E2-4A626473FB72-htm.html)
  distinguishes individually selected and completely enclosed objects.
- [ALIGN command](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-MAC-Core/files/GUID-C377D6FE-683E-4007-B06C-8FBBB1308E67.htm)
  confirms that three pairs do not offer scaling.
- [MIRROR command](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-Core/files/GUID-595277C8-9B87-4CFB-A3AF-769537A22F3D.htm)
  documents MIRRTEXT and source erasure.
- [MIRRHATCH](https://help.autodesk.com/view/ACD/2027/ENU/?caas=caas%2Fdocumentation%2FACD%2F2014%2FENU%2Ffiles%2FGUID-427D4868-B3BF-48F1-8BB8-04FE1B3976D4-htm.html)
  distinguishes boundary mirroring from hatch-pattern direction.
- [ARRAYRECT](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Core/files/GUID-BB3DA888-0C3A-4C68-A3ED-E0E528781205.htm),
  [ARRAYPOLAR](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-A6E74297-2CB3-4B1C-A07B-69CD08630052.htm),
  [ARRAYPATH](https://help.autodesk.com/cloudhelp/2027/ENU/AutoCAD-Core/files/GUID-D36C46CD-4E17-4A16-A387-C0B158EA5A9E.htm),
  and [classic -ARRAY](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-MAC-Core/files/GUID-8336B4CD-5375-4290-BD08-7D9E022741F6.htm)
  define the available pattern options and classic SNAPANG behavior.

## Assumptions and parity checks requiring installed AutoCAD

These are reference assumptions, not claims that an installed AutoCAD comparison
has passed. The root phase report must retain any unresolved differences.

1. Direct Korean versions of the relevant command help URLs returned unavailable
   content during research. Korean wording follows existing project terminology;
   exact Korean option spelling and punctuation need a Korean AutoCAD check.
2. Default modern rectangular/polar previews use 4 columns by 3 rows and 6 items;
   initial row/column spacing is 1.5 times the selection's geometric extent, with
   a one-unit fallback for zero extent. Text-only extents currently use their
   insertion anchors. Compare initial values with the metric reference template.
3. Relative ROTATE angles ignore ANGBASE, honor ANGDIR and use the configured
   angular notation. Verify nonzero ANGBASE and clockwise ANGDIR reference cases.
4. MOVE and COPY remember displacement independently in drawing command memory.
   Verify their default-vector sharing and persistence against the reference.
5. STRETCH arc endpoint reconstruction reuses the accepted grip provider's fixed
   midpoint construction. Compare a single endpoint and both-endpoints crossing
   case, especially when the arc interior is outside the crossing polygon.
6. The host captures per-object individual-pick provenance separately from
   crossing masks. STRETCH moves those objects wholly even when crossing windows
   are also present; a focused regression covers the mixed selection.
7. MIRROR now accepts top-level native model-space HATCH records through its
   command selection stage (ALL, window/crossing and boundary point picks).
   Inquiry adapters expose exact boundary curves without adding compatibility
   entities to the drawing. The result clones the native definition, its owned
   extension graph and opaque properties with fresh handles. Native and legacy
   edits publish in one atomic undo entry; a native-only edit also publishes the
   view after its graph changes so recovery contains the complete result.
   Previous selection retains the original native IDs after a keep-source copy,
   matching the existing COPY rule. Presence pruning includes live top-level
   native HATCH handles and invalidates Previous when a selected source vanishes.
   Editor IDs use a native namespace with deterministic escaping against every
   legacy ID. A database-owned host map keeps each allocation fixed and reserves
   all previously observed legacy IDs, so deletion, U and later native additions
   cannot recycle a former legacy Previous identity. The command receives that
   map separately; persistent database handles remain unchanged. Boundary-only and
   legacy-only selection regressions cover both raw-handle and reserved-prefix
   collisions, preventing an unrelated object from being edited.
   Supported boundaries are bulged polylines and line, circular arc, elliptical
   arc and rational/nonrational spline edges, including OCS normals/elevation,
   spline fit points and tangents. Pattern scale, dash lengths, hatch style,
   user/custom name, XDATA and unknown records survive. MIRRHATCH 0 preserves
   pattern line/global angles and offset vectors; 1 reflects them. Both reflect
   pattern line base points and seed points. This origin/phase choice and the
   local-angle interpretation for tilted MIRRHATCH 0 remain reference checks;
   the official variable description specifies direction but not origin phase.
   Associative HATCH records (71 or source boundary references), gradients and
   malformed/unknown boundary records cancel the entire MIRROR with a concrete
   Korean notice, without partial edits. Nested INSERT-owned HATCH is excluded
   from this Phase 7 native selection path. Native HATCH pattern rendering is
   still unsupported and the completion notice states that limitation; raw
   definition/geometry tests are not a claim of visual hatch parity. HATCH
   creation, gradient rendering and associativity remain Phase 12 scope.
8. Nonassociative rectangular/polar arrays reuse the existing first item and
   produce independent remaining items; path arrays relocate all generated items
   and honor DELOBJ for their original sources. Verify DELOBJ 0/1 and object
   handles for each modern pattern.
9. Path Maintain Z uses an orthonormal frame constrained by the global Z axis;
   disabled Z uses shortest-vector alignment. Compare banking on a spatial helix
   and Normal tangent mode with the reference before certifying 3D equivalence.
   PEDIT tangent metadata is a scalar WCS XY angle. Arbitrary affine 3D tilt stores
   its projected XY heading; a vertical projection retains its preceding heading.
   Full spatial tangent persistence would need a plane basis or vector metadata.
10. Array limits use the documented default 100000 generated objects. There is
    no MaxArray registry/environment setting in the current Platform interface;
    configurable environment integration belongs to the later automation work.
11. Associative Yes is explicitly refused with a Phase 16 notice. The current
    phase intentionally emits only independent arrays as requested.

## Focused verification evidence

The five focused Vitest files passed 44 tests after the final implementation:
`modify-transform.test.ts`, `modify-array.test.ts` and
`modify-transform-metadata.test.ts`, `modify-transform-fit.test.ts`, and
`modify-change-blocks.test.ts`. They compare independent expected coordinates,
reference results, immutable batches, COPY Escape behavior, exact 3D alignment,
array spacing and membership metadata. ESLint for the owned source/test files
passed. Together with existing grip-provider/session/drawing-grip regressions,
81 tests in nine files passed after centralizing mirrored glyph and PEDIT
tangent transforms and preserving block rotation in the existing grip and drag
implementations. All eight production browser cases passed in 56.0 seconds on
`index-tG8-5q0h.js`, with captures under
`test-artifacts/phase07-transform-browser-final/`. They cover real selection,
keyboard options, mixed STRETCH provenance, Korean MIRRTEXT 0/1 glyph rendering,
cancelable previews and one-command undo. The glyph, COPY, rectangular and path
array captures were visually inspected. The subsequent shared block-rotation
preservation changes passed the focused 81-test regression. This note does not
certify comprehensive phase acceptance.

The native HATCH addendum has focused tests in `native-hatch-mirror.test.ts`
and `complete-native-copies.test.ts`. They verify independent reflected curve
samples for every edge type, OCS elevation, MIRRHATCH 0/1 angle/base/offset/seed
and unchanged dashes, exact selection geometry, opaque XDATA and extension
dictionary cloning, mixed native/legacy one-step undo/redo, native-only cache
publication order, invalid source rejection and injected commit failures with
preexisting redo and user undo groups. The existing command-publication and
transform regressions are included in its focused run. Browser native-HCD
acceptance is maintained separately in `phase07-native-hatch-mirror.spec.ts`.

Final affected production-browser verification passed 43 cases in 2.2 minutes,
including all eight transform/array scenarios and native-HCD MIRRHATCH 0/1 with
Previous selection. Evidence: `test-artifacts/phase07-final-affected-20261019.log`.
The focused native/selection/commit/snap/transform unit run passed 56 tests after
the fixed editor-ID lifetime map, with typecheck, ESLint and formatting passing.

Windows WebView2 release acceptance on `index-npQPAXT8.js` then passed the 13
modify-command cases and the two native HATCH cases, with no uncaught page errors.
The 13-case log is `test-artifacts/phase07-native-modify-20261019.log`; it includes
MOVE/ROTATE/COPY, OFFSET gap types 0/1/2, Shift FILLET, JOIN/EXPLODE, OVERKILL's
dialog, CHPROP and command-level undo/redo. The HATCH result is recorded in
`test-artifacts/phase07-native-hatch-20261019.log` and
`test-artifacts/phase07-native-hatch-mirror/results.json`. Both modes verified the
raw boundary, pattern angle/base/offset/dashes/seeds, XDATA, source retention or
erasure, Previous selection, complete native graph and legacy entity restoration
with one U, exact REDO and recovery reload. Source/undo native JSON files have
identical SHA-256 hashes, as do accepted/redo/reloaded native JSON files.

The native HATCH runner records 12 screenshots with paired legacy and raw-native
JSON snapshots under `test-artifacts/phase07-native-hatch-mirror/`. The mode-0
accepted image and mode-1 rendered image were visually inspected: the Korean
completion notice explicitly identifies unsupported HATCH pattern display, and
the mixed case displays its mirrored legacy LINE. These are data/command
acceptance captures and do not certify visual hatch parity. Input was dispatched
through WebView2 CDP, not physical Windows SendInput.

Two initial harness attempts were retained as
`test-artifacts/phase07-native-hatch-20261019-attempt1.log` and
`test-artifacts/phase07-native-hatch-20261019-attempt2.log`. The intentionally minimal browser HCD fixture
omits the optional recovery `documentId`; waiting for it was an invalid harness
assumption. Its missing style-cache identity also emits the generic autosave
warning, which is not evidence of exhausted storage: raw native recovery data was
present. Import completion now waits for a new active file tab and native graph.
The other harness issue compared a reflected LINE coordinate of
`-9.999999999999998` to `-10` with strict equality; independent expected-coordinate
checks now use 1e-9 tolerance while U/REDO/reload graph comparisons remain exact.
No product source changes were needed for these harness corrections.

Official references for this addendum:

- [MIRRHATCH](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-427D4868-B3BF-48F1-8BB8-04FE1B3976D4.htm)
  defines 0 as retaining direction and 1 as mirroring direction.
- [HATCH boundary path data](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-DC5215D6-E73F-4DFF-8BE9-01CA9610FAEE.htm)
  defines the OCS coordinates, bulges, four edge representations, fit data and
  boundary references preserved by the raw transformer.
- [HATCH pattern data](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-7C05C0EC-B0FB-4A86-A164-B9E5C6C03990.htm)
  defines per-line angle, base point, offset and dash records.
- [Hatch pattern definitions](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Customization/files/GUID-A6F2E6FF-1717-44B6-A476-0CA817ADD77E.htm)
  describes line families and absolute origins. No Autodesk pattern library is
  included; tests use an original synthetic user pattern.
