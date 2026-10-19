# Phase 06 manual acceptance scripts

These are reviewable manual steps, not a record of executed acceptance. The final
results belong in `docs/PROGRESS.md`. Use a new metric drawing for each independent
scene; press Escape twice before starting. `Enter` means the actual Enter key.
Use explicit command-line focus for the coordinates below, so absolute point
input does not depend on dynamic pointer defaults. Disable OSMODE, ORTHOMODE and
DYNMODE for numeric construction checks, then repeat the cursor-preview checks
with normal drafting aids and Korean IME enabled.

## Mandatory muscle-memory checks

1. Type `PL`, Enter, `0,0`, Enter, `100,0`, Enter, `A`, Enter, `150,50`, Enter,
   `L`, Enter, `W`, Enter, `2`, Enter, `4`, Enter, `L`, Enter, `20`, Enter, Enter.
   One polyline must contain a tangent arc followed by a tangent straight segment
   with starting width 2 and ending width 4. `U`, Enter must remove the whole
   polyline; `REDO`, Enter restores it. Repeat with H and local U/CL.
2. Type `REC`, Enter, `F`, Enter, `5`, Enter, `0,0`, Enter, `100,50`, Enter.
   Repeat `REC`, Enter, `150,0`, Enter, `250,50`, Enter. Both rectangles have
   radius-5 corners. Try C/E/T/W before the first corner and A/D/R afterward.
3. Type `L`, Enter, `0,0`, Enter, `100,0`, Enter, Enter, `A`, Enter, Enter,
   `120,20`, Enter. The new arc starts at the last line endpoint and is tangent.
4. Start a PLINE arc endpoint prompt and move the cursor. Hold Ctrl, move slightly,
   and release Ctrl. The preview alternates complementary arc direction and the
   accepted geometry must match the preview. Explicit included-angle signs retain
   their specified sense. Compare the Ctrl details with installed AutoCAD.

## Construction tools and ribbon methods

- `XL`, Enter, `H`, Enter, `0,0`, Enter, `0,20`, Enter, Enter creates horizontal
  construction lines. Repeat V, Ang, Bisect and Offset using the displayed
  prompts. Zoom and pan: construction lines remain infinite. `RAY`, Enter,
  `0,0`, Enter, `100,50`, Enter, Enter creates one half-infinite ray.
- In the Home Draw panel open the CIRCLE dropdown and test Center/Radius,
  Center/Diameter, 2-Point, 3-Point, Tan/Tan/Radius and Tan/Tan/Tan. Tangent paths
  select actual source curves near the intended tangency. No invented canonical
  tangent-circle command should appear in command history.
- Open the ARC dropdown and test all eleven entries: 3-Point; Start/Center/End,
  Angle and Length; Start/End/Angle, Direction and Radius; Center/Start/End,
  Angle and Length; Continue. Each menu selection starts ARC, pauses for the
  expected point and sends the same option as keyboard input.
- `POL`, Enter, `4`, Enter, `0,0`, Enter, `I`, Enter, `10`, Enter produces an
  inscribed square. Repeat C and E. Verify numeric radius aligns the bottom edge
  with SNAPANG and cursor radius rotates the chosen vertex/side midpoint.
- `DO`, Enter, `10`, Enter, `20`, Enter, `0,0`, Enter, `50,0`, Enter, Enter creates
  two annuli. Repeat with inner diameter 0 and confirm FILLMODE 0/1 changes display.
- `EL`, Enter, `C`, Enter, `0,0`, Enter, `100,0`, Enter, `50`, Enter creates a
  centered ellipse. Repeat the Axis, Rotation and Arc paths. With isometric snap
  enabled, choose Isocircle and cycle the isoplane.
- Use More Draw > Spline: Fit and Spline: CV. Provide several points, exercise
  Undo/Close, and follow start/end tangent prompts. Test Degree, Knots, Tolerance
  and Object conversion through the displayed options; fitted curves remain
  exact NURBS in recovery and supported DXF output.

## Point, fill, freehand and topology tools

