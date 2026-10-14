PHASE 20 — Customization, workspaces, palettes, Express Tools
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–19 are done.

Goal: customize HanCAD the way AutoCAD is customized, and add the Express Tools Korean users rely on.

Build:
- A CUI editor for our own customization file (JSON), plus import of AutoCAD .cuix files (a zip of XML): keyboard shortcuts, temporary overrides, menus, ribbon tabs and panels, toolbars, double-click actions, quick properties, rollover tooltips, shortcut menus, mouse buttons, workspaces; a Transfer tab; partial customization files.
- The complete ribbon: every tab, panel, and contextual tab; galleries; split buttons that remember the last tool; slide-out panels with pins; minimize states; Alt key tips; floating panels. Quick Access Toolbar customization; the application menu with command search and recent documents; classic toolbars (float and dock); the classic menu bar (MENUBAR=1: 파일(F), 편집(E), 뷰(V), 삽입(I), 형식(O), 도구(T), 그리기(D), 치수(N), 수정(M), 파라메트릭(P), 윈도우(W), 도움말(H)); workspaces (제도 및 주석, 3D 기본 사항, 3D 모델링, and a classic layout); WSCURRENT; LOCKUI.
- TOOLPALETTES (Ctrl+3): tools for commands, blocks, hatches, and tables; drag from the drawing to create tools; tool properties; palette groups; import and export.
- Docking, floating, auto-hide, anchoring, and transparency for every palette, as in AutoCAD.
- Express Tools: TXTEXP, TXT2MTXT, TCOUNT, TCASE, TORIENT, TFRAMES, ARCTEXT, TEXTFIT, TEXTMASK, TEXTUNMASK, BURST, NCOPY, BCOUNT, BLOCKREPLACE, BSCALE, BREAKLINE, SUPERHATCH, FLATTEN, EXTRIM, MPEDIT, COPYM, GATTE, ATTOUT, ATTIN, REDIR, MOVEBAK, SHOWURLS, CHURLS, XDLIST, MKLTYPE, MKSHAPE, VPSCALE, VPSYNC, SSX, EXOFFSET. Add the rest of the Express set afterwards, as time permits.

Acceptance:
- [ ] Importing my AutoCAD .cuix brings over my keyboard shortcuts and double-click actions.
- [ ] Switching workspaces changes the ribbon, palettes, and menu bar as in AutoCAD.
- [ ] BURST, TXTEXP, and SUPERHATCH work on my test drawing.
