PHASE 8 — Layers and properties
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–7 are done.

Goal: layers, linetypes, colors, lineweights, and the Properties palette work like AutoCAD's.

Build:
- Layer Properties Manager (LAYER) as a modeless palette with the Korean columns 상태, 이름, 켜기, 동결, 잠금, 플롯, 색상, 선종류, 선가중치, 투명도, 새 VP 동결, 설명 (viewport columns arrive in Phase 14). Sorting, search, new/delete/set current, rename with F2, property filters with expressions, group filters, invert filter, layer states (save, restore, import/export .las), unreconciled-layer notifications (LAYERNOTIFY, LAYEREVAL), LAYLOCKFADECTL, the rules for layer 0 and Defpoints, LAYERP and LAYERPMODE, and the full -LAYER command-line version.
- Layer tools: LAYISO (lock-and-fade or off setting), LAYUNISO, LAYOFF, LAYON, LAYFRZ, LAYTHW, LAYLCK, LAYULK, LAYMCUR, LAYMCH, LAYCUR, LAYMRG, LAYDEL, LAYWALK, COPYTOLAYER, SETBYLAYER.
- Color dialog (Index Color, True Color with RGB/HSL, Color Books placeholder). LINETYPE manager: load from .lin files; ship an original .lin with the standard names and patterns (DASHED, HIDDEN, CENTER, PHANTOM, DOT, DASHDOT, BORDER, DIVIDE, the ISO set); complex linetypes are parsed now and rendered after Phase 10. LWEIGHT dialog. Transparency (CETRANSPARENCY, TRANSPARENCYDISPLAY). CLAYER, CECOLOR, CELTYPE, CELWEIGHT, CELTSCALE.
- Properties palette: categories (일반, 3D 시각화, 형상, 기타, and per type), multiple selection with *다양함*, a type filter list, the Quick Select, PICKADD, and select buttons, editable geometry fields that accept expressions. Quick Properties (Ctrl+Shift+P, QPLOCATION). Rollover tooltips (ROLLOVERTIPS).
- Ribbon Home panels for layers and properties: the layer dropdown with on/freeze/lock icons that work directly, color/linetype/lineweight/transparency dropdowns, Match Layer.
- MATCHPROP with its Settings dialog; special properties are added as each type arrives in later phases.
- ISOLATEOBJECTS, HIDEOBJECTS, UNISOLATEOBJECTS (OBJECTISOLATIONMODE).

Acceptance:
- [ ] Freezing a layer from the ribbon dropdown hides its objects immediately; LAYISO then LAYUNISO restores the exact previous state.
- [ ] Selecting a line and a circle shows *다양함* for differing values and edits both when a shared value changes.
- [ ] Loading my own .lin file with a complex linetype keeps its definition (text and shapes may render only after Phase 10).
- [ ] ByLayer and ByBlock resolve exactly as in AutoCAD for nested blocks (tests with block data from Phase 1).
