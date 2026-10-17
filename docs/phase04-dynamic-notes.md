# Phase 04 dynamic input and drafting settings evidence

## Implementation choices

- Cursor numeric fields reuse the non-editable physical-key command buffer. Tab
  stores a field lock and clears only the current text. Locked raw unit fragments
  go through the shared coordinate parser. Mouse acceptance reads the same field
  constraints; clicking the command buffer restores ordinary command-line entry.
- Enter composes only scalar fields accepted by the shared length/angle parser.
  Keywords, point modifiers, complete coordinates and raw angle overrides bypass
  field composition even while another dimension remains locked.
- The pointer/dimension bits of DYNMODE are independent. Dimension input takes
  precedence when a LINE base exists and uses that base for length and angle.
  Pointer input follows DYNPICOORDS and DYNPIFORMAT. Explicit @/#, comma and Tab
  use the same state. Held Shift+Comma remains the initial Center override; inside
  an existing dynamic edit it selects the angle field.
- DYNPROMPT controls command text and nonpoint keyword menus at the cursor.
  DYNPIVIS affects pointer fields; dimensional length/angle fields remain visible
  at a supported second-point prompt independently of pointer visibility.
- SNAPANG is stored in radians. Its dialog control uses AUNITS/AUPREC formatting
  and parsing while excluding ANGBASE/ANGDIR. Unchanged formatted text does not
  round an exact stored angle or create an undo record. GETVAR still reports the
  stored raw numeric value.
- DSETTINGS remembers the last selected tab for the current document host,
  including tab changes followed by Cancel. Status settings choose the applicable
  tab and execute transparent DSETTINGS through the macro runner. OSNAP selects
  the Object Snap tab; -OSNAP stays command-line based.
- Signed selection-cycling choices display their absolute remembered option while
  preserving the disabled sign when a different remembered choice is selected.
- Dynamic tooltip geometry flips around the cursor and clamps to the drawing
  viewport. DYNTOOLTIPS=0 styles only dynamic value fields; =1 also styles their
  command prompt and options. The outer overlay never inherits transparency onto
  an excluded prompt.
- Tooltip screen placement reads the renderer's actual cursor-local position,
  independently of a pending world-coordinate sample. View fits cannot move an
  old tooltip over a new canvas pick. Only tooltip buttons accept pointer events;
  blank wrapper space passes through. Field navigation keeps focus on the canvas,
  and an explicit command-input focus clears field locks for ordinary coordinate
  entry.
- DYNDIGRIP controls are exposed and stored. Its documented scope is grip stretch;
  LINE dimension fields do not suppress their required length/angle fields using
  grip-specific bits. Full grip editing remains a later phase.

## Official references checked on 2026-10-17

- [Dynamic Input tab](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-38EC86CF-D96A-455F-A5DE-2CDA23C28FC4.htm)
  supports dimension-input precedence and pointer/dimension control separation.
- [DYNPIVIS](https://help.autodesk.com/cloudhelp/2027/KOR/AutoCAD-LT/files/GUID-A5EBB25D-E626-4B4D-AD5B-0DEE467D70A7.htm)
  distinguishes typing at a point prompt, automatic point display and always.
- [DYNTOOLTIPS](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-52163CC6-858B-4656-82D1-372D09E3F7DC.htm)
  defines value-fields-only versus all drafting tooltips.
- [Tooltip Appearance](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT/files/GUID-74EA9BC1-D199-4A82-92FC-65213F3E2179.htm)
  defines tooltip size/transparency behavior.
- [TRACKPATH](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-6BF0703C-28B2-4591-8337-34B8C20443F2.htm)
  defines registry integer 0..3, default 0. Bit 1 shortens object-snap tracking;
  bit 2 hides polar paths. The added catalog entry is consumed by both the
  drafting-settings dialog and live rendering.

## Verification evidence

- Focused dynamic/settings/status/-OSNAP unit batch: 19 passed, including the
  final disabled-mode-bit and empty-osnap-mask regressions.
- Strict TypeScript and targeted ESLint passed after integration and the final
  prompt/text additions. Generated command documentation check passed.
- A first E2E attempt reused the pre-existing production server on port 1420;
  those failures exercised the older paused build and are not current-code QA.
- Fresh dev server on port 1421: all four browser scenarios passed through focused
  runs and affected reruns: physical IME-code numeric input, Tab length/angle locks
  accepted by mouse, Shift+Comma during a locked edit, absolute pointer/comma input,
  Down keyword options, tab memory, SNAPANG storage, status-tab routing, cursor
  command text, tooltip scope and viewport bounds. One GETVAR assertion was
  corrected to expect raw stored radians. The initial idle cursor was moved away
  from the welcome panel so its motion reached the actual canvas.
- Actual Edge screenshot `test-artifacts/phase04-dynamic-dev/phase04-dynamic-tooltip-ap-c1af2-d-stays-inside-the-viewport/dynamic-tooltip.png`
  was visually inspected. The value fields use the configured 50% transparency
  while the prompt stays opaque at its base size, and the complete popup stays
  inside the top-right viewport edge. This is application visual QA, not an
  installed-AutoCAD comparison.
- The first complete production E2E pass exposed tooltip interception after a
  double-middle view fit and in dense smart-DIM/TEXT point sequences. Trace showed
  the last DIST canvas click hitting a stale Y-field button, leaving the first
  point unaccepted. After using actual screen cursor position, passing through
  blank popup space and resetting dynamic state on command-input focus, the
  affected fresh-dev batch passed all 6 checks: wheel/pan anchor, smart DIM angular,
  TEXT mouse placement/height/rotation, dynamic physical-key locks, pointer/comma
  options and tooltip scope/bounds. Strict TypeScript, targeted ESLint and
  formatting also passed. Production rebuild and final comprehensive rerun remain
  the root integration task.
- The final priority review added one unit case covering raw modifier/keyword
  syntax across locked fields (dynamic-state tests: 5 passed), and one Edge E2E
  scenario proving typed UNDO wins over an angle lock, then literal command-line
  `<30` plus direct distance produces the expected segment. The browser case
  passed after explicitly placing the cursor on the intended positive ray.
