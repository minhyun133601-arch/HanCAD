PHASE 14 — Layouts, viewports, page setup, plotting
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–13 are done.

Goal: correctly scaled sheets and plots, exactly as an AutoCAD office produces them.

Build:
- Layouts: create, delete, rename, move, copy, from template (LAYOUT options), the tab context menu, Ctrl+Page Up/Down; paper display (sheet, shadow, dashed printable area, white background).
- Viewports: MVIEW (Fit, Lock, Object, Polygonal, Restore, LAyer, 2/3/4), VPORTS for layouts and for tiled model viewports with named configurations, standard and custom scale lists (SCALELISTEDIT), VPMAX/VPMIN, MSPACE/PSPACE and double-click switching, CHSPACE, VPCLIP, VPLAYER, layer viewport overrides (color, linetype, lineweight, transparency, plot style) with the Layer manager's VP columns, viewport locking, shade plot options, per-viewport annotation scale, PSLTSCALE, Ctrl+R cycling.
- PAGESETUP manager and plotter configurations: Windows printers through Tauri; a built-in PDF plotter with an original name; ISO A0–A4 with and without margins; custom sizes; plot area (Display, Extents, Limits, Layout, Window); offset and centering; exact scale or fit; scaled lineweights; CTB/STB plot style tables (read and write AutoCAD's .ctb/.stb files, with an editor dialog — Korean offices map colors to pen widths through CTB, so this must be exact); shaded viewport options; plot options; orientation.
- PLOT dialog with full preview (PREVIEW); plotting to a printer, PDF, PNG, and SVG; PUBLISH (several layouts or drawings to one multi-page PDF or to printers); PLOTSTAMP; EXPORTPDF; EXPORTLAYOUT.
- PDF quality: vector geometry, TrueType text as searchable embedded subset fonts (Korean included), SHX text as geometry, optional PDF layers, hyperlinks, images, solid and gradient fills, transparency.

Acceptance:
- [ ] A 1:100 viewport on A3 plotted to PDF measures exactly (1000 mm in the model is 10 mm on paper).
- [ ] My company's .ctb produces the same pen widths and colors as AutoCAD's PDF of the same layout.
- [ ] Korean TrueType text in the PDF is searchable and copyable.
- [ ] PUBLISH of all layouts from three drawings creates one PDF with the pages in order.
