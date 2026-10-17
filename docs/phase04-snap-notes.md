# Phase 04 object snap implementation notes

Recorded 2026-10-17 for integration into the phase documentation.

## Public integration

- `SnapIndex` prepares exact source geometry, static snap points and curve samples
  once, using the shared dynamic R-tree for finite bounds. `upsert`, `remove`,
  `replaceAll`, `prepared`, `query` and `sourcesNear` support editor caching.
- `querySnapCandidates(index, modelPoint, apertureInModelUnits, osmode, options)`
  returns all eligible candidates ordered by cursor distance and stable source
  order. Keep that list for Tab cycling. Snap positions use model Y down;
  `SnapSource.geometry` stays WCS Y up. Nonzero elevations remain on the returned
  point and `elevation` distinguishes true from apparent intersections.
- Options include `basePoint`, `osoptions`, `dynamicUcs`, explicit
  `extendedIntersection`/`intersectionSources`, and acquired `extensions`/`parallels`.
  Extended intersections are never enabled by the ordinary running INT bit.
- `acquiredSnapIntersections(first, second, osmode, {osoptions, dynamicUcs})`
  resolves explicit two-source extended picks even when the crossing is outside
  the second aperture. The result uses stable natural parameter order; the caller
  chooses the solution nearest the cursor if more than one exists.
- Tangent/perpendicular first picks carry a deferred constraint. Resolve the first
  point with `resolveDeferredSnap` after the second position is known, or use
  `resolveDeferredPair` when both picks carry constraints.
- `drawingSnapSources` merges legacy and native sources. Cache the resulting
  index between pointer moves. Native sources include actual NURBS weights,
  rotated ellipses, bulges, nested block transforms/base points, text/block
  insertion, dimension definition nodes and raw HATCH boundary curves.
- The renderer exposes all 14 `CadSnapKind` values and draws original marker
  glyphs; it does not contain copied Autodesk icons.
- `extensionTrackingPoints(source, acquired, target, tolerance)` supplies the
  actual conic continuation as model-space points with the requested chord
  tolerance. Optional `TrackingPath.points` and `CadTrackingPath.points` preserve
  curved extension paths through the renderer instead of drawing a straight
  endpoint-to-target chord. Native arcs, rotated ellipses and nonuniformly
  transformed bulged polylines share this path.

## Geometry and eligibility decisions

- Lines/conics use analytic intersection equations. Spline intersections use
  span samples for seeds and double-precision numerical refinement. Tangencies
  are retained when no scalar sign change exists. Half-length and centroid
  calculations integrate actual curves rather than their display tessellation.
- Natural conic extensions are represented as full circle/ellipse geometry.
  Evaluating an arc beyond parameter 1 would clamp in the geometry API and used
  to produce an incorrect extended intersection; both source orders are tested.
- Open spline extensions follow their endpoint tangents. This is an explicit
  parity assumption to check in installed AutoCAD; the current official object
  snap description documents extension lines/arcs without detailing NURBS rules.
- Circular quadrants remain on the current supported WCS XY axes after an
  in-plane block rotation. Rotated ellipse quadrants remain at the major/minor
  axis ends. Arbitrary UCS snapping belongs to later UCS support.
- A radial line from a circle center is perpendicular at every point. When that
  condition is requested, the cursor-nearest radial point is used.
- Insertion-only POINT proxies for TEXT/INSERT do not create Node or Nearest
  targets. Dimension definition points and dimension text origins do create
  Node targets. Locked visible layers remain eligible; invisible/frozen/erased
  objects do not.
- OSOPTIONS bit 1 suppresses hatch sources; bit 2 suppresses negative-Z
  acquisition only while dynamic UCS is active; bit 4 suppresses extension-line
  endpoints rather than every snap on that line. Apparent intersections also
  inspect the second source elevation for the negative-Z condition.
- HATCH snapping reads raw DXF polyline boundaries and line, circular, elliptical
  and spline edges without modifying the original database records. Hatch
  rendering/editing remains owned by its later phase.

## Reference evidence

The following Autodesk pages were checked during this session:

- [Object Snap tab](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-50383F73-4F23-4F70-B4FC-52D5748D80AF.htm)
  documents supported snap families, closed polyline/spline centroids,
  dimension-node targets and override-only extended intersections.
- [OSOPTIONS](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-LT/files/GUID-0D05BECE-0DC3-454D-999A-208C6DBC3C3E.htm)
  documents hatch, dynamic-UCS negative-Z and dimension extension endpoint bits.
- [HATCH DXF](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-C6C71CED-CE0F-4184-82A5-07AD6241F15B.htm)
  and its boundary-path children are already recorded in the repository's DXF
  reference inventory; the source adapter follows those group layouts.

Installed AutoCAD comparison remains necessary for the explicit spline extension
assumption, radial perpendicular ambiguity, near-tied candidate ordering,
rotated/quadrant display details and original marker appearance. Automated
geometry evidence does not constitute an installed-AutoCAD visual comparison.

## Actual focused verification

The curved extension overlay additionally clips natural conics analytically to
the current model viewport. Only the visible connected interval nearest the
cursor is tessellated; output is bounded to 4,097 points. Cursor-side trimming
preserves visible chord tolerance if the interval exceeds that budget. Invisible
curves return an empty sampled path rather than a false straight chord. A
radius-1e9 fixture at scale 262144 verifies fewer than 128 points, chord error
within 0.25 screen pixels and 100-query p95 below 4 ms. The final helper/overlay
focused batch passed all nine tests.

- `pnpm exec vitest run packages/draft/src/snap-query.test.ts
packages/draft/src/snap-intersections.test.ts packages/draft/src/snapping.test.ts
apps/web/src/native-snap-sources.test.ts
apps/web/src/object-snap-overrides.test.ts`: 5 files, 111 tests passed.
- Tests cover every mode where applicable, all 21 combinations of line, arc,
  circle, ellipse, spline and polyline at both endpoint and interior crossings,
  repeated tangency roots, deferred pairs, bulged polygon centroids, closed spline
  centroid, rotated/transformed curves, true/apparent elevation, distant explicit
  extended picks, OSOPTIONS, native insertion/block/node/hatch sources, index
  updates, suppression and legacy accepted-segment/override regressions.
- The cached 20,000-line index performance fixture executes 300 aperture queries
  and asserts p95 below 4 ms; it passed. This measures indexed query work after
  preparation, not initial native-source extraction or browser event-to-paint.
- Owned snap/native-source/marker files passed ESLint and Prettier after the
  complete workstream batch, including the dimension/quadrant additions.
  Whole-tree `pnpm typecheck` passed after those additions. The final phase-wide
  verification must also check the integrated application.
- No full verification, build, golden renderer run or browser acceptance was run
  by this geometry workstream; the root agent owns the final phase-wide pass.
- The follow-up curved-extension helper and renderer feature tests pass in a
  focused two-file run (6 tests). They verify circular/elliptical invariants,
  maximum circular chord error, backward continuation, transformed bulges and
  rendered curve points even when straight alignment paths use full-screen
  mode. Follow-up files pass ESLint/Prettier; whole-tree TypeScript also passes.
