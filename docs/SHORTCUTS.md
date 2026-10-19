# Reference B — Shortcuts, aliases, mouse behavior, input syntax
(Save as docs/SHORTCUTS.md. Every binding here must work. Bindings whose command is not built yet must still be registered and print the Korean not-implemented message.)

## Phase 03 keyboard bindings (2026-10-16)

Every function key, Ctrl shortcut and Delete below is implemented in
`packages/input/src/shortcuts.ts`; commands that are not built yet print the
Korean not-implemented message, and toggles for aids that come in later phases
flip their variable and say that the feature itself is pending. Temporary
override keys work at point prompts before anything is typed. Shift+Space works
at selection prompts. In the browser build, keys the browser reserves (Ctrl+N,
Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp/PageDown, Ctrl+F4, F11) can
be taken by the browser first; the desktop app receives them.

Phase 03 completion adds Alt keytips (MENUBAR=0), contextual drawing menus,
time-sensitive right-click and one-shot object-snap choices. Alt+F opens the
application menu. Status controls share the same toggle implementation and expose settings
and visibility menus. Ctrl+I cycles static/absolute/relative coordinates (0/1/2).
F1 opens registry-generated Korean help without ending the current command.

## Phase 03 alias completion (2026-10-16)

The built-in alias table is this Reference B list plus 172 alternative, legacy and
discontinued-command aliases from an installed acad.pgp (for example DTEXT=TEXT,
RECTANGLE=RECTANG, SE=DSETTINGS, -AR=-ARRAY, DIMLIN=DIMLINEAR, PROPS=PROPERTIES).
`docs/COMMANDS.md` lists every alias beside its command. Reference B's
`GCON=GEOCONSTRAINT` is corrected to the actual command, `GCON=GEOMCONSTRAINT`.
Unverified pairs are listed in PARITY_CHECKLIST.md.

## Verified rendering/navigation slice (2026-10-16)

Z/ZOOM accepts All, Center, Dynamic, Extents, Previous, Scale (bare/X), Window,
Object and Realtime. Enter at the main ZOOM prompt enters realtime left-drag zoom.
P/PAN uses left-drag pan; -P/-PAN uses two points or a displacement. Esc exits.
Wheel and middle-button navigation remain available and contribute to Previous
and navigation undo. Previous consumes up to ten recorded views. Dynamic shows a
move/resize overview box; Enter applies and Esc restores the original view.
F7 toggles GRIDMODE; the lineweight status switch controls LWDISPLAY. OP/OPTIONS
opens background controls. RE/REA regenerate and R/RA redraw. Prompt keyword
buttons accept the same option as typing its letter. Cursor dynamic-input fields
and Down options menus are implemented in the Phase 04 continuation below. XP requires the later floating-layout viewport host.

## Verified basic-workflow slice (2026-10-15)

The next verified editing slice adds TR/TRIM and EX/EXTEND: click a LINE or drag
a finite fence; Shift uses the opposite tool, U reverses the latest local edit,
and Enter/Esc finishes the whole command. TRIMEXTENDMODE 0 first asks for explicit
boundaries; 1 starts Quick mode. O/OFFSET accepts distance or T/Through, then an
object and a side/through point; M repeats, U reverses and Enter/Esc finishes.
DT/TEXT/DTEXT takes insertion point, height and angle, then editable Korean text
on the canvas. Enter accepts a line; empty Enter finishes. T/MT remains MTEXT,
which is not yet implemented. This avoids changing existing aliases.

L/C/REC/PL draw; DLI/DAL/DRA/DDI/DAN dimension; DI measures two points; M moves;
CO/CP copy repeatedly until Enter/Esc. F3 toggles running snaps, F8 toggles Ortho.
Left drag selects complete objects left-to-right or crossing objects right-to-left;
Shift removes. Drag a selected object to move it; Ctrl+drag copies. Wheel zooms at
the pointer; middle drag pans; double-middle fits. Escape/capture loss cancels an
unfinished drag. Ctrl+Z/Ctrl+Y undo/redo whole edits. The remaining reference below
is the target contract; Phase 05 implements lasso, grips and the drawing clipboard.

## Phase 04 coordinate and drafting-aid continuation (2026-10-17)

LINE uses the complete point-input grammar below, including explicit Z, unit-aware
lengths/angles, filters, FROM, M2P/MTP, TT/TK and the angle override. Running and
one-shot snap modes share the same candidate query. F3/F8/F10/F11/F12 read the live
variables; Shift and the temporary overrides apply only until release. Tab cycles
snap candidates when no value has been typed and multiple candidates are present;
otherwise it moves the active dynamic field. Shift+Comma at an initial empty point
prompt on the canvas is Center; inside a dynamic edit, < selects the angle field.
Explicit command-line focus accepts < as the literal angle-override prefix.

