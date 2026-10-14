PHASE 25 — Packaging and release
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–24 are done.

Goal: a clean Windows installer and a first-run setup that brings over my AutoCAD habits.

Do:
- An installer through the Tauri bundler (MSI or NSIS) with a Korean UI, per-user install, original icons, a Start menu entry, and an uninstaller that can keep user settings.
- File associations for .dxf; for .dwg only if I agree (AutoCAD may already be installed), off by default.
- A first-run wizard in Korean: import acad.pgp and .cuix, set the SHX font folder, the ODA File Converter path, right-click behavior, background color, and workspace.
- Settings migration between versions, an optional update check (off by default), and a portable zip build.
- docs/USER_GUIDE_KO.md: a Korean user guide plus a command reference generated from the command registry; F1 help uses the same content.
- A NOTICE file with third-party licenses; GPL components (LibreDWG) stay isolated as designed.
- A final test on a fresh Windows user account, offline.

Acceptance:
- [ ] Installing on a clean account and running the wizard gives a working HanCAD with my aliases and fonts.
- [ ] Uninstalling leaves nothing behind except the settings I chose to keep.
