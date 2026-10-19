# Phase 07 curve editing implementation notes

Reference review: 2026-10-19. These notes describe implemented behavior and
reference assumptions; they do not certify equivalence with an installed
AutoCAD geometry kernel.

## Official Autodesk references

- [BREAK](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-36A1CDE0-3871-4B25-AC98-93235FA83863.htm):
  projection of off-curve points, replacement First point, counterclockwise
  circular removal and same-point splitting.
- [BREAKATPOINT](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-E0439DE0-B2C3-4233-BB4D-5A574A00694B.htm):
  open LINE, ARC and polyline eligibility.
- [JOIN](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-4D2A28C3-3E7F-4830-BE6A-7C9907C95488.htm):
  source-type restrictions and result types for simultaneous selection.
- [EXPLODE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-E98BCEF4-DED6-48A6-87EB-10FE87188083.htm):
  component types, centerline placement of wide polyline segments, and one
  grouping level per invocation.
- [PEDIT](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-0C422AA9-23DD-4650-AD66-68E9D7989E3F.htm)
  and [2D polyline options](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-MAC-Core/files/GUID-648BDC21-E835-478F-A318-9D201479998D.htm):
  conversion, jointypes, vertex modes, curve fitting, control-frame retention,
  SPLINETYPE, SPLINESEGS and local Undo.
- [SPLINEDIT](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-5530922C-6828-48B1-804C-EDD9053535BD.htm):
  fit and control-frame modes, order limit 26, conversion precision 0–99,
  PLINECONVERTMODE and DELOBJ.
- [LENGTHEN](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-76C74C62-DBAA-41E7-8422-F0EE7E769638.htm):
  delta/angle/percent/total/dynamic endpoint changes and length inquiry.
- [REVERSE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-EAE8C2C3-B780-4501-9CBD-C06346CC9F2E.htm):
  supported curve types and directed linetype motivation.

## Implementation and verification

The eight command factories use the shared DrawProgram input coroutine and
return replacement/erasure batches for one command transaction. Accepted edits
remain provisional until completion or Escape; command-local Undo restores
provisional geometry without losing unjoined source objects. The common exact
curve adapter is also used by TRIM/EXTEND.

Rational spline splitting uses homogeneous knot insertion, including clamping
the active domain of periodic splines. Refinement preserves geometry. Degree
elevation uses exact Bezier elevation; spline joins preserve rational weights
and create C0 joints. Circular and elliptical arcs convert to rational quadratic
segments. Polyline slicing preserves circular bulges and interpolated segment
widths. Positive SPLINESEGS produces line approximation segments; negative
values produce fitted arc pairs while retaining the original control frame.

Focused verification: seven curve editing, polyline fitting, spline data, nested
selection, option audit and persistence test files contain 47 feature tests.
They cover mathematical spline invariants, periodic domains, exact arc/width
slices, BREAK projection/First/@, JOIN result types, wide EXPLODE, Clipboard block
membership, LENGTHEN modes/local Undo, PEDIT modes and SPLINEDIT edits/conversion.
The final option audit additionally covers PEDIT Extend/Both joins for circular
segments, fitted-polyline vertex Break/Straighten/Regen and all Fit Data branches.
SPLINEDIT records intentional C0 fit joints in validated `kinkFitIndices`
metadata. Piecewise refitting preserves those joints through Move, Tolerance,
Add/Delete, Close/Open, Reverse, affine transforms and recovery. Regression tests
check derivative discontinuity as well as native SPLINE DXF and owned-metadata
round-trips; the metadata is discarded on Purge/control-frame conversion.
Strict TypeScript and focused ESLint passed after the final product changes.
All eight production browser cases in `apps/web/tests/phase07-curve-edit.spec.ts`
passed in the comprehensive run 4 on `index-o20F18au.js`. They cover JOIN result
types and Undo/Redo, PEDIT Width and continuous linetype, wide EXPLODE with its
Korean warning and Undo, BREAK First/@ and Undo, SPLINEDIT degree/reverse/
conversion/recovery, LENGTHEN Dynamic preview/Escape/Undo, PEDIT Multiple nested
window selection, single-source ARC JOIN Close and Kink persistence through
Move/Tolerance/reload. The two screenshots under `test-artifacts/hancad-e2e/`
were opened and visually inspected: `wide-polyline-explode-warning.png` shows
the joined centerline LINE/ARC and readable Korean width/tangent warning;
`splinedit-converted-polyline.png` shows the continuous approximation and
readable conversion prompts. The earlier six-case result remains under
`test-artifacts/phase07-curve-edit-e2e-final/`.

