PHASE 5 — Selection, grips, clipboard
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–4 are done.

Goal: selecting and grip editing feel exactly like AutoCAD.

Build:
- Selection rules: PICKFIRST (noun-verb), PICKADD 0/1/2, PICKAUTO (implied windowing, press-drag lasso), PICKDRAG, PICKSTYLE, SELECTIONPREVIEW, SELECTIONEFFECT, PREVIEWFILTER, SELECTIONAREA with its colors and opacity, SELECTIONCYCLING (Ctrl+W, list box), locked-layer filtering with messages.
- The 객체 선택: prompt with every keyword in docs/SHORTCUTS.md, n개를 찾음 counts, and duplicate messages. Ctrl+A, Shift+click removal, Esc clearing.
- QSELECT dialog, SELECTSIMILAR (with its settings), FILTER (named filters and operators), SELECT, GROUP and GROUPEDIT (create, name, description, add, remove, explode), the Ctrl+Shift+A group toggle, group bounding boxes.
- Grips: GRIPS, GRIPSIZE, GRIPCOLOR, GRIPHOVER, GRIPHOT, GRIPCONTOUR, GRIPOBJLIMIT, GRIPBLOCK, GRIPTIPS, GRIPMULTIFUNCTIONAL. The Space/Enter cycle 신축 → 이동 → 회전 → 축척 → 대칭 with Base point, Copy, Undo, Reference, and eXit; multiple hot grips with Shift; grips that honor osnap, polar, tracking, and dynamic input. A grip-provider interface plus providers for every current entity, including multifunction menus (polyline Add Vertex, Remove Vertex, Convert to Arc/Line, Stretch; line Lengthen).
- ERASE and the Delete key; OOPS.
- Clipboard: COPYCLIP (Ctrl+C), CUTCLIP (Ctrl+X), PASTECLIP (Ctrl+V), COPYBASE (Ctrl+Shift+C), PASTEBLOCK (Ctrl+Shift+V), PASTEORIG, between drawings and between HanCAD windows; the system clipboard carries an internal format plus an image.
- A basic Properties palette (Ctrl+1) and Quick Properties for current entity types; the full version comes in Phase 8.

Acceptance:
- [ ] Left-to-right drag selects only enclosed objects (blue); right-to-left selects touching objects (green, dashed); press-drag draws a lasso.
- [ ] Select-then-command and command-then-select both work; Shift+click removes.
- [ ] Clicking a line grip, pressing Space three times, and typing 2 scales by 2 about that grip.
- [ ] The polyline vertex grip menu offers Add Vertex, Remove Vertex, and Convert to Arc, and each works.
- [ ] Ctrl+Shift+C then Ctrl+V in another drawing pastes at the chosen base point.
