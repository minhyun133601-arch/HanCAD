PHASE 11 — Dimensions, leaders, tolerances
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–10 are done.

Goal: complete dimensioning that matches AutoCAD's geometry, styles, and associativity.

Build:
- A dimension engine that draws from the definition and also writes the anonymous *D blocks AutoCAD expects in DWG/DXF.
- Commands: DIMLINEAR (Mtext, Text, Angle, Horizontal, Vertical, Rotated), DIMALIGNED, DIMANGULAR (two lines, arc, circle, three-point vertex, Quadrant), DIMARC, DIMRADIUS, DIMDIAMETER, DIMJOGGED, DIMORDINATE (Xdatum, Ydatum), DIMBASELINE, DIMCONTINUE, QDIM, the unified DIM command (smart preview, Layer option, baseline, continue, align, distribute), DIMBREAK, DIMSPACE, DIMJOGLINE, DIMCENTER, CENTERMARK, CENTERLINE, DIMEDIT, DIMTEDIT, DIMOVERRIDE, DIMREASSOCIATE, DIMDISASSOCIATE, DIMREGEN, DIMINSPECT, TOLERANCE (GD&T frames with symbols and datums).
- Leaders: QLEADER with its settings dialog, LEADER, MLEADER, MLEADERSTYLE, MLEADEREDIT (add and remove leaders), MLEADERALIGN, MLEADERCOLLECT, with MTEXT or block content.
- DIMSTYLE manager with every tab (선, 기호 및 화살표, 문자, 맞춤, 1차 단위, 대체 단위, 공차) and every DIM system variable; overrides and compare; ISO-25 defaults; a KS-oriented preset (record exactly what it changes in docs/DECISIONS.md).
- Associativity (DIMASSOC 2): dimensions update when geometry changes; DIMANNO, DIMSCALE.
- All standard arrowheads plus user blocks; text formatting (units, precision, rounding, zero suppression, prefix/suffix, measurement scale), placement and fit rules, DIMTMOVE, and dimension grips with their multifunction menus.

Acceptance:
- [ ] Dimensions from my real drawings display identically and regenerate identical geometry after any style edit.
- [ ] Stretching a dimensioned rectangle updates its associative dimensions.
- [ ] DIM hovering over a line, an arc, and a circle previews linear, arc or radius, and diameter dimensions as AutoCAD does.
- [ ] Every DIMSTYLE setting changes the result the same way AutoCAD's does (a golden test per setting).
