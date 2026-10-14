PHASE 3 — Command system, command line, shortcuts, Korean IME
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–2 are done.

Goal: typing, shortcuts, and mouse buttons behave exactly like AutoCAD, and Korean IME mode never breaks command input.

Build:
- Command registry entries: canonical name, global name, Korean display name, flags (transparent, modal, pickfirst, no-undo), Korean help text.
- Command line exactly like AutoCAD: a floating translucent bar with fading recent prompt lines, dockable; F2 expanded history; Ctrl+9 toggle; AutoComplete with INPUTSEARCHOPTIONS (auto-append, AutoCorrect, search system variables, mid-string search, delay); a suggestion list; clickable keywords; Up/Down history; a right-click menu with recent input, copy history, and options; 명령: prefix lines.
- Input parsing: commands, aliases, the _ . - ' prefixes, sysvar names, transparent commands inside prompts ('ZOOM, 'PAN, 'CAL, 'DIST, 'SETVAR, 'OSNAP) with >> prompts; Enter/Space accept; at an empty prompt Enter/Space repeats the last command; Space inserts a space only in prompts that allow spaces; Esc prints *취소*.
- PGP aliases: built-in default from docs/SHORTCUTS.md; import and merge my acad.pgp (same syntax, mine wins); ALIASEDIT dialog; REINIT reloads.
- Keyboard: every binding in docs/SHORTCUTS.md, resolved in this order: text editor, dialog, command line, global. Temporary override keys with key-down and key-up macros (TEMPOVERRIDES). Bindings for commands not built yet print the Korean not-implemented message.
- Mouse: right-click customization (SHORTCUTMENU bits, time-sensitive right-click with SHORTCUTMENUDURATION) and Korean shortcut menus (default, edit, and command modes).
- Macro language for menus and buttons: ^C^C, ;, \ pause, *^C^C repeat, $M= DIESEL. A DIESEL evaluator for macros and MODEMACRO.
- ImeController per AGENTS.md section 3: decides latin mode vs text mode from the active prompt type. The Dubeolsik reverse map covers compound vowels (ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ ㅢ), compound finals (ㄳ ㄵ ㄶ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅄ), and shifted jamo (ㅃ ㅉ ㄸ ㄲ ㅆ ㅒ ㅖ). Unit-test at least 60 cases.
- Status bar: every toggle with Korean labels and AutoCAD-like icons; left click toggles; right click opens its settings menu; coordinate display (COORDS modes); the customization menu to show or hide items.
- F1 opens a Korean help panel for the active command, generated from registry metadata.

Acceptance:
- [ ] With the Windows IME in 한글 mode, pressing Z then Enter starts ZOOM (that key produces ㅋ); typed ㅣ, ㅊ, or 채 resolve to L, C, or CO.
- [ ] At a free-text prompt, Korean composes normally and the composition shows at the caret.
- [ ] Typing OSM shows OSMODE in AutoComplete; typing a sysvar name lets me set it.
- [ ] My own acad.pgp imports and its aliases work right after REINIT.
- [ ] F3, F7–F12, and Ctrl+B/E/F/G/L/U/W flip the right sysvars and status-bar buttons.
- [ ] 'Z during another command runs transparently with >> prompts, then returns to the original prompt.
- [ ] Right-click as Enter works when configured; Shift+right click opens the (placeholder) object snap menu.
