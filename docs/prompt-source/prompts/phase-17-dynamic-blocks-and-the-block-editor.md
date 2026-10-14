PHASE 17 — Dynamic blocks and the block editor
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–16 are done.

Goal: author and use dynamic blocks as in AutoCAD, and keep dynamic blocks from real DWGs working.

Build:
- BEDIT complete: authoring palettes (Parameters, Actions, Parameter Sets, and Constraints, which stays a placeholder until Phase 18); parameters (Point, Linear, Polar, XY, Rotation, Alignment, Flip, Visibility, Lookup, Base point); actions (Move, Scale, Stretch, Polar Stretch, Array, Rotate, Flip, Lookup, Block Properties Table); chaining; value sets (increment and list); visibility states (BVSTATE, BVHIDE, BVSHOW); lookup tables; BTABLE; BTESTBLOCK; BSAVE, BSAVEAS, BCLOSE; attribute definitions inside the editor.
- Runtime: dynamic block references with custom grips, the Custom category in Properties, RESETBLOCK, and anonymous *U block representations written exactly as AutoCAD writes them.
- Real files: read the dynamic block data stored in DWG/DXF (the evaluation graph); evaluate what you can decode, and always preserve and display the rest losslessly.

Acceptance:
- [ ] A door block with a Linear parameter plus Stretch action and a Flip parameter works through grips and the Properties palette.
- [ ] Visibility states switch through the grip dropdown.
- [ ] Dynamic blocks from my real drawings display correctly and keep their current states after save and reopen.
