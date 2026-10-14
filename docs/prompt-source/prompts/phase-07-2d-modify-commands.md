PHASE 7 — 2D modify commands
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–6 are done.

Goal: every 2D editing command with AutoCAD's exact options, results, and previews.

Build each with Korean prompts, command preview where AutoCAD has it, and headless tests:
- MOVE, COPY (Displacement, mOde single/multiple, Array; COPYMODE), ROTATE (Copy, Reference with Points), SCALE (Copy, Reference), MIRROR (MIRRTEXT, MIRRHATCH), STRETCH (crossing window or polygon, several windows), ALIGN (two or three point pairs, scale option).
- OFFSET (Through, Erase, Layer, Multiple, Exit, Undo; OFFSETDIST; OFFSETGAPTYPE 0/1/2) for lines, arcs, circles, ellipses (result as a spline, like AutoCAD), splines, xlines, rays, and polylines through cavalier_contours (it only makes rounded joins, so build the OFFSETGAPTYPE 0 and 2 corners yourself).
- TRIM and EXTEND: TRIMEXTENDMODE Quick and Standard, cutting and boundary edges, Fence, Crossing, mOde, Project, Edge (EDGEMODE), eRase, Undo, Shift to switch between trim and extend, hatch boundaries as edges.
- FILLET (Radius, Polyline, Trim/No trim with TRIMMODE, Multiple, Undo; Shift-pick for radius 0; parallel lines; arcs and circles), CHAMFER (Distance, Angle, Method, Polyline, Trim, Multiple, Expression), BLEND (Tangent, Smooth).
- BREAK (First point, @ for the same point), BREAKATPOINT, JOIN (results exactly as AutoCAD produces them; PEDITACCEPT), EXPLODE (each type exactly as AutoCAD explodes it), LENGTHEN (DElta with Angle, Percent, Total, DYnamic).
- ARRAYRECT, ARRAYPOLAR, ARRAYPATH with ASsociative = No for now (associative arrays come in Phase 16), plus the classic -ARRAY.
- PEDIT with every option: Multiple, Join with fuzz distance and join type, Width, the Edit vertex submode, Fit, Spline (SPLINETYPE, SPLINESEGS), Decurve, Ltype gen, Reverse. SPLINEDIT (Close/Open, Join, Fit data, Edit vertex, convert to Polyline, Reverse, refine).
- REVERSE, DRAWORDER (Above, Under, Front, Back), CHANGE, CHPROP, OVERKILL (tolerance, ignored properties, options), and COMMANDPREVIEW for TRIM, EXTEND, FILLET, CHAMFER, OFFSET, LENGTHEN, BLEND.

Acceptance:
- [ ] Quick-mode TRIM: dragging a fence across segments trims them; Shift-click extends instead.
- [ ] OFFSET of a closed polyline with arcs fills outward gaps by extension (OFFSETGAPTYPE 0), arcs (1), or chamfers (2), matching AutoCAD.
- [ ] FILLET with a Shift-pick makes a sharp corner regardless of FILLETRAD.
- [ ] JOIN of collinear lines makes one LINE; lines plus arcs make a polyline; EXPLODE of a wide polyline warns as AutoCAD does.
- [ ] U after any command removes exactly what that command did.
