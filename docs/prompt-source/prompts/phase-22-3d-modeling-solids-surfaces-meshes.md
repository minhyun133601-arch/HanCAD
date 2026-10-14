PHASE 22 — 3D modeling: solids, surfaces, meshes
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–21 are done.

Goal: AutoCAD's solid, surface, and mesh modeling on an OpenCASCADE kernel.

Build:
- Kernel3D: benchmark a maintained OCCT WASM build against a native OCCT bridge from Rust, choose one, and record why. B-rep storage; adaptive tessellation (FACETRES, ISOLINES, DISPSILH); subobject picking with Ctrl+click (faces, edges, vertices; SUBOBJSELECTIONMODE); long operations in workers, cancellable with Esc.
- Primitives: BOX, WEDGE, CONE (elliptical, frustum), CYLINDER (elliptical, axis endpoint), SPHERE, TORUS, PYRAMID, POLYSOLID, PLANESURF.
- Creation: EXTRUDE (direction, path, taper angle, solid or surface mode), REVOLVE, SWEEP (alignment, base point, scale, twist, bank), LOFT (cross sections, guides, path, settings), PRESSPULL (several at once with Ctrl), THICKEN, CONVTOSOLID, CONVTOSURFACE, CONVTONURBS, XEDGES.
- Editing: UNION, SUBTRACT, INTERSECT, INTERFERE, SLICE (every plane option; keep one or both sides), SECTION, SECTIONPLANE with live section, FLATSHOT, SOLIDEDIT (faces, edges, body: imprint, separate, shell, clean, check), FILLETEDGE, CHAMFEREDGE, OFFSETEDGE, IMPRINT.
- Surfaces: SURFBLEND, SURFPATCH, SURFNETWORK, SURFOFFSET, SURFFILLET, SURFTRIM, SURFUNTRIM, SURFEXTEND, SURFSCULPT, NURBS CV editing (3DEDITBAR).
- Meshes: MESH primitives, MESHSMOOTH, MESHSMOOTHMORE/LESS, MESHREFINE, MESHCREASE/UNCREASE, MESHSPLIT, MESHEXTRUDE, MESHMERGE, MESHCAP, MESHCOLLAPSE, MESHSPIN, MESHOPTIONS, conversion to solids.
- MASSPROP for solids (volume, centroid, moments, products and radii of gyration, principal moments).
- Exchange: STEP, IGES, STL, OBJ import and export through OCCT. ACIS data in DXF/DWG (3DSOLID, REGION, BODY, SURFACE): always preserve the raw SAT/SAB; read analytic and spline faces into OCCT when possible, otherwise show a display-only proxy; record writing limits in docs/DECISIONS.md.

Acceptance:
- [ ] BOX minus CYLINDER, then FILLETEDGE on the hole edge, gives the same MASSPROP volume AutoCAD reports for the same model.
- [ ] PRESSPULL on a closed boundary extrudes live with dynamic input.
- [ ] A STEP file imports, displays in the Realistic style, and exports back.
- [ ] 3D solids in my DWG/DXF files display and survive save and reopen.