Dynamic fields never focus an editable input. Type a length, press Tab to lock it
and move to angle, type an angle, and press Enter or pick the constrained point.
Comma moves pointer X/Y/Z fields, @/# selects relative/absolute input and Down
opens the active prompt options. F12 preserves the pointer/dimension mode when
toggling it off. DYNPROMPT controls cursor command/keyword prompts independently
of the pointer-field visibility setting. DSETTINGS/DS/SE provides all seven Korean
tabs and remembers the selected tab; OSNAP opens the Object Snap tab. Right-click
a drafting status button and choose Settings to open its corresponding tab.

## Phase 06 drawing construction input (2026-10-19)

PL/PLINE accepts A for Arc and L for Line; in line mode L specifies a tangent
Length. W sets full starting/ending widths and H sets halfwidths. U removes the
last accepted segment. C closes line mode and CL closes arc mode. Arc-center is
CE; CEN remains the Center object-snap override. Enter ends an active polyline or
continues its starting point from the most recent line/polyline/arc endpoint.

REC/RECTANG accepts F then 5 before the first corner to remember a fillet radius
of 5. A/D/R after the first corner choose Area, Dimensions or Rotation. POL/POLYGON
supports I/C for Inscribed/Circumscribed and E for Edge. DO/DONUT repeats center
placement until Enter; accepted placements survive Escape.

The drawing ribbon dropdowns offer all eleven ARC constructions and CIRCLE's
Tan-Tan-Tan path. They replay canonical macros and pause for each construction
point. A then Enter continues tangentially from the last line or arc. The More
Draw menu exposes remaining Phase 06 commands, including single and multiple
POINT input, PTYPE, DIVIDE, MEASURE, REVCLOUD, WIPEOUT and REGION. Multiple Points
uses MULTIPLE followed by POINT and ends with Escape.

At a REVCLOUD Freehand prompt, move the crosshair to accept path samples; return
near the first point to close or press Enter to retain an open path. REVCLOUD M
selects an existing cloud, new points, an existing end vertex and a side to erase.
WIPEOUT F offers ON, OFF or D (display without plotting); P converts a closed
straight zero-width polyline. REGION accepts picked curves and Enter to build
each valid planar closed loop. These instructions are acceptance steps, not a
claim that unrecorded manual checks have passed.

## Function keys

Phase 05: Ctrl+A selects at the active object prompt or at idle when PICKFIRST=1.
Ctrl+Shift+A toggles group selection. Ctrl+C/X/V and Ctrl+Shift+C/V run drawing
Clipboard commands. Ctrl+1 toggles the basic Properties palette; Ctrl+Shift+P
toggles Quick Properties. Ctrl+W toggles overlap cycling; Shift+Space cycles its
candidates. Browser-reserved keys retain the browser limitation described above.
Click a grip, press Space three times and enter `2` to scale about that grip.
Shift+click makes multiple grips hot; Esc first ends hot-grip editing and a later
Esc clears object selection. Hover/right-click a polyline grip for vertex/arc
actions. Space while a lasso is captured cycles Window/Crossing/Fence.

F1 Help · F2 expanded command history · F3 running object snaps · F4 3D object snap · F5 cycle isoplane · F6 dynamic UCS · F7 grid · F8 ortho · F9 snap · F10 polar tracking · F11 object snap tracking · F12 dynamic input

