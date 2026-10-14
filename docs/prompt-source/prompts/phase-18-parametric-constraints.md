PHASE 18 — Parametric constraints
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–17 are done.

Goal: geometric and dimensional constraints like AutoCAD's Parametric tab.

Build:
- Geometric: GCCOINCIDENT, GCCOLLINEAR, GCCONCENTRIC, GCFIX, GCPARALLEL, GCPERPENDICULAR, GCHORIZONTAL, GCVERTICAL, GCTANGENT, GCSMOOTH, GCSYMMETRIC, GCEQUAL, GEOCONSTRAINT, AUTOCONSTRAIN, constraint inference (CONSTRAINTINFER, Ctrl+Shift+I), constraint bars (CONSTRAINTBAR, CONSTRAINTBARMODE), DELCONSTRAINT, CONSTRAINTSETTINGS.
- Dimensional: DCLINEAR, DCHORIZONTAL, DCVERTICAL, DCALIGNED, DCANGULAR, DCRADIUS, DCDIAMETER, DCCONVERT, DIMCONSTRAINT, dynamic and annotational forms (CCONSTRAINTFORM), DCDISPLAY, name formats, expressions and user parameters in the PARAMETERS manager.
- Solver: planegcs in WASM; incremental solving during grip edits and commands; over-constrained and conflicting cases reported with AutoCAD-style Korean messages; splines limited to what the solver supports (record the limits).
- Storage: constraints saved in DWG/DXF the way AutoCAD stores them (the association network); preserve whatever you cannot interpret.
- Constraint parameters inside the block editor, completing Phase 17.

Acceptance:
- [ ] A rectangle with perpendicular, horizontal, and equal constraints stays a square while a corner grip is dragged.
- [ ] Changing d1 = 100 to d1 = width*2 in PARAMETERS updates the geometry.
- [ ] Constraints survive save and reopen.
