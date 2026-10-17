# Phase 05 selection implementation evidence

Selection and filter/group workstream notes for the final phase audit. These
notes do not replace the phase's comprehensive verification evidence.

## Sources and behavior

- Autodesk [SELECT command](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-0DD5DA73-9DC5-4424-8FED-7BBE3BE52A4D.htm)
  defines the common selection methods and Previous/Undo/Single/Multiple modes.
  The same SelectionSession handles SELECT and other commands' object prompts.
- Autodesk [Korean object-selection procedure](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-LT/files/GUID-243E4DD0-8947-4905-AFE2-BE9B903A8C3F.htm)
  distinguishes click-release-click rectangles and press-drag-release lassos,
  directional containment/crossing, Shift removal and Space lasso-mode cycling.
- Autodesk [selection examples](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT-DidYouKnow/files/GUID-D0D5C0C3-F092-448A-8E81-D38F27094639.htm)
  describes QSELECT's current-selection scope, operators, include/exclude, and
  SELECTSIMILAR's default Layer/Name matching.
- Autodesk [shared property selection](https://help.autodesk.com/cloudhelp/2027/KOR/AutoCAD-Core/files/GUID-FBBA809F-9BD4-4A34-B671-0B8A920B18A4.htm)
  distinguishes temporary QSELECT from saved FILTER definitions.
- Autodesk [Object Selection Filters dialog](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-26E993C3-26F2-4F68-9C66-454C05676304.htm)
  specifies profile-global `filter.nfl` definitions, names up to 18 characters,
  Apply followed by interactive object selection, two XOR operands and one NOT
  operand. A final source audit corrected the earlier QSELECT-like FILTER flow.
- Autodesk [groups](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-C20C24AD-81F5-4E4A-A414-B1A2BC71E041.htm),
  [GROUPEDIT](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-9228E5A6-4929-42DB-8A48-420632E95F28.htm),
  and [UNGROUP](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-8FD85180-69F4-4F4C-8DC1-F072111AF664.htm)
  define named/unnamed membership, descriptions, add/remove/rename and ungroup.
- Autodesk [GROUP DXF reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-5F1372C4-37C8-4056-9303-EE1715F58E67.htm)
  defines description (300), unnamed (70), selectable (71), and member references
  (340). Native GROUP records own dictionary entries and reciprocal reactors.

## Implementation

- `selection-session.ts` is a headless shared prompt state machine. It accepts
  W/C/BOX/ALL/F/WP/CP/G/A/R/M/P/U/AU/SI/SU/O/L and full English names, preserves
  Previous, journals selection Undo and suppresses highlights for Multiple.
  Selection keywords share a Korean/English labeled command-line popup and the
  dynamic-input Down menu while retaining the literal `객체 선택:` prompt. Group
  names switch to the editable IME input, including other commands' prompts.
- `selection-path.ts` splits lines and circular curves at exact boundary
  intersections, then checks interval interiors for concave polygon containment.
  Fence/crossing support analytic circles, correctly directed arcs and polyline
  bulges. Text uses the transitional text bounds; dimension graphics include
  lines, arcs and arrow triangles.
- PICKADD 0 replaces the set; Shift toggles membership. PICKADD 1/2 add normally
  and Shift removes. SELECT retains visible selection after completion only at 2.
  Hidden objects are excluded; locked candidates produce a count and a message.
- PICKSTYLE's group bit expands selectable overlapping groups transitively;
  clipboard block membership always selects the complete block. GROUPDISPLAYMODE
  2 supplies group bounding rectangles.
  Copying a complete selectable group creates an independent unnamed group with
  a fresh identity when group selection is enabled.
- QSELECT supports object type, property, all comparison operators, wildcard,
  drawing/current scope, exclusion and append. FILTER stores expression trees
  with validated AND/OR/NOT/XOR arities and profile-global named definitions.
  Apply closes FILTER, then the shared selection prompt filters picked objects,
  windows, polygons, fences and ALL. Transparent FILTER restores the interrupted
  selection and merges its result after Enter. SELECTSIMILAR settings use the
  native bitcode and always constrain object type.
- Groups survive validated JSON recovery and command Undo. Named filters use a
  profile-global validated browser store shared across documents/windows, with
  the same 18-character limit; saving them does not create drawing Undo steps.
  Supported-entity DXF writes native ACAD_GROUP dictionary/GROUP objects and
  entity reactors. The optional private dictionary/XRECORD decoder retains older
  drawing-embedded filter metadata for compatibility; the profile store is
  authoritative for the FILTER dialog.
  DXF import maps source handles to converted entity IDs, including flattened
  source entities, and restores supported metadata.
- `syncSelectionGroupRecords` runs in the view commit transaction. Its hidden
  native member records preserve handles through edits, and GROUP records refer
  to those handles with reciprocal member reactors. Native display/snaps exclude
  the marker records to avoid displaying the transitional entities twice.
  Persistent group IDs retain native GROUP handles when the group is renamed.
- DDGRIPS opens the implemented Selection options form. Selection/grip switches,
  sizes, colors, group bounds and preview settings update validated system
  variables with their correct drawing/profile scopes; Cancel discards edits.

## Verification so far

- Latest focused selection/native GROUP/global-filter tests: 12 passed in three files, including
  native handle/reactor/dictionary ownership, rename/Undo and group-copy identity.
  Filter-store tests cover sharing, case-insensitive replacement, 18-character
  names, strict logical arities and invalid stored definitions.
- Earlier affected-schema tests passed (8 tests), and original editing tests
  passed (4 tests).
- Focused ESLint passed for all selection/group source, UI and browser-test files.
- Browser fixtures cover MOVE ALL, Previous/Remove/typed Window, named group
  descriptions/rename/ungroup/Undo/reload, QSELECT, SELECTSIMILAR Settings, nested
  named FILTER/reload and DDGRIPS apply/Cancel. The final phase production E2E
  run passed all eight selection fixtures after the FILTER source correction.
  The corrected FILTER fixture now checks Apply followed by explicit ALL/Enter,
  invalid XOR feedback, reload and a new drawing. Supplemental menus for all 18
  keywords, Korean group-name/Single input and transparent FILTER/MOVE resume
  also passed against that production build.
  Final comprehensive results belong in the final phase evidence.
- Visual QA captured and inspected QSELECT, FILTER, DDGRIPS top/bottom and the
  two-object Properties palette at 1600x1000. Labels and nested conditions are
  readable, dialog content stays inside the viewport, and DDGRIPS's scrollable
  bottom actions are reachable. The isolated production browser reported no
  page errors. Screenshots: `test-artifacts/phase05-selection-visual/`.
- The older real-drag fixture explicitly sets PICKAUTO=1 for rectangles and
  uses non-grip object-body points for Shift removal/move/copy. Its focused
  production rerun passed. Default PICKAUTO=5 and actual midpoint grips had
  correctly invalidated those older test assumptions.

## Remaining reference checks and bounded assumptions

- Korean prompt/count punctuation and GROUPEDIT option labels use the official
  Korean vocabulary but still require comparison with the user's installed
  Korean AutoCAD build; no installed AutoCAD comparison was performed here.
- Current model entities do not expose individual plot-style or named text/
  dimension-style table references. SELECTSIMILAR stores those settings; matching
  is limited to fields represented by current entities. Complete style identity
  belongs to its owning later phases.
- FILTER supports nested groups and shows readable property/operator conditions.
  Full classic-dialog visual parity remains a manual comparison item.
- SU/O and Ctrl support polyline segment identities for current entity types;
  solid faces/edges/vertices await the later solid kernel.
- This remains the documented supported-geometry DXF pipeline. The existing
  opaque-object and full source-handle round-trip limitations remain unchanged.
