PHASE 2 — Rendering engine and view navigation
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–1 are done.

Goal: draw the database fast and exactly like AutoCAD, and navigate it like AutoCAD.

Build:
- WebGL2 renderer per AGENTS.md section 4: high-DPI; incremental updates from database events; batching by layer and style; floating origin; wide lines for lineweights (LWDISPLAY, LWDEFAULT, LWUNITS); linetypes from LTYPE definitions (LTSCALE, CELTSCALE, PSLTSCALE, MSLTSCALE, PLINEGEN; complex linetypes with text and shapes after Phase 10); the exact 256-color ACI table; true color; ByLayer/ByBlock resolution; transparency; color 7 inversion by background; draw order.
- Display of every entity with geometry from Phase 1, including polyline widths and bulges, NURBS splines, POINT with PDMODE/PDSIZE, and XLINE/RAY clipped to the view. Curves stay smooth at every zoom level.
- ZOOM with every option (All, Center, Dynamic, Extents, Previous, Scale with nX and nXP, Window, Object, Realtime); PAN realtime and -PAN; wheel zoom about the cursor (ZOOMFACTOR, ZOOMWHEEL); middle-drag pan (MBUTTONPAN); middle double-click = Zoom Extents; smooth view transitions (VTENABLE, VTDURATION); the Zoom Previous stack; REGEN, REGENALL, REDRAW, REDRAWALL as compatible commands.
- Cursor and aids: crosshair (CURSORSIZE), pickbox (PICKBOX), crosshair hidden outside the canvas, UCS icon (UCSICON ON/OFF/ORigin, 2D style), grid (GRIDMODE, GRIDUNIT, GRIDMAJOR, GRIDDISPLAY adaptive and limits options, axis coloring), model background color option.
- Hit testing: an R-tree over entity bounds; pick queries return candidates under the pickbox with exact distances.
- A dev-only command DEVSTRESS that generates N random lines, arcs, and polylines.

Acceptance:
- [ ] After DEVSTRESS 1000000, pan and zoom stay at 60 fps on this PC.
- [ ] Geometry drawn around (200000000, 450000000) shows no jitter at high zoom.
- [ ] Wheel zoom keeps the point under the cursor fixed; middle drag pans; middle double-click shows extents.
- [ ] DASHED, CENTER, HIDDEN, and PHANTOM render correctly and follow LTSCALE; lineweights appear only when LWDISPLAY is on.
- [ ] Golden-image tests for at least 20 reference scenes pass.
