# @hancad/geom

## Responsibility

Pure double-precision geometry and the optional Rust/WASM numerical kernel.

## Allowed dependencies

None; generated geometry-wasm runtime only.

## Current status

Pure double-precision 2D utilities and a DXF-field adapter for POINT, LINE,
CIRCLE, ARC, ELLIPSE, LWPOLYLINE, 2D/3D POLYLINE, SPLINE, XLINE and RAY.
The adapter returns explicit supported, invalid or unsupported results; it does
not replace the database's lossless raw-field storage. OCS coordinates use
Autodesk's arbitrary-axis convention. Geometry has no database dependency.

The 3D API supplies evaluation, closest points, bounds, length, area and affine
transforms. Finite parameters use 0..1, while XLINE/RAY parameters use their
direction vector. Infinite extents are explicitly typed and contain Infinity;
they are inquiry results rather than JSON drawing data. Area closes open finite
curves with a straight chord and measures wide polylines at their centerline.
Nonplanar or inapplicable area returns undefined. Curves are never tessellated
into replacement source geometry.

Stored NURBS control points, weights and knots define spline shape. Fit-only
data uses exact cubic interpolation with chord, centripetal or uniform spacing,
optional tangent magnitudes and periodic C2 closure. Omitted open-curve tangents
use natural boundary conditions; this assumption needs comparison with AutoCAD. Nonzero fit
tolerance is preserved while the generated curve interpolates exactly.
Fit-only periodic curves accept supplied endpoint derivatives only when they
match the unique periodic cubic for the existing fit parameters, within floating
point roundoff. Other endpoint constraints return an explicit unsupported result;
endpoint tangents are never ignored or used to invent extra knots. General
periodic/tangent reconstruction still needs implementation and AutoCAD comparison.
Stored NURBS geometry with the same fit metadata remains fully evaluable.

Autodesk's [SPLINE command reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-5E7D51E2-1595-4E0C-85F8-2D7CBD166A08.htm)
describes cubic fit interpolation, parameterization, endpoint tangency and C2
periodic closure. Its [NurbCurve3d.SetFitData reference](https://help.autodesk.com/cloudhelp/2026/ENU/OARX-ManagedRefGuide/files/OARX-ManagedRefGuide-Autodesk_AutoCAD_Geometry_NurbCurve3d_SetFitData_KnotCollection_Point3dCollection_Vector3d_Vector3d_Tolerance__MarshalAsUnmanagedType_U1__bool.html)
allows periodic fit data with tangents but does not specify the knot construction
needed for general combined constraints. These references establish the required
behavior, not numerical parity of HanCAD's current reconstruction.

Analytic bounds/closest points are exact for simple circular and linear curves.
Spline control-hull bounds, curved-width polyline bounds and transformed-wrapper
bounds explicitly report conservative quality. Ellipse/spline closest points and
length/area integrals are numerical. The closest search subdivides every knot
span before minimization; it does not certify global minima for adversarial
high-degree or extreme-weight NURBS.

Similarity transforms preserve circles/arcs. General nonsingular affine transforms
convert conics to exact ellipses and transform NURBS control data. Nonuniform
polyline transforms retain a source-plus-matrix geometry wrapper to preserve
bulges and width profiles. Database entity writeback, spatial indexing and hot-path
WASM geometry beyond the existing bootstrap remain later integration work.
