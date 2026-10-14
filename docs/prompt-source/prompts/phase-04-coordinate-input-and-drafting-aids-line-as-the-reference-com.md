PHASE 4 — Coordinate input and drafting aids (LINE as the reference command)
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–3 are done.

Goal: picking points feels exactly like AutoCAD. Build LINE completely in this phase and use it to prove every aid.

Build:
- LINE with all prompts, U and C, continuation from the last line or arc endpoint (Enter at the first prompt), and command preview.
- Point input: everything under Point input syntax in docs/SHORTCUTS.md; parsing and formatting by LUNITS, LUPREC, AUNITS, AUPREC, ANGBASE, ANGDIR (decimal, engineering, architectural, fractional, scientific; degrees, DMS, grads, radians, surveyor's); OSNAPCOORD priority between typed coordinates and snaps.
- Object snaps: running snaps (OSMODE bits, including the 16384 off flag) and single-pick overrides (typed, Shift+right-click menu, temporary keys). Every mode, with AutoCAD's marker shapes, magnet, tooltips, aperture box, and Tab cycling among candidates: Endpoint, Midpoint, Center, Geometric Center (closed polylines), Node, Quadrant (rotated ellipses too), Intersection (all 2D pairs, including extended intersection), Extension (hover acquisition, small + marker, dotted path), Insertion, Perpendicular and Tangent (including the deferred modes when the first point is unknown), Nearest, Apparent Intersection, Parallel. OSOPTIONS (ignore hatches, dimension extension lines, negative Z).
- Polar tracking: POLARANG increments, additional angles (POLARADDANG), POLARMODE (absolute or relative to the last segment; orthogonal-only or all angles for tracking), polar snap (POLARDIST with SNAPTYPE), a tooltip like 극좌표: 123.4567 < 45°.
- Object snap tracking: acquisition by hover (or by Shift, per AUTOSNAP and TRACKPATH), up to 7 acquired points, intersections of two alignment paths, clearing on re-hover.
- Ortho (F8, Shift temporary); snap (SNAPMODE, SNAPUNIT, SNAPANG, SNAPBASE; rectangular, isometric, polar); isometric drafting with isoplane cycling (F5, Ctrl+E) and isoplane cursors; grid that follows snap.
- Dynamic input (DYNMODE, DYNPROMPT, DYNDIGRIP, DYNPIFORMAT, DYNPICOORDS, DYNTOOLTIPS): pointer input tooltip, dimensional input with Tab between length and angle, field locking, prompts at the cursor, the down-arrow options menu; appearance like AutoCAD.
- Drafting Settings dialog (DSETTINGS) with the Korean tabs 스냅 및 그리드, 극좌표 추적, 객체 스냅, 3D 객체 스냅, 동적 입력, 빠른 특성, 선택 순환; the -OSNAP command-line version.

Acceptance:
- [ ] LINE accepts 100,50, @100<30, #0,0, direct distance with polar on, .X filters, FROM with @10,10, TT, and M2P, each producing exact coordinates.
- [ ] Fixture tests for every osnap mode on lines, arcs, circles, ellipses, splines, and polylines pass.
- [ ] Hovering two endpoints and moving to where their alignment paths cross snaps to that point, with a tooltip.
- [ ] Shift+E forces Endpoint for one pick; holding Shift toggles ortho; F3, F8, F10, F11, F12 behave as in AutoCAD.
- [ ] Dynamic input shows length and angle fields; Tab switches; typed values lock.
