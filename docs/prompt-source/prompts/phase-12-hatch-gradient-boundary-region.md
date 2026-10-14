PHASE 12 — Hatch, gradient, boundary, region
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–11 are done.

Goal: hatching that finds boundaries as reliably as AutoCAD and round-trips perfectly.

Build:
- A boundary engine in Rust/WASM: a planar arrangement of lines, arcs, circles, ellipses, splines (approximated within tolerance), polylines, xlines, and rays; the smallest enclosing loop with islands; gap tolerance (HPGAPTOL); a boundary set from the current viewport or from selected objects.
- HATCH with the contextual ribbon tab 해치 작성 and the dialog version (HPDLGMODE): pick points, select objects, remove boundaries, recreate boundary, island detection (Normal, Outer, Ignore), patterns from .pat files (ship an original .pat with the standard names; accept my .pat folder), user-defined (single, double), SOLID, gradients (one and two colors, the nine shapes, centered, angle, tint and shade), angle, scale, spacing, ISO pen width, transparency, background color, origin options (set, corners, center, store as default), associativity (HPASSOC), annotative, separate hatches, draw order, inherit properties, hover preview, HPMAXLINES.
- AutoCAD-style errors: when no valid boundary is found, red circles mark the gaps.
- HATCHEDIT, -HATCH, hatch grips (center grip menu: stretch, origin, angle, scale), HATCHGENERATEBOUNDARY, HATCHTOBACK.
- BOUNDARY (BO) with polyline or region output, REGION, UNION/SUBTRACT/INTERSECT on regions, MASSPROP for regions.
- DXF fidelity: pattern definition lines, seed points, and every boundary path edge type, including spline edges.

Acceptance:
- [ ] Clicking inside nested shapes with text inside hatches around the text as AutoCAD does (Normal island detection).
- [ ] A boundary with a 0.5 gap fails at HPGAPTOL 0 with red gap markers and succeeds at 1.
- [ ] Moving a boundary edge updates an associative hatch.
- [ ] Hatches from my real drawings render identically and round-trip through DXF unchanged.
