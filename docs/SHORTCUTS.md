# Reference B — Shortcuts, aliases, mouse behavior, input syntax
(Save as docs/SHORTCUTS.md. Every binding here must work. Bindings whose command is not built yet must still be registered and print the Korean not-implemented message.)

## Function keys
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
