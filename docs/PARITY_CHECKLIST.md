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
- [ ] Verify block insertion and drawing opening use distinct drop targets.
- [ ] Verify one completed command corresponds to one undo group.
- [ ] Review transitional auto-fit after LAYON when all imported layers were off.
- [ ] Verify advanced LINE/CIRCLE/RECTANG/PLINE options beyond the initial usable subset.
- [ ] Verify complete opaque-object and reference preservation across I/O.
- [ ] Verify DIMSCALE changes annotation sizes without changing measurements.
- [ ] Verify large survey coordinates, floating origin, snapping latency and rendering budgets.
- [ ] Verify all phase acceptance criteria before changing phase status to complete.
