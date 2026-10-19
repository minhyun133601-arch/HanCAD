# Phase 06 polyline and outline command evidence

The drawing-coroutine factories in `packages/draft/src/draw-outlines.ts` implement
PLINE, RECTANG, POLYGON and DONUT. The host owns point acquisition, snap/Ortho
constraints, dynamic-input routing and the single database transaction. Every
accepted PLINE segment and DONUT placement is exposed through `DrawRequest.partial`
so Escape preserves accepted work, including while answering nested width prompts.

PLINE stores exact signed bulges in the transitional model's Y-down coordinates;
a positive AutoCAD included angle therefore produces a negative bulge. Widths are
stored per outgoing segment without tessellation. All Arc branches are supported:
Angle with endpoint/Center/Radius, Center with endpoint/Angle/chord Length,
Direction, Radius with endpoint/Angle, Second point, Close, Halfwidth, Line, Undo
and Width. Line Length follows the preceding line or arc's end tangent. PLINEWID
remembers the final width; PLINEGEN is copied onto each new object.

RECTANG retains its private corner, width, dimension and rotation defaults in the
host's per-document command memory. ELEVATION and THICKNESS remain public system
variables. Rounded corners are exact quarter-circle bulges. Area calculations
include the area removed by the configured fillets or chamfers. An oversized
corner treatment currently falls back to square corners rather than silently
changing the remembered radius or distance; verify this edge case in AutoCAD.

POLYGON supports 3–1024 sides, inscribed/circumscribed center construction and an
exact first Edge. A numeric radius aligns the bottom edge with SNAPANG; a point
radius places an inscribed vertex or circumscribed side midpoint along the cursor
direction. The number of sides and construction mode are remembered per drawing.
DONUT is a closed two-semicircle wide polyline, including inner diameter zero,
repeated placement, DONUTID/DONUTOD defaults and inverted-diameter swapping.

## Reference sources and parity assumptions

- [Autodesk PLINE command (2026, Korean)](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-11883C70-6435-4F80-8FB4-F6E933B8FD94.htm)
  establishes tangent continuation, width defaults, keyword distinctions and
  included-angle direction.
- [Autodesk detailed PLINE prompts](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-MAC-Core/files/GUID-11883C70-6435-4F80-8FB4-F6E933B8FD94.htm)
  supplies nested branches omitted from the current shortened command page.
- [Autodesk RECTANG command (Korean)](https://help.autodesk.com/cloudhelp/2027/KOR/AutoCAD-LT/files/GUID-188B2DDA-6CD8-4D37-BF26-E6CF27C34C75.htm)
  confirms corner options, remembered elevation/thickness and actual-area behavior.
- [Autodesk POLYGON command](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT-MAC/files/GUID-3DAC217C-8359-476D-9863-B6964530EA61.htm)
  confirms the side range, both radius conventions and numeric-radius alignment.
- [Autodesk DONUT command](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-MAC-Core/files/GUID-46C0F9F2-6112-415C-AB2C-29EEE5984A6F.htm)
  describes the exact two-arc wide-polyline representation and repeated placement.
- [Autodesk DONUTOD variable](https://help.autodesk.com/cloudhelp/2015/ENU/AutoCAD-LT/files/GUID-B3C626A7-3401-43B5-8ACF-2BF3445A6C75.htm)
  specifies inverted-diameter swapping.

The public RECTANG and POLYGON pages do not identify named system variables for
their private remembered command values. These are kept separately from unrelated
FILLETRAD/CHAMFER variables rather than adding invented AutoCAD variables. Compare
RECTANG corner-parameter isolation, oversized corners and initial polygon vertex
ordering against installed Korean AutoCAD. Ctrl-reversed PLINE arc direction uses
the host's live modifier callback and complementary bulges; explicit included-angle
signs remain authoritative. Focused scripts cover both live preview and accepted
endpoint/Center/Direction/Radius arcs.

## Focused verification

`pnpm exec vitest run packages/draft/src/draw-pline.test.ts packages/draft/src/draw-outlines.test.ts`
passed 19 tests on 2026-10-19. Scripts cover each nested PLINE arc construction,
line/arc/line tangent Length, variable widths, local Undo and Close, accepted-work
ownership, all rectangle settings, remembered Fillet 5, actual Area, Dimensions,
both Rotation inputs, every polygon construction and donut filling/diameter rules.
Assertions use 1e-9 or tighter geometry tolerances. Strict TypeScript and focused
ESLint passed. These checks do not replace the phase's final browser/manual,
renderer, export and comprehensive verification.

The final targeted RECTANG regression pass also covers undersized fillet/chamfer
Area construction. When the configured treatment cannot fit the dimensions and
the existing square-corner fallback applies, its area calculation now omits the
inapplicable corner loss. Four cases verify the requested actual area. The related
rectangle and command/sysvar catalog pass completed 29 tests; sourced defaults
now total 873 variables, with 811 available defaults and 62 explicitly unresolved.

Additional regressions verify canonical per-vertex width-array lengths across
recovery validation, live Ctrl behavior and protected-layer conversion guards.
The actual browser ribbon check passed two scenarios: the Start/Center/Angle ARC
macro paused at each real prompt and created its expected geometry; English
construction menus, CIRCLE Tan/Tan/Tan and MULTIPLE POINT routed canonically.