- `PO`, Enter, `0,0`, Enter creates one point. More Draw > Multiple Points accepts
  repeated points until Escape. `PTYPE`, Enter opens the Korean point-style
  dialog; choose a visible symbol and relative/absolute size, then regenerate.
- Draw a LINE 100 units long. `DIV`, Enter, pick it, `4`, Enter adds three equally
  spaced points. `ME`, Enter, pick it, `20`, Enter adds points every 20 units.
  Repeat each command's Block and alignment path with a defined block.
- `REVCLOUD`, Enter, `A`, Enter, `10`, Enter, `0,0`, Enter, `100,60`, Enter, Enter
  creates a rectangular cloud. Repeat Polygonal and Freehand. Move the cursor in
  Freehand mode, return to the first point or press Enter, and test direction
  reversal. S/Calligraphy changes tapered arc widths. O converts a closed object;
  M replaces a path between existing vertices after selecting the old side to erase.
- `WIPEOUT`, Enter, `0,0`, Enter, `100,0`, Enter, `100,60`, Enter, `50,30`, Enter,
  `0,60`, Enter, `C`, Enter creates a concave mask. Confirm only its interior
  masks earlier geometry. F with ON/OFF/D changes frame display/plot behavior;
  P converts a straight closed zero-width polyline and asks whether to erase it.
- In a fresh scene draw a closed rectangle, then `REG`, Enter, pick it, Enter.
  Inspect retained exact boundary/area and undo source replacement. DELOBJ 0
  preserves the source. Test joined separate lines/arcs, a circle and ellipse,
  then open, crossing and nonplanar input. Invalid loops must not erase sources.
- `SOLID`, Enter, `0,0`, Enter, `40,0`, Enter, `0,30`, Enter, Enter creates a
  triangle. Repeat four-point connected solids. Legacy `TRACE`, Enter, `5`, Enter,
  `0,0`, Enter, `100,0`, Enter, `100,50`, Enter, Enter creates a wide path.
- `3DPOLY`, Enter, `0,0,0`, Enter, `100,0,50`, Enter, `100,100,100`, Enter, `C`,
  Enter retains all Z values. `MLSTYLE`, Enter edits a basic multiline style;
  `ML`, Enter accepts Justification/Scale/Style before points and Close/Undo afterward.
- `SKETCH`, Enter accepts freehand cursor motion; click to lower/raise the pen.
  Test Type (Line/Polyline/Spline), Increment and Tolerance before recording.
  Verify accepted work survives Escape according to the active prompt.
  `HELIX`, Enter follows center/base radius/top radius/height and Turns,
  turn Height, Twist or Axis endpoint options; inspect its XY projection and
  retained parametric source.

## Cross-cutting acceptance

For each command inspect cursor movement before accepting points, Down-arrow
keyword menus, clickable command-line keywords, Korean physical-key input, Escape
ownership, whole-command undo/redo, definition grips, reload, clipboard and
supported export. Repeat with a locked and hidden source layer; conversions must
not erase protected objects. Switch the UI to English and inspect all method menus.

## Explicit comparisons and serialization boundaries

`docs/phase06-outline-notes.md`, `docs/phase06-region-notes.md` and
`docs/phase06-curve-notes.md` describe remaining reference comparisons. Cloud
scallop distribution/calligraphy sizing and the first-view percentage are explicit
assumptions, not verified AutoCAD visual parity. Legacy TRACE is implemented
because Phase 06 explicitly requests the drawing primitive; modern AutoCAD TRACE
manages review annotations. The distinction is confirmed by
[Autodesk's TRACE DXF documentation](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-EA6FBCA8-1AD6-4FB2-B149-770313E93511.htm).
TRACEWID's identity and database storage are documented by
[Autodesk's database API](https://help.autodesk.com/cloudhelp/2026/ENU/OARX-ManagedRefGuide/files/OARX-ManagedRefGuide-Autodesk_AutoCAD_DatabaseServices_Database_Tracewid.html);
its numerical metric default remains an explicit 1-unit assumption.

Exact REGION boundaries in drawing recovery do not supply an ACIS REGION export.
Export must report this limitation rather than relabeling sampled polylines as
native REGION objects. Confirm which channels retain each source definition.
