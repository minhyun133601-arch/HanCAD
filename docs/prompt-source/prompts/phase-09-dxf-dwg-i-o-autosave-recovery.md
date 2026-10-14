PHASE 9 — DXF/DWG I/O, autosave, recovery
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–8 are done.

Goal: open and save real drawings losslessly, so I can start using HanCAD on real files.

Build:
- DXF reader and writer, ASCII and binary: R12 (AC1009), R2000 (AC1015), R2004 (AC1018), R2007 (AC1021), R2010 (AC1024), R2013 (AC1027), R2018 (AC1032). All sections: HEADER, CLASSES, TABLES, BLOCKS, ENTITIES, OBJECTS, THUMBNAILIMAGE, ACDSDATA. Every entity and object type from Phase 1; unknown ones preserved verbatim; XDATA, extension dictionaries (102 groups), reactors (330), handles, owners. R12 output converts types the way AutoCAD does (for example LWPOLYLINE to POLYLINE). Korean text per AGENTS.md section 3 ($DWGCODEPAGE, \U+, \M+). Streaming parse in a worker.
- DWG through ODA File Converter: detect it or let me set its path (OPTIONS > 파일), and convert through temporary folders with its command-line interface (input folder, output folder, output version, output type, recurse flag, audit flag, file filter; verify the exact syntax in its documentation). Fallback reading through @mlightcad/libredwg-web in a worker; its default build has DXF parsing and DWG writing turned off, so use it only for reading DWG. Show a Korean notice when DWG saving is unavailable.
- Viewing fidelity for everything I may open now, even where editing comes later: MTEXT, TEXT, DIMENSION (through its *D block), HATCH, INSERT, LEADER, MULTILEADER, TABLE, IMAGE frames, VIEWPORT, and 3D entities as wireframe.
- File commands: NEW and QNEW (templates), OPEN (preview thumbnail, read-only, several files), SAVE, QSAVE, SAVEAS (DWG/DXF versions, DXF precision, DWT, native .hcd), CLOSE, CLOSEALL, QUIT with Korean save prompts, RECOVER, AUDIT, DRAWINGRECOVERY, autosave (SAVETIME, SAVEFILEPATH, .sv$), .bak files (ISAVEBAK), a lock file against concurrent editing, drag and drop to open, recent files, the 시작 (Start) tab with templates and recent files, and the file-tab context menu.
- A built-in metric template equivalent to acadiso.dwt, saved as .dwt.
- A round-trip harness: a semantic diff of databases (ignoring handle order) that runs on generated files and on my private test-corpus/ folder.

Acceptance:
- [ ] My real DWG and DXF files open; layers, blocks, text, dimensions, and hatches look as they do in AutoCAD.
- [ ] Open, save as DXF 2018, and reopen gives zero semantic differences across the corpus.
- [ ] Korean layer and block names survive R2004 (CP949) and R2018 (UTF-8) round trips.
- [ ] A 50 MB DXF opens in under 10 s with a progress bar and Esc to cancel.
- [ ] Killing the app mid-edit and restarting offers recovery through DRAWINGRECOVERY.
