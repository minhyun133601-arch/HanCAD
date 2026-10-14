PHASE 6 — 2D draw commands
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–5 are done.

Goal: every 2D drawing command with every option, prompt, preview, and remembered value AutoCAD has.

Build each with Korean prompts, dynamic input, command preview, grips, and headless tests:
- XLINE (Hor, Ver, Ang, Bisect, Offset), RAY.
- PLINE: Arc (Angle, CEnter, CLose, Direction, Halfwidth, Line, Radius, Second pt, Undo, Width), Halfwidth, Length, Undo, Width, Close; PLINEWID, PLINEGEN, FILLMODE; tangent continuation.
- RECTANG (Chamfer, Elevation, Fillet, Thickness, Width; Area, Dimensions, Rotation), POLYGON (Inscribed, Circumscribed, Edge), DONUT.
- CIRCLE (center-radius, center-diameter, 3P, 2P, Ttr; Tan-Tan-Tan from the ribbon), CIRCLERAD.
- ARC: all 11 ribbon methods, plus continuing tangent from the last line or arc with Enter.
- ELLIPSE (axis-end, center, arc, rotation, parameter and angle options; Isocircle when isometric snap is on).
- SPLINE (Fit and CV methods, Knots, Object, degree, start and end tangency, tolerance, close; SPLMETHOD, SPLDEGREE, SPLKNOTS).
- POINT (single, multiple), PTYPE dialog, DIVIDE and MEASURE (including the Block option).
- REVCLOUD (Arc length, Object, Rectangular, Polygonal, Freehand, Style Normal/Calligraphy, Modify), WIPEOUT (frames on, off, or display-but-not-plot), REGION, SKETCH, HELIX (2D now), SOLID, TRACE, 3DPOLY, and MLINE with a basic MLSTYLE.

Acceptance:
- [ ] For every command, a headless parity script produces geometry identical (to 1e-9) to the expected values in its test.
- [ ] By hand: PL with an arc segment, then L for line, then Width, behaves like AutoCAD; REC with Fillet 5 remembers the radius next time; A then Enter continues tangent from the last line.
- [ ] Every command shows the same preview AutoCAD shows while the cursor moves.
