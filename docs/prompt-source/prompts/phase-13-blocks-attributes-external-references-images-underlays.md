PHASE 13 — Blocks, attributes, external references, images, underlays
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–12 are done.

Goal: reuse and references work the way AutoCAD users rely on every day.

Build:
- BLOCK (dialog and -BLOCK: name, base point, retain/convert/delete, annotative, scale uniformly, allow exploding, units, open in block editor), redefinition prompts, WBLOCK, INSERT with the Blocks palette (Current drawing, Recent, Favorites, Libraries; repeat placement; explode option), -INSERT with every option including *name, MINSERT, nested blocks.
- Attributes: ATTDEF (Invisible, Constant, Verify, Preset, Lock position, Multiple lines; tag, prompt, default), ATTDIA and ATTREQ behavior, ATTEDIT and -ATTEDIT, EATTEDIT, BATTMAN, ATTSYNC, ATTDISP, ATTIPEDIT, DATAEXTRACTION (a simplified wizard that exports block counts and attributes to CSV or a TABLE).
- BEDIT for static blocks (dynamic features come in Phase 17), REFEDIT and REFCLOSE for in-place editing of blocks and xrefs, COUNT with its counting palette.
- External references: the EXTERNALREFERENCES palette (attach DWG/DXF, overlay, full/relative/no path, nested display, reload, unload, detach, bind and insert), XBIND, XCLIP (rectangular, polygonal, inverted, delete; XCLIPFRAME), xref|layer names, VISRETAIN, XREFNOTIFY balloons, XDWGFADECTL, XOPEN; Korean paths.
- Images: IMAGEATTACH (PNG, JPG, TIF, BMP), IMAGECLIP, IMAGEADJUST, IMAGEFRAME, IMAGEQUALITY, transparency.
- PDF: PDFATTACH (layers, snapping to PDF geometry, clipping, fade/contrast/monochrome) and PDFIMPORT (vectors, text including Korean, raster images, solid fills, layer options).
- DesignCenter (Ctrl+2): browse blocks, layers, styles, and linetypes in other drawings and drag them in. Dragging a .dwg or .dxf onto the canvas inserts it as a block.

Acceptance:
- [ ] A title block with attributes inserts with Korean attribute prompts; EATTEDIT edits values; ATTSYNC updates references after BATTMAN changes.
- [ ] An xref with a relative path reloads when the source changes and shows the AutoCAD-style notification.
- [ ] PDFIMPORT of a vector PDF yields editable lines and Korean text.
- [ ] Blocks and xrefs from my real drawings round-trip through DXF/DWG unchanged.