The shared selection-host audit repaired Previous retention when advancing from
selection into a modifying coroutine and routed transparent FILTER completion
through its parent selection controller. Existing selection regressions retain
their original coordinate, identity and Undo/Redo assertions; stale base-point
prompt expectations now include the documented Displacement option. The final
ARC JOIN check also caught and repaired three damaged Korean strings. The nine
failed run-3 browser cases and both native-HATCH cases subsequently passed in
one 11-case affected run (29.4 seconds;
`test-artifacts/phase07-browser-failed-rerun.log`), followed by the comprehensive run-4
result: 1181 unit tests in 161 files, 32 compatibility tests, renderer QA and
192 browser tests passed; only the explicitly supplied personal-DWG case was
skipped. Log: `test-artifacts/phase07-verify-run4-20261019.log`. Later native-ID-map
affected verification and Windows release acceptance are recorded in the shared
Phase 07 acceptance document; they are separate from this browser evidence.

The two cases in `phase07-native-hatch-mirror.spec.ts` also passed in run 4.
They open a real native HCD through the file UI and verify native HATCH boundary
coordinates/bulges, MIRRHATCH 0/1 pattern angles/base/offset/seed, unchanged dash
and XDATA/style metadata, original-object Previous selection after keep-source
MIRROR, mixed LINE/native one-step U/REDO and recovery. The exact imported bytes
are preserved as `test-artifacts/phase07-native-hatch-mirror-mode0.hcd` and
`phase07-native-hatch-mirror-mode1.hcd` for Windows acceptance. These cases do not
save HATCH image captures: native pattern rendering remains unsupported, so raw
definition checks make no visual-pattern parity claim. Subsequent execution of
those same fixtures in actual Tauri/WebView2 passed both cases, including exact
U/REDO/reload graphs, with no page errors. The 13-case native modify script also
passed JOIN LINE, JOIN LINE+ARC and wide EXPLODE warning/restoration. Logs:
`test-artifacts/phase07-native-hatch-20261019.log` and
`test-artifacts/phase07-native-modify-20261019.log`.

Earlier browser runs are retained in `phase07-curve-edit-e2e` and
`phase07-curve-edit-e2e-rerun`. They identified missing PLINECONVERTMODE and
PLINEREVERSEWIDTHS catalog definitions, a converted spline's mismatched width
array lengths, and an overstrict assertion on rounded mouse coordinates. The
catalog now contains both profile variables, conversion passes actual runtime
normalization, and BREAK's exact location is supplied through First point.

The additional OVERKILL geometry review uses Autodesk's
[command reference](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-44B9ECFC-752C-4CC5-9DA3-84DBF3B17CA6.htm)
and [command-line options](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-0916FE53-F816-4C40-AA5E-5E8CBFD7F73F.htm).
Eight focused geometry tests cover angular-seam merging, circular-plane
eligibility, zero/collinear polyline segments, width slopes, independent
extensions beyond polyline-covered intervals, clockwise arc subtraction and
Break permission. Together with existing property tests and curve editing tests,
the affected nine-file run passed 62 tests. No installed-AutoCAD cleanup corpus
comparison has been performed.

## Assumptions requiring reference checks

Record these in the shared DECISIONS/PARITY_CHECKLIST documents as Phase 07
reference items:

1. Autodesk does not publish its Fit biarc construction, precise spline-fit
   sampling distribution, or spline-to-polyline precision formula. HanCAD uses
   balanced tangent-continuous biarc pairs, normalized-parameter spline-fit
   samples and `(precision + 1) × span count` conversion segments. Arc conversion
   uses each interval's exact midpoint to choose its bulge. Compare geometry
   and vertex counts at precision 0, 10 and 99, including negative SPLINESEGS.
2. Source JOIN restrictions are enforced for interactive single-source selection.
   The normal app selection host supplies simultaneous selection. Compare arcs
   and elliptical arcs across the 0/360-degree seam, overlapping arcs and gaps;
   those angular ordering cases need installed-AutoCAD confirmation.
3. HELIX-to-spline joining uses cubic Hermite spans, 32 per turn with a 4096-span
   cap. The original analytic helix cannot be represented by a finite rational
   spline in general. Compare AutoCAD's resulting spline tolerance/control count
   for conical, many-turn and non-WCS-axis helixes.
4. PEDIT retains vertex tangent directions in validated `peditTangents` drawing
   metadata, along with the original frame and widths. Check persistence through
   native DXF serialization, which currently has no dedicated fit-frame encoding.
5. SPLINEDIT control Add uses shape-preserving knot insertion at the nearest
   curve parameter. Verify the exact reference prompt and behavior for an
   off-curve point and closed-spline tangent edits. Intentional Kink continuity is
   preserved and regression-tested; compare the exact fitted shape with AutoCAD.
6. EXPLODE supports current editable polyline, REGION, MLINE, dimension and
   flattened Clipboard-block representations. Native INSERT attributes, nested
   xrefs, 3D faces/solids, MTEXT and leaders belong to their later owning phases.
   Those unsupported native object types are not fabricated by this command.
7. The requested additional SPLINEDIT Refine input is accepted as `REFINE`/`A`
   and inserts one knot. The current official Windows command reference lists
   Add under Edit Vertex rather than a top-level Refine prompt.
