# Phase 06 curves and freehand commands

## Integration boundary

`packages/draft/src/draw-curves.ts` exports `curvePrograms` for CIRCLE, ARC,
ELLIPSE, SPLINE, XLINE and RAY. The ribbon uses CIRCLE with the TTT construction
keyword; it does not register a new public command name.
`draw-extra-curves.ts` exports `extraCurvePrograms` for SKETCH and HELIX.
All commands use the same `DrawProgram` coroutine protocol as interactive and
headless input. Scalar strings use drawing length/angle parsing; acquired points
use the established model Y-down boundary. Exact geometry metadata uses WCS Y-up.

The circle and arc compatibility entities retain their existing types. Ellipses,
splines and infinite construction lines carry exact `CurveGeometry`; their short
compatibility point arrays are not curve definitions. HELIX has an analytic
geometry definition, derivative, conservative spatial bounds and winding-aware
integration, picking, snapping and adaptive display spans. A transformed helix
retains its definition under an exact affine wrapper.

The host owns command transactions, scalar/coordinate acquisition, object snaps,
dynamic input, cancellation and committed continuation. Repeated construction
lines expose `partial`; SPLINE Object also exposes `partialEraseIds`. SKETCH
streams tagged pointer samples while normal point inputs toggle the pen.
Scalar angle prompts expose an angle field. Locked scalar values use disposable
coroutine replay for exact construction previews and share their value with mouse
acceptance. Replay never commits geometry or remembered variables. Coordinate
modifiers and OSNAPCOORD apply to scalar point acquisition as well as point
prompts. MULTIPLE wraps drawing factories and checkpoints each completed iteration
as an individual undo step; other command families are explicitly unavailable to
this drawing-specific wrapper.
Command-only defaults live in a module WeakMap keyed by the drawing database.
They survive active-document remounts when switching tabs, remain independent
between drawings, and are not serialized into a drawing or profile.

## Implemented constructions

- CIRCLE: center/radius, diameter, 2P, 3P, line/arc/circle Ttr, and three-object
  tangency. Signed offset loci and the Apollonius equations produce tangent
  circles; picked tangent locations rank multiple solutions. CIRCLERAD updates
  after a successful construction.
- ARC: all eleven center/start/end/angle/chord/radius/direction ribbon sequences,
  either direction for three points, signed angles, major arcs for negative
  radii/chords, and Enter tangent continuation from lines, arcs and bulged
  polylines. Center-defined endpoints are projected onto the defining circle.
- ELLIPSE: axis endpoints, Center, projected-circle Rotation, elliptical Arc,
  angle/parameter switching, Included angle and SNAPSTYL-gated Isocircle with
  SNAPISOPAIR. A first axis shorter than the second remains representable.
- SPLINE: Fit or CV, chord/centripetal/uniform knots, degree 1 through 10, Undo,
  Close, endpoint tangent input and fit tolerance. Fit curves use the existing
  exact cubic interpolator; SPLPERIODIC selects periodic or legacy closure. Object accepts marked
  quadratic/cubic spline-fit polylines and honors DELOBJ; normal polylines are
  intentionally rejected. Import adapters must mark spline-fit source data as
  `POLYLINE_SPLINE_QUADRATIC` or `POLYLINE_SPLINE_CUBIC` (or retain an exact spline
  with a `POLYLINE_SPLINE` source prefix).
- XLINE: repeated through points, Hor, Ver, Ang, Reference, Bisect and Offset
  distance/Through. RAY supports repeated rays from one start point.
- SKETCH: pen down/up, freehand pointer samples, Line/Polyline/Spline Type,
  Increment and Tolerance. SKPOLY, SKETCHINC, SKTOLERANCE and PLINETYPE are read
  from the host. Completed strokes and accepted samples survive Escape.
- HELIX: base/top radius or diameter, Turns up to 500, turn Height, CW/CCW Twist,
  height zero for a planar spiral, and Axis endpoint. Radius, turns, height and
  twist defaults are remembered in session memory. The source also retains axis
  orientation and Z height, although the application remains a 2D view.

## Autodesk reference evidence

The following official documentation was checked on 2026-10-19. These sources
establish available construction methods and meaning of their input; they are
not evidence that a live AutoCAD comparison has been performed.

