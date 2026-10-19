# Phase 06 clouds, wipeouts and regions

`regionOutlineFactories` in `packages/draft/src/draw-region-outlines.ts` registers
REVCLOUD, WIPEOUT and REGION with the shared drawing coroutine host.

REVCLOUD supports Rectangular, Polygonal, Freehand, Object, Arc length, Normal and
Calligraphy Style, Modify and direction reversal. Freehand requests consume tagged
cursor samples through the host. Modify retains original cloud corner metadata,
replaces a path between existing vertices, and lets the user choose which old side
to erase. REVCLOUDCREATEMODE, REVCLOUDAPPROXARCLEN, REVCLOUDARCVARIANCE and
REVCLOUDSCALEMODE control mode, chord length, variation and DIMSCALE multiplication.
The first chord length is initialized to 2% of the current view diagonal, then
remembered. Exact scallop bulges, tapered calligraphy widths and intended boundary
vertices survive independently of preview tessellation.

WIPEOUT retains its polygon as a background-colored mask. It accepts point input
or a closed, straight, zero-width polyline, supports optional source deletion,
and reads/writes all three WIPEOUTFRAME modes. Self-intersections, nonplanarity
and zero-area boundaries are rejected. Concave boundaries remain whole polygons;
the renderer owns triangulation and background-color compositing.

REGION joins end-connected source curves into planar loops, preserving oriented
WCS LINE/ARC/CIRCLE/ELLIPSE/SPLINE boundaries in `regionLoops`, with actual area in
`regionArea`. Polylines are split into their exact line/arc pieces. Viewport proxy
points are separate from the retained topology. Reversed/shuffled edges and
arbitrary planar orientations are supported. Each disjoint closed loop becomes
one region, including nested closed loops. Crossing/self-intersecting loops,
overlapping straight segments, open chains and nonplanar input are rejected.
DELOBJ=0 preserves source objects; other values remove only successfully converted
sources. Text, dimensions, wipeouts and filled SOLID/TRACE geometry are not treated
as fabricated curve boundaries. Completion reports the number of regions created.

## Official references

- [Autodesk REVCLOUD command](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Core/files/GUID-7BC6D4B1-5279-4B5F-90E0-AC87DA861E78.htm)
  documents the modes, replacement-side workflow and approximate chord lengths.
- [Autodesk revision-cloud workflow](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-MAC-Core/files/GUID-64B0BFA5-CBC8-487E-B36B-33E60315BABE.htm)
  describes cursor-driven freehand input, object conversion and style persistence.
- [Autodesk REVCLOUDAPPROXARCLEN](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-EA1AE5FF-6DE4-49D2-A422-10294CF8FACB.htm)
  supplies the variable's initial value and variation bounds.
- [Autodesk REVCLOUDSCALEMODE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT/files/GUID-61211E9D-DA8A-45ED-B3F3-E9EAB3DD1565.htm)
  defines optional DIMSCALE multiplication.
- [Autodesk REVCLOUDCREATEMODE](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Core/files/GUID-5D91AC1F-7F44-412A-8BFE-E9152EC5AF4F.htm)
  defines mode values and the Rectangular default.
- [Autodesk WIPEOUT command](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-4AD79F4F-A759-4310-A62D-4792FAA7B0EA.htm)
  defines polygon masks and frame display/plot behavior.
- [Autodesk Korean wipeout workflow](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-DidYouKnow/files/GUID-F4E4ADB8-F2C4-448D-9E16-C4831DC6D832.htm)
  supplies Korean prompts and confirms that source polylines cannot contain arcs.
- [Autodesk REGION command](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-ADD055CD-D351-424C-91F0-B8E5526B106C.htm)
  defines supported curve types, closed planar loops, crossing rejection and DELOBJ.
- [Autodesk REVCLOUDGRIPS](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Core/files/GUID-7790D277-F11B-4AA3-BC97-40DF1C27CC7F.htm)
  defines profile default 1 for limited cloud grips and 0 for individual arc grips.
  The live setting participates in grip caching. Mode 0 exposes polyline vertices
  and, with GRIPS=2, exact arc midpoints; stretching them retains untouched scallops
  and per-segment widths. Mode 1 stretches the saved cloud boundary and regenerates
  scallops with the original variance, style and inward/outward direction.

## Explicit assumptions and remaining comparisons

Autodesk does not publish the scallop subdivision algorithm, random seed,
individual arc sweep or exact first-view percentage. HanCAD currently uses exact
110-degree circular scallops, deterministic alternating 2/3 and 4/3 chord weights
when variance is enabled, a 2% view-diagonal initialization, and calligraphy ending
width equal to 10% of the chord setting. Compare these values and distribution
against installed AutoCAD before accepting full visual parity. Numerical spline
self-intersection checks use a 128-piece candidate path; pathological crossings
smaller than a candidate interval require stronger future root isolation.

REGION retains native exact boundary data in recovery. A sampled polyline export
alone is not an ACIS REGION round trip. Confirm the I/O adapter's reported export
limitations; never describe a proxy export as exact REGION serialization. Work is
bounded at 4096 source edges and 65536 cloud arcs, with explicit rejection required
at the host boundary instead of silently truncating geometry.

## Focused verification

On 2026-10-19, 17 focused tests passed across `draw-cloud.test.ts`,
`draw-region.test.ts` and `draw-wipeout.test.ts`. Coverage includes all cloud
construction modes, style/default persistence, scale handling, tagged freehand
samples, Object conversion, Modify replacement selection, concave masks and all
frame modes, shuffled/reversed exact region edges, circular/semicircular area,
vertical planes, nested loops, deletion policy and invalid geometry. Analytic
geometry assertions use 1e-9 or tighter tolerances. The phase's complete browser,
renderer, native export and regression verification remains a separate requirement.

A later focused regression run passed 41 tests across `draw-cloud-grips.test.ts`,
`draw-grips.test.ts`, `draw-cloud.test.ts`, `grip-providers.test.ts` and
`grip-session.test.ts`, followed by strict typechecking and affected-file ESLint.
It covers live REVCLOUDGRIPS switching, individual chord and circular-midpoint
editing, saved calligraphy widths, reversed scallops across corner edits and
Modify, and directed elliptical-arc endpoint grips. These are source checks; the
phase-end production browser run remains the integration evidence.
