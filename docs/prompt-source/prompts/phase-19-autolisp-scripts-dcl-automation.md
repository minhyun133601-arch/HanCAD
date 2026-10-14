PHASE 19 — AutoLISP, scripts, DCL, automation
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–18 are done.

Goal: run the AutoLISP routines and scripts that Korean AutoCAD users share and depend on.

Build:
- SCRIPT (.scr) with AutoCAD's semantics (spaces and newlines as Enter, RSCRIPT, DELAY, RESUME), drag-and-drop .scr files, and launching HanCAD with a script argument.
- AutoLISP interpreter in TypeScript:
  - reader: comments including ;| |;, strings with escapes, UTF-8/CP949 file decoding;
  - types: INT, REAL, STR, SYM, LIST, ENAME, PICKSET, FILE, SUBR, USUBR, VLA-object, minimal variants and safearrays;
  - core: defun with locals after /, setq, cond, if, while, repeat, foreach, mapcar, lambda, apply, list functions (assoc, subst, cons, append, reverse, nth, last, member, vl-remove, vl-sort, vl-position, and the rest), math, strings (strcat, substr, strlen, vl-string-*), conversions (rtos, atof, atoi, itoa, distof, angtos, angtof, ascii, chr), geometry (polar, distance, angle, inters, trans);
  - input: getpoint, getcorner, getdist, getangle, getorient, getint, getreal, getstring, getkword, initget, entsel, nentsel, grread;
  - selection and entities: ssget (every mode and filter list, including -4 logic), ssname, sslength, ssadd, ssdel, ssmemb, entget, entmod, entmake, entmakex, entdel, entlast, entnext, handent, entupd, XDATA with regapp, tblsearch, tblnext, tblobjname, dictsearch, dictnext, namedobjdict, dictadd, dictremove;
  - command bridge: (command ...), (command-s ...), vl-cmdf, pause;
  - system: getvar, setvar, getenv, setenv, findfile, load, autoload, startapp, file I/O, vl-file-*, vl-directory-files, prompt, princ, print, prin1, terpri, alert, *error*, vl-catch-all-apply, exit, quit, grdraw, grvecs, redraw;
  - Visual LISP subset: vl-load-com, vlax-ename->vla-object, vla-get-* and vla-put-* for common entity properties, vlax-curve-* functions, and vlr-* reactors for common events.
- Loading: APPLOAD with the Startup Suite, acad.lsp (once per session), acaddoc.lsp (per drawing), S::STARTUP, SECURELOAD and TRUSTEDPATHS with Korean prompts. (defun c:XXX ...) creates a command that appears in AutoComplete.
- DCL: parse .dcl files and render native-looking dialogs (dialog, button, edit_box, list_box, popup_list, toggle, radio buttons, rows, columns, boxed groups, text, image, slider, spacer, the ok_cancel variants); load_dialog, new_dialog, start_dialog, done_dialog, action_tile, set_tile, get_tile, mode_tile, start_list/add_list/end_list, start_image/fill_image/vector_image/end_image, client_data_tile.
- A LISP console window for testing; the Action Recorder (ACTRECORD, ACTSTOP, ACTUSERINPUT, ACTUSERMESSAGE, ACTBASEPOINT).
- A modern TypeScript plugin API (commands, database access, events), documented in docs/PLUGIN_API.md.

Acceptance:
- [ ] A CP949-encoded .lsp with Korean prompts loads and runs with correct Korean text.
- [ ] (ssget "X" '((0 . "LINE") (8 . "벽"))) returns the right lines, and entmod changes them with working undo.
- [ ] A DCL dialog with an edit box, a list box, and OK/Cancel works through action_tile callbacks.
- [ ] I will give you 10 LISP files I use; all of them run, or each failure is listed with the missing function.
