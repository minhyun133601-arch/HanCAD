# Original implementation order

This folder preserves the supplied prompts without changing their requirements.
`AGENTS.md` is the master specification, `HanCAD_prompts_full.md` is
the combined version, `prompts/` contains all 26 phase prompts and five utility
prompts, and `docs/` contains the original terminology and shortcut references.
The original `README_KO.md` explains how to use the prompt set.

The user's latest instruction on 2026-10-15 is to follow the supplied prompts in
order. This supersedes the earlier essential-2D feature priorities. Original
prompts and their acceptance requirements remain unchanged.

1. Finish Phase 00 Bootstrap, including actual Tauri startup and window-state
   acceptance. Browser verification alone is insufficient.
2. Complete Phase 01, then 02, continuing numerically through Phase 25. Run each
   phase's acceptance before starting implementation of the next phase.
3. Preserve previously delivered later-phase features and their regression tests.
   Those working subsets do not complete the containing original phases.

The current earliest gap is Phase 00. MSVC and the Windows SDK are missing, and
their earlier automatic installation was rejected by approval review. Keep native
acceptance pending until the prerequisite is available and the app is exercised.

`../PROGRESS.md` records the active milestones, exact next step and test evidence.
`NEXT_STEPS.md` is the continuation handoff. The in-app progress dialog reads
`../development-progress.json`; it reports implementation status, not a different
delivery order.
