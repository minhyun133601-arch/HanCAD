# Phase 05 integration and acceptance audit

The original phase prompt is selection, grips and Clipboard. Implementation is
complete for the current supported entity families; final verification is
recorded in PROGRESS.md. Native compilation and actual Windows execution now
follow the user-authorized MSVC/SDK installation; current results are recorded
in phase05-native-acceptance.md rather than inferred from browser mocks.

| Build item                                            | Implementation / evidence                                                                                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PICKFIRST/PICKADD/PICKAUTO/PICKDRAG/PICKSTYLE         | Shared SelectionSession/rules, pointer gesture policy, idle preselection gate, command-owned Ctrl+A, Shift removal/toggle, explicit selection methods and aggregate group grips                    |
| Preview/effect/filter/area/cycling variables          | Indexed candidates, targeted GPU style texels, ACI/opacity overlay, preview limit, locked/group filters, overlap badge/list and Shift+Space; installed-reference visual comparison remains pending |
| Object prompt, all 18 keywords, counts and duplicates | Common session for SELECT and MOVE/COPY/Clipboard; literal Korean prompt, supplemental keyword controls and dynamic Down menu, editable Korean group names                                         |
| QSELECT/SELECTSIMILAR/FILTER                          | Type/property/operator/scope selection, similarity bitcode/settings, persisted nested AND/OR/NOT/XOR expression trees                                                                              |
| GROUP/GROUPEDIT/UNGROUP                               | Names/descriptions/member changes, stable native handles/ownership/reactors, separate copied groups, group bounds and supported DXF persistence                                                    |
| Grips and every current entity provider               | LINE, polyline/rect, circle, arc, TEXT and DIMENSION; GRIPS/color/size/limit/block/group settings, multi-hot and multifunction hover/Ctrl                                                          |
| Modes, options and drafting aids                      | Stretch/Move/Rotate/Scale/Mirror, Base/Copy/Undo/Reference/eXit; shared exact snaps/polar/tracking/dynamic locks, accepted-copy snap sources and one transaction                                   |
| Polyline/line multifunction actions                   | Add/remove vertex, exact bulge conversion, curved midpoint edits and line Lengthen; normalization/render/snap/SVG/DXF retain curves                                                                |
| ERASE/Delete/OOPS                                     | Shared selection/locked filtering; erasure recovery and command history remain integrated                                                                                                          |
| Clipboard and shortcuts                               | COPYCLIP/CUTCLIP/COPYBASE/PASTECLIP/PASTEBLOCK/PASTEORIG, exact cross-document/window data, system JSON+PNG and reported browser fallback                                                          |
| Properties and Quick Properties                       | Basic common/type geometry editors, WCS conversions, mixed values and validation, Ctrl+1/QPMODE/PICKFIRST; full customization remains Phase 08                                                     |

All five original acceptance scenarios have focused production-browser evidence:
directional rectangular selection and press-drag lasso; noun/verb and verb/noun
selection plus Shift removal; grip Space three times followed by scalar 2;
polyline Add/Remove/Convert to Arc; COPYBASE to another drawing then PASTECLIP.
The final comprehensive run covered these fixtures; complete results and the
single long-workflow timeout/rerun are recorded in PROGRESS.md.

## Current-build manual sequence

1. Create a line: `L` Enter, `0,0` Enter, `100,0` Enter, Enter. Click the line
   away from its endpoints/midpoint. Click its first endpoint grip, press Space
   three times, type `2`, Enter. The second endpoint becomes (200,0). `U` Enter
   restores the original and `REDO` Enter reapplies it.
2. Create a polyline: `PL` Enter, `0,30` Enter, `40,30` Enter, `40,60` Enter,
   Enter. Select it, hover a vertex for the menu, choose Add Vertex and pick a
   new point. Reopen the menu for Remove Vertex. Choose Convert to Arc and pick
   an off-chord point; the result remains curved after save/reload or supported
   DXF export/import. Convert to Line restores a straight outgoing edge.
3. At default PICKAUTO=5, press-drag a loop to lasso. Click-release-click two
   corners for a rectangle: left-to-right contains, right-to-left crosses. Hold
   Shift and click away from a grip to remove an object. Set PICKAUTO=1 to use
   held-button rectangular dragging. During a lasso Space cycles its method.
4. `MOVE` Enter, `ALL` Enter, Enter, `0,0` Enter, `@10,0` Enter. `SELECT` Enter,
   `P` Enter recalls the preceding set. `R` Enter removes; `A` Enter adds. Try
   the selection-options popup or dynamic Down menu for the same keywords.
5. Select objects, Ctrl+Shift+C, enter `20,30`, Enter. `NEW` Enter, focus the
   drawing canvas, Ctrl+V, enter `100,100`, Enter. Stored geometry is displaced
   by (80,70) in WCS. `U` Enter removes the entire paste. Focus the drawing
   canvas, Ctrl+Shift+V, enter `50,50`, Enter to create a persistent block
   instance. DXF save/reopen retains its supported member set and insertion point.
6. Select an object and press Ctrl+1 to open basic Properties. Change a coordinate
   and press Enter, then focus the command input before `U` Enter to undo that
   edit. Focus the drawing canvas before Ctrl+Shift+P to toggle Quick Properties.
   `DDGRIPS` Enter
   edits selection/grip settings with Apply/Cancel semantics.

## Evidence and limits

The integration regression pass found two real ownership/focus errors: TRIM
target clicks were opening generic two-corner selection, and a grip menu could
reopen during Undo redraw and steal REDO input. Fence clicks now stay with the
editing command; generic two-corner state excludes editing/navigation owners.
Grip menus require physical hover movement and close on command-line focus.
Their focused regressions include Standard TRIM boundary rectangles and opening
the grip menu before typing REDO.

Older rectangle/body-drag fixtures now explicitly choose PICKAUTO=1 and avoid
actual midpoint grips. The official DWG fixture gains one valid closed,
3,635-vertex bulged polyline previously omitted by the tessellation limit;
compatibility checks assert its exact vertices and bulges. Read cancellation
tests deliberately keep the worker pending so they test cancellation before
completion rather than a race against a completed read.

Detailed sources and focused checks are in phase05-selection-notes.md,
phase05-grip-notes.md and phase05-clipboard-notes.md. Renderer references are
independent test drawings, not screenshots of installed AutoCAD. The native
toolchain is now installed, and actual Tauri processes exercise the real Win32
Clipboard and image consumers; final current-build results are recorded in
[native acceptance](phase05-native-acceptance.md). Physical Windows IME and
OS-routed shortcut comparisons remain separately identified checks. Complete
opaque foreign DXF/DWG preservation, full block editing and full Properties
remain their original later phases.