- [CIRCLE, Korean](https://help.autodesk.com/cloudhelp/2025/KOR/AutoCAD-Core/files/GUID-C60B6D5D-AAEB-420F-917F-6E6B47E92F48.htm):
  supported constructions and preference for tangencies near picked locations.
- [ARC, Korean](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-30ECFD30-A1D6-4D60-9DD1-B487603F6772.htm):
  construction families, signed angles/radii/chords and Enter continuation.
- [ELLIPSE, Korean](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-45F9C588-2BA9-414D-8AFD-FB6B448BF273.htm):
  axes, rotation, arc parameters and isometric availability.
- [SPLINE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-5E7D51E2-1595-4E0C-85F8-2D7CBD166A08.htm):
  Fit/CV, degrees, knot modes, tangency, closure and Object restrictions.
- [XLINE, Korean](https://help.autodesk.com/cloudhelp/2022/KOR/AutoCAD-Core/files/GUID-40650DCE-E8CA-483C-8E25-7FA9AB6992C1.htm):
  infinite construction geometry and its options.
- [SNAPISOPAIR](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-10E95216-5E3C-45F2-A6B9-79E7660A1F60.htm):
  0 Left, 1 Top and 2 Right.
- [SKETCH, Korean](https://help.autodesk.com/cloudhelp/2027/KOR/AutoCAD-LT/files/GUID-EFF06F5D-E8B2-44D9-8CE6-D8C100A37AAA.htm):
  freehand type, increment threshold and spline tolerance.
- [HELIX, Korean](https://help.autodesk.com/cloudhelp/2020/KOR/AutoCAD-Core/files/GUID-C6FE985E-8978-4D11-8490-D81CFB323CDD.htm):
  defaults, radius constraints, winding limit and construction options.

## Decisions requiring the real AutoCAD parity checklist

1. The existing cubic Fit solver uses natural endpoint conditions when tangency
   is accepted with Enter. Interactive tangent picks constrain direction, with
   the unconstrained derivative magnitude retained. Positive Fit tolerance is
   stored as metadata, while the generated spline still interpolates each accepted
   fit point exactly; it does not smooth or simplify the fit data. The closed form
   is preserved. Autodesk's internal spline fit solver and tangent
   magnitudes are not specified by Help; compare control records and interior
   evaluation points with real AutoCAD before claiming numerical kernel parity.
2. Elliptical arc angle input is measured from the first axis direction; angle
   values convert to ellipse parameters, while Parameter uses the native cosine/
   sine parameter. Verify the endpoint reference orientation in Korean AutoCAD,
   especially when the first axis is the shorter one and when switching modes.
3. Isocircle dimensions use the unforeshortened isometric-plane projection
   (principal radii `r*sqrt(3/2)` and `r/sqrt(2)`). Verify picked-radius behavior and
   the three isoplane rotations against a metric AutoCAD drawing.
4. Tangent line loci use the supporting infinite line and arc loci use the
   supporting circle. Verify AutoCAD's rejection/extension rules for tangent picks
   beyond trimmed arc extents, coincident objects and no-solution cases.
5. SKETCH retains every pointer sample beyond the increment and fits cubic splines
   through accepted points. Positive tolerance does not currently simplify those
   points. Verify between-sample deviations, pen toggling and exact localized
   prompt wording with a real mouse in AutoCAD.
6. HELIX is retained analytically. Its affine wrappers and the drawing recovery
   metadata preserve its definition. Native HELIX DXF subclass/control data and
   Autodesk's own spline approximation require later I/O parity evidence.
7. Autodesk's 2026 SPLINE command topic documents degree 1..10, but its
   [SPLDEGREE topic](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-40B00336-C1EB-47A4-8773-FFB22B8C931C.htm)
   specifies a writable session value 1..5, initially 3. The variable follows that
   documented range; command degrees 6..10 retain their default in private session
   memory. A subsequent external SPLDEGREE change clears that memory. Compare the
   actual variable after degree 6..10 constructions in current Windows AutoCAD to
   resolve this documented conflict. SPLPERIODIC uses the documented profile
   default 1 and accepts 0/1.

## Focused verification

Nine focused test files passed: 70 tests across curve construction scripts,
the shared input/commit host, analytic helix geometry and spiral display/picking.
Scripts compare expected
geometry within an absolute 1e-9 tolerance, include all eleven ARC sequences,
degree 1..10 CV splines, tangent circles, parameterized ellipses, periodic closure,
freehand sampling, repeated construction geometry and a survey-coordinate circle.
Strict TypeScript also passed after the final scalar-field and host changes.
Eleven production browser acceptance cases also passed, including the required
PLINE Arc/Line/Width sequence, rectangle Fillet memory, ARC Enter continuation,
ellipse center grips, scalar angle fields, exact source recovery, MULTIPLE POINT,
freehand SKETCH, Korean style dialogs, REGION and cloud/wipeout recovery. Screenshots
are preserved in `test-artifacts/phase06-visual/` independently of Playwright's
per-run output cleanup.
A further production regression passed for REC Fillet 5, NEW, a different Fillet 2
in the new drawing, and switching back and forth: each prompt retains its own
document's default after the editor remounts.

These checks do not replace the phase-end `pnpm verify`, browser/manual command
acceptance, grip acceptance, native DXF round trips or real AutoCAD comparisons.
