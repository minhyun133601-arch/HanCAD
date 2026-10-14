PHASE 23 — Visualization, rendering, 3D documentation
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–22 are done.

Goal: materials, lights, rendering, and drawing views generated from 3D models.

Build:
- A materials browser and editor with a small original library, MATERIALATTACH by layer, MATERIALMAP.
- Lights: POINTLIGHT, SPOTLIGHT, DISTANTLIGHT, the sun with geographic location and Korea Standard Time (SUNPROPERTIES), viewport shadows.
- RENDER with presets, a render window, and image saving; BACKGROUND (solid, gradient, image, sun and sky); RENDERENVIRONMENT.
- Model documentation: VIEWBASE, VIEWPROJ, VIEWSECTION, VIEWDETAIL, VIEWEDIT, VIEWUPDATE, and VIEWSTD with third-angle projection (제3각법) as the default and first-angle as an option; associative updates when the model changes.
- 3DPRINT and STLOUT. Shaded and rendered viewport plotting in layouts.

Acceptance:
- [ ] A base view plus projected and section views of a solid update when the solid is edited.
- [ ] Rendering a simple scene with the sun and materials saves a PNG.
