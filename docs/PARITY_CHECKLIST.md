# Parity checklist

These checks track reference behavior and unresolved compatibility. A registered
command is not an implemented command.

- [ ] Choose and document one installed AutoCAD reference release and template.
- [ ] Verify Korean prompts against the reference release.
- [ ] Verify the original shortcut table against the reference/user PGP profile.
- [ ] Verify default variables by drawing, profile and session scope.
- [ ] Verify D/DV/DRE use the supplied specification and do not use legacy aliases.
- [ ] Verify command prefixes, last-command repeat, cancellation and transparent commands.
- [ ] Verify Korean IME command entry and Korean free-text composition on Windows.
- [ ] Verify selection with PICKAUTO/PICKDRAG and lasso/window/crossing settings.
- [ ] Compare rectangular drag window/crossing and Shift removal; implement lasso, click-click and full PICKAUTO/PICKDRAG behavior.
- [ ] Verify selected-object drag/Ctrl-copy, snapped targets with Ortho, PICKADD/PICKFIRST and whole-command COPY undo.
- [ ] Complete COPYMODE, Array, Undo and Displacement beyond repeated two-point copies.
- [ ] Compare APERTURE/AUTOSNAP feedback, exact endpoints/intersections at large coordinates and dense zoom levels.
- [ ] Verify real mouse/trackpad wheel deltas, ZOOMFACTOR/ZOOMWHEEL, MBUTTONPAN and double-middle extents; complete MBUTTONPAN=0 shortcut menu.
- [ ] Verify DIST decimal values/angle settings; implement other unit formats, Multiple and transparent nesting.
- [ ] Verify direct-distance bases at dimension placement prompts and empty object-pick behavior.
- [ ] Verify block insertion and drawing opening use distinct drop targets.
- [ ] Verify one completed command corresponds to one undo group.
- [ ] Review transitional auto-fit after LAYON when all imported layers were off.
- [ ] Verify advanced LINE/CIRCLE/RECTANG/PLINE options beyond the initial usable subset.
- [ ] Verify complete opaque-object and reference preservation across I/O.
- [ ] Verify DIMSCALE changes annotation sizes without changing measurements.
- [ ] Verify DIMLINEAR H/V/Rotated and text-angle placement against the reference.
- [ ] Verify angular quadrant/reflex selection for two lines, arcs and three points.
- [ ] Verify smart DIM hover choices, placement and repeated-command behavior.
- [ ] Verify DIMZIN/DIMPOST/DIMLFAC and the supported basic style fields against ISO-25.
- [ ] Implement and verify DIMASSOC 2 geometry references; current dimensions are independent definitions.
- [ ] Complete the seven DIMSTYLE tabs, fit rules, leaders, tolerances and remaining Phase 11 commands.
- [ ] Verify large survey coordinates, floating origin, snapping latency and rendering budgets.
- [ ] Verify all phase acceptance criteria before changing phase status to complete.
