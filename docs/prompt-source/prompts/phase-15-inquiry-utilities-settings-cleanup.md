PHASE 15 — Inquiry, utilities, settings, cleanup
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–14 are done.

Goal: the supporting tools and dialogs AutoCAD users touch every day.

Build:
- Inquiry: DIST (multiple points), AREA (object, add, subtract), MEASUREGEOM (quick hover measuring plus distance, radius, angle, area, volume), ID, LIST, MASSPROP (regions now, solids in Phase 22), TIME, STATUS, DWGPROPS.
- Calculation: the QUICKCALC palette (variables, unit conversion, geometry functions, picking coordinates, distances, angles, and intersections from the drawing) and CAL with AutoCAD's functions (rad, dee, ill, ille, nee, vec, vec1, cvunit, pld, plt, rot, cur, and @).
- Settings: UNITS dialog (including insertion scale), LIMITS, OPTIONS with every tab (파일, 화면표시, 열기 및 저장, 플롯 및 게시, 시스템, 사용자 기본 설정, 제도, 3D 모델링, 선택, 프로파일) wired to sysvars and profile storage, profiles (create, rename, export, import), and a system variable browser.
- Cleanup: PURGE (dialog with purgeable and non-purgeable views, nested items, zero-length geometry, empty text, orphaned data; -PURGE), RENAME, and Korean AUDIT reports.
- Views: the VIEW manager (named views with layer snapshots, UCS, backgrounds), NAVBAR.
- HYPERLINK, and DWGCOMPARE (overlay two drawings with color-coded differences).

Acceptance:
- [ ] OPTIONS changes (crosshair size, background color, right-click behavior, autosave interval) persist across restarts in the active profile.
- [ ] AREA with Add and Subtract matches AutoCAD on a test plan with holes; MEASUREGEOM quick mode shows hover dimensions.
- [ ] PURGE removes every unused layer, style, and block, including nested ones.
- [ ] CAL evaluates the rad, ill, and cvunit examples from AutoCAD's documentation correctly.