## Ctrl shortcuts
Ctrl+0 clean screen · Ctrl+1 Properties · Ctrl+2 DesignCenter · Ctrl+3 Tool Palettes · Ctrl+4 Sheet Set Manager · Ctrl+6 dbConnect · Ctrl+7 Markup Set Manager · Ctrl+8 QuickCalc · Ctrl+9 command line on/off
Ctrl+A select all · Ctrl+Shift+A toggle group selection · Ctrl+B snap · Ctrl+C copy · Ctrl+Shift+C copy with base point · Ctrl+D dynamic UCS · Ctrl+E cycle isoplane · Ctrl+F running object snaps · Ctrl+G grid · Ctrl+H PICKSTYLE · Ctrl+Shift+H hide/show palettes · Ctrl+I coordinate display · Ctrl+Shift+I infer constraints · Ctrl+J repeat last command · Ctrl+K hyperlink · Ctrl+L ortho · Ctrl+M repeat last command · Ctrl+N new · Ctrl+O open · Ctrl+P plot · Ctrl+Shift+P quick properties · Ctrl+Q quit · Ctrl+R cycle layout viewports · Ctrl+S save · Ctrl+Shift+S save as · Ctrl+T tablet · Ctrl+U polar · Ctrl+V paste · Ctrl+Shift+V paste as block · Ctrl+W selection cycling · Ctrl+X cut · Ctrl+Y redo · Ctrl+Z undo · Ctrl+[ and Ctrl+\ cancel · Ctrl+Tab / Ctrl+Shift+Tab next / previous drawing · Ctrl+Page Up / Ctrl+Page Down previous / next layout tab · Ctrl+F4 close drawing
Plain keys: Enter and Space accept or repeat · Esc cancel · Delete erase selection · Up/Down command history · Shift+Space cycle overlapping objects · Alt shows ribbon key tips

## Temporary override keys (TEMPOVERRIDES=1; hold to apply, release to restore; both key sets work)
Shift: toggle ortho · Shift+A or Shift+': toggle object snap · Shift+S or Shift+;: enforce object snap · Shift+E or Shift+P: endpoint override · Shift+V or Shift+M: midpoint override · Shift+C or Shift+,: center override · Shift+D or Shift+L: disable all snapping and tracking · Shift+Q or Shift+]: toggle object snap tracking · Shift+X or Shift+.: toggle polar tracking · Shift+Z or Shift+/: toggle dynamic UCS

## Mouse
Left click: pick or select. Left drag: left-to-right window, right-to-left crossing. Press-drag-release: lasso (PICKAUTO). Shift+click: remove from selection. Ctrl+click: subobject selection (polyline segments; solid faces, edges, vertices).
Right click: shortcut menu or Enter, per right-click customization (SHORTCUTMENU, time-sensitive right-click with SHORTCUTMENUDURATION). Shift+right click: object snap menu.
Wheel: zoom at cursor (ZOOMFACTOR, ZOOMWHEEL). Middle drag: pan (MBUTTONPAN=1). Middle double-click: zoom extents. Shift+middle drag: orbit.
Double-click an object: per double-click actions (DBLCLKEDIT/CUI) — TEXT, MTEXT, and dimension text edit in place; polyline opens PEDIT; hatch opens HATCHEDIT; block opens Edit Block Definition; block with attributes opens EATTEDIT; xref opens REFEDIT.
Grips: click a grip to make it hot; Space/Enter cycles 신축 → 이동 → 회전 → 축척 → 대칭; Shift+click selects several hot grips; Ctrl cycles multifunctional grip options and toggles copy mode; right-click on a hot grip opens the grip menu.

## Point input syntax
x,y · x,y,z · @dx,dy (relative) · @dist<angle · dist<angle (absolute polar) · #x,y (absolute when dynamic input defaults to relative) · <angle (angle override) · direct distance entry (type a number while the cursor shows the direction) · .X .Y .Z .XY .XZ .YZ point filters · FROM (FRO) base point plus offset · M2P or MTP midpoint between two points · TT temporary tracking point · TK tracking · spherical @dist<angle<angle · cylindrical @dist<angle,z

## Object snap overrides typed at point prompts
END, MID, CEN, GCE, NOD, QUA, INT, EXT, INS, PER, TAN, NEA, APP, PAR, NON, FROM, M2P, TT

## Keywords at Select objects (객체 선택:)
W, C, BOX, ALL, F, WP, CP, G, A, R, M, P, U, AU, SI, SU, O, L

## Dynamic input
Tab moves between fields · comma moves to the Y field in pointer input · < locks the angle · @ relative · # absolute · Down arrow opens the options menu · Enter accepts

## Default command aliases (core of acad.pgp)
Load these as the built-in default. Import the user's acad.pgp with identical syntax; the user's file wins on conflicts.
3A=3DARRAY, 3DO=3DORBIT, 3DW=3DWALK, 3F=3DFACE, 3M=3DMOVE, 3P=3DPOLY, 3R=3DROTATE, 3S=3DSCALE
A=ARC, AA=AREA, AC=BACTION, ADC=ADCENTER, AL=ALIGN, AP=APPLOAD, AR=ARRAY, ATE=ATTEDIT, -ATE=-ATTEDIT, ATT=ATTDEF, -ATT=-ATTDEF
B=BLOCK, -B=-BLOCK, BC=BCLOSE, BE=BEDIT, BH=HATCH, BO=BOUNDARY, -BO=-BOUNDARY, BR=BREAK, BS=BSAVE, BVS=BVSTATE
C=CIRCLE, CBAR=CONSTRAINTBAR, CH=PROPERTIES, -CH=CHANGE, CHA=CHAMFER, CLI=COMMANDLINE, CO=COPY, COL=COLOR, CP=COPY, CYL=CYLINDER
D=DIMSTYLE, DAL=DIMALIGNED, DAN=DIMANGULAR, DAR=DIMARC, DBA=DIMBASELINE, DC=ADCENTER, DCE=DIMCENTER, DCO=DIMCONTINUE, DCON=DIMCONSTRAINT, DDI=DIMDIAMETER, DED=DIMEDIT, DELCON=DELCONSTRAINT, DI=DIST, DIMTED=DIMTEDIT, DIV=DIVIDE, DJL=DIMJOGLINE, DJO=DIMJOGGED, DLI=DIMLINEAR, DO=DONUT, DOR=DIMORDINATE, DOV=DIMOVERRIDE, DR=DRAWORDER, DRA=DIMRADIUS, DRE=DIMREASSOCIATE, DS=DSETTINGS, DST=DIMSTYLE, DT=TEXT, DV=DVIEW, DX=DATAEXTRACTION
E=ERASE, ED=TEXTEDIT, EL=ELLIPSE, EPDF=EXPORTPDF, ER=EXTERNALREFERENCES, EX=EXTEND, EXIT=QUIT, EXP=EXPORT, EXT=EXTRUDE
F=FILLET, FI=FILTER, FSHOT=FLATSHOT
G=GROUP, -G=-GROUP, GCON=GEOCONSTRAINT, GD=GRADIENT
H=HATCH, -H=-HATCH, HE=HATCHEDIT, HI=HIDE
I=INSERT, -I=-INSERT, IAD=IMAGEADJUST, IAT=IMAGEATTACH, ICL=IMAGECLIP, IM=IMAGE, IMP=IMPORT, IN=INTERSECT, INF=INTERFERE, IO=INSERTOBJ
J=JOIN, JOG=DIMJOGGED
L=LINE, LA=LAYER, -LA=-LAYER, LAS=LAYERSTATE, LE=QLEADER, LEAD=LEADER, LEN=LENGTHEN, LI=LIST, LO=-LAYOUT, LS=LIST, LT=LINETYPE, -LT=-LINETYPE, LTS=LTSCALE, LW=LWEIGHT
M=MOVE, MA=MATCHPROP, ME=MEASURE, MEA=MEASUREGEOM, MI=MIRROR, ML=MLINE, MLD=MLEADER, MLE=MLEADEREDIT, MLS=MLEADERSTYLE, MO=PROPERTIES, MS=MSPACE, MT=MTEXT, MV=MVIEW
O=OFFSET, OP=OPTIONS, ORBIT=3DORBIT, OS=OSNAP, -OS=-OSNAP
P=PAN, -P=-PAN, PA=PASTESPEC, PAR=PARAMETERS, PARAM=BPARAMETER, PE=PEDIT, PL=PLINE, PO=POINT, POFF=HIDEPALETTES, POL=POLYGON, PON=SHOWPALETTES, PR=PROPERTIES, PRE=PREVIEW, PRINT=PLOT, PS=PSPACE, PSOLID=POLYSOLID, PU=PURGE, -PU=-PURGE, PYR=PYRAMID
QC=QUICKCALC, QP=QUICKPROPERTIES, QVD=QVDRAWING, QVL=QVLAYOUT
R=REDRAW, RA=REDRAWALL, RE=REGEN, REA=REGENALL, REC=RECTANG, REG=REGION, REN=RENAME, -REN=-RENAME, REV=REVOLVE, RO=ROTATE, RR=RENDER
S=STRETCH, SC=SCALE, SCR=SCRIPT, SEC=SECTION, SET=SETVAR, SHA=SHADEMODE, SL=SLICE, SN=SNAP, SO=SOLID, SP=SPELL, SPE=SPLINEDIT, SPL=SPLINE, SPLANE=SECTIONPLANE, SSM=SHEETSET, ST=STYLE, SU=SUBTRACT
T=MTEXT, -T=-MTEXT, TB=TABLE, TEDIT=TEXTEDIT, TH=THICKNESS, TI=TILEMODE, TO=TOOLBAR, TOL=TOLERANCE, TOR=TORUS, TP=TOOLPALETTES, TR=TRIM, TS=TABLESTYLE
UC=UCSMAN, UN=UNITS, -UN=-UNITS, UNI=UNION
V=VIEW, -V=-VIEW, VP=DDVPOINT, -VP=VPOINT, VS=VSCURRENT, VSM=VISUALSTYLES
W=WBLOCK, -W=-WBLOCK, WE=WEDGE
X=EXPLODE, XA=XATTACH, XB=XBIND, -XB=-XBIND, XC=XCLIP, XL=XLINE, XR=XREF, -XR=-XREF
Z=ZOOM
Complete the remaining aliases from the acad.pgp of the current AutoCAD release (Autodesk publishes the full list), add each one here, and flag any you could not verify in docs/PARITY_CHECKLIST.md.
