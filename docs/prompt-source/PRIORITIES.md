# Prompt archive and implementation order

This folder contains the original supplied ZIP, organized without changing its
requirements. `AGENTS.md` is the master specification, `HanCAD_prompts_full.md` is
the combined version, `prompts/` contains all 26 phase prompts and five utility
prompts, and `docs/` contains the original terminology and shortcut references.
The original `README_KO.md` explains how to use the prompt set.

On 2026-10-14 the user prioritized a usable simple 2D application. Advanced features,
including 3D, remain accepted future scope but must not delay essential drawing.
Overlapping behavior still follows these original prompts.

| Priority | Prompt phases | Deliverable |
| --- | --- | --- |
| Now | 00–03, 09, 14 | Runnable main app, local DWG/DXF opening, view navigation, Korean command input, DXF saving, PDF/image output |
| Now | 04–07 | Mouse/coordinate drawing, LINE/CIRCLE/RECTANG/PLINE, basic selection and erase, one-command undo/redo |
| Now | 02, 11, 24–25 | Reliable browser launch, practical large-file navigation and initial dimension creation/basic styles |
| Next | 04–08, 10–11 | Accurate snapping, move/copy, trim/extend/offset, text, complete dimension workflows and basic layer/property editing |
| Later | 09, 12–16, 24–25 | Better real-file preservation, blocks/hatches, precise plotting, compatibility, performance and packaging |
| Deferred | 17–23 | Dynamic blocks, constraints, automation/customization and 3D |

This is a delivery order, not a claim that an entire phase is complete. The exact
implemented command/options and verification evidence live in `../COMMANDS.md` and
`../PROGRESS.md`; the in-app progress dialog reads `../development-progress.json`.
Each usable increment refreshes the same main application.
