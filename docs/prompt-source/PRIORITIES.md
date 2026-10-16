# Original implementation order

This folder preserves the supplied feature and Acceptance requirements. The
shared workflow is maintained in response to explicit user instructions.
`AGENTS.md` is the master specification, `HanCAD_prompts_full.md` is
the combined version, `prompts/` contains all 26 phase prompts and five utility
prompts, and `docs/` contains the original terminology and shortcut references.
The original `README_KO.md` explains how to use the prompt set.

The user requested original phase order on 2026-10-15 and updated the validation
cadence on 2026-10-16. Implement the requested phase's milestones in batches,
using typechecking and brief changed-feature checks during development. Run full
verification and all Acceptance checks after that phase's implementation is
finished; do not repeat full suites just to start/resume or after each milestone.
Required test coverage and feature scope remain unchanged. The working root
`AGENTS.md` and the active section of `../PROGRESS.md` govern current work.

1. Preserve the user's deferral of Phase 00 native startup/window acceptance.
   Browser verification alone is insufficient to complete that acceptance.
2. Phases 01-03 implementation and browser acceptance are complete. Phase 04 was
   started and explicitly paused by the user on 2026-10-17. Resume only on request
   using `../PROGRESS.md`; implementation/type integration and final validation
   remain pending. Do not begin Phase 05. Native/reference limitations remain
   explicit in the progress record.
3. Preserve previously delivered later-phase features and their regression tests.
   Those working subsets do not complete the containing original phases.

Phase 00 native acceptance remains an earlier deferred gap. Its prerequisites
were unavailable at the last native check. Keep it pending until the prerequisites
are available and the actual desktop app is exercised; follow the active handoff
for authorized work in the meantime.

`../PROGRESS.md` records the active milestones, exact next step and test evidence.
`NEXT_STEPS.md` is the continuation handoff. The in-app progress dialog reads
`../development-progress.json`; it reports implementation status, not a different
delivery order.
