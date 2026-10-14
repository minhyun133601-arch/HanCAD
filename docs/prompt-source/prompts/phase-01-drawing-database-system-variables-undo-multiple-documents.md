PHASE 1 — Drawing database, system variables, undo, multiple documents
Follow the Standard Phase Protocol in AGENTS.md. Phase 0 is done.

Goal: the in-memory drawing model every later phase builds on, mirroring AutoCAD's database.

Build:
- Database with symbol tables, the named object dictionary, layouts (Model, Layout1, Layout2) and their block records (*Model_Space, *Paper_Space), handles ($HANDSEED), owners, reactors, extension dictionaries, and XDATA by registered application.
- Entity base with common properties: layer, color (ACI 0–256, true color, color book name), linetype, linetype scale, lineweight, transparency, plot style name, visibility, thickness, extrusion normal, material, shadow flags.
- Data definitions with DXF group-code mapping for every AutoCAD entity and object type (2D, 3D, annotation, references, proxies). Geometry behavior (bounds, transform, evaluation, closest point, length, area) now for LINE, POINT, CIRCLE, ARC, ELLIPSE, LWPOLYLINE (bulges, widths), 2D/3D POLYLINE, SPLINE (NURBS and fit data), XLINE, RAY. Types without behavior yet are stored losslessly.
- Defaults that match acadiso.dwt: layer 0; linetypes ByBlock, ByLayer, Continuous; text styles Standard and Annotative; dimension styles ISO-25 (current), Standard, Annotative; multileader, table, and mline styles; the World UCS; LIMITS 0,0 to 420,297; GRIDUNIT and SNAPUNIT 10,10; LUNITS 2; LUPREC 4.
- System variables: a declarative registry (name, type, default, range or enum, bit-flag meanings, scope drawing/profile/session, read-only, Korean description). Include every DXF header variable and every sysvar named in Reference B or in later phases; aim for completeness (500+). SETVAR, GETVAR, and typing a name at the command line (OSMODE에 대한 새 값 입력 <4133>: — verify the Korean wording). Invalid values are rejected with AutoCAD-style Korean messages. Generate docs/SYSVARS.md from the registry.
- Transactions and undo: one group per command; U, UNDO (Auto, Control, BEgin, End, Mark, Back, number), REDO, MREDO, UNDOCTL, OOPS. Sysvar changes saved in the drawing are undoable as in AutoCAD.
- Event bus: object added, modified, erased, unerased; sysvar changed; document activated.
- Multiple documents: Drawing1, Drawing2, ...; each with its own database, undo, and drawing-scope sysvars; profile-scope sysvars are shared.
- Command registry and a headless runner that feeds scripted input (points, keywords, strings) to commands.
- A native format (.hcd: zipped JSON plus binary blobs) for autosave, tests, and saving work until DXF arrives in Phase 9.

Acceptance:
- [ ] A property-based test applies 1,000 random create/modify/erase operations, undoes them all, and gets a database identical to the start; redo restores the end state.
- [ ] Headless: typing OSMODE shows 4133; setting 99999 is rejected; SETVAR LUPREC 2 changes display precision.
- [ ] docs/SYSVARS.md lists every registered variable with scope and default.
- [ ] Saving to .hcd and reloading gives an identical database.
