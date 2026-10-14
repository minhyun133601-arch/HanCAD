PHASE 16 — Advanced 2D drafting
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–15 are done.

Goal: the remaining advanced 2D features.

Build:
- Associative arrays: ARRAYRECT, ARRAYPOLAR, ARRAYPATH with ASsociative = Yes, stored the way AutoCAD stores them for DWG/DXF compatibility; the contextual ribbon tab 배열; array grips (count, spacing, levels, radius, and so on); ARRAYEDIT (Source, Replace, Reset; Ctrl+click item editing); ARRAYCLOSE; ARRAYASSOCIATIVITY.
- TABLE and TABLESTYLE: insert empty, from CSV/XLSX data links, or from data extraction; in-place cell editing with Korean IME; formulas (=Sum, Average, Count, cell references, equations); cell formats; merging; inserting and deleting rows and columns; table breaks; table grips; TABLEEXPORT; pasting Excel ranges as tables.
- FIELD: insert fields (date, file name, object properties such as area and length, system variables, DIESEL expressions, formulas), FIELDEVAL, FIELDDISPLAY gray background, updates on save, regen, and plot.
- Complete annotative scaling: annotative text, dimensions, multileaders, hatches, blocks, attributes; scale representations; ANNOAUTOSCALE, ANNOALLVISIBLE, SELECTIONANNODISPLAY, ANNOUPDATE, OBJECTSCALE, AIOBJECTSCALEADD/REMOVE, ANNORESET.
- MLINE complete: the MLSTYLE dialog and MLEDIT tools.
- A simplified Sheet Set Manager (Ctrl+4): sheet list, sheet numbers and titles as fields, publishing the set.

Acceptance:
- [ ] Editing the source of an associative rectangular array changes every item; Ctrl+click moves one item only.
- [ ] A table with =Sum(A1:A3) updates when a cell changes and exports to CSV with Korean text intact.
- [ ] An annotative dimension shows at the right size in 1:50 and 1:100 viewports of the same layout.
