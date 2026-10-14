PHASE 10 — Text and fonts (SHX, BigFont, TrueType, Korean)
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–9 are done.

Goal: text looks, measures, and edits exactly like AutoCAD, including Korean.

Build:
- Font engine: an SHX parser for shape 1.0, unifont 1.0, and bigfont 1.0 files (escape ranges, extended shapes); TTF/OTF/TTC parsing with cached glyph tessellation; a Korean glyph fallback chain (style font, then 맑은 고딕, then 굴림); font mapping (FONTMAP .fmp, FONTALT); support file search paths (OPTIONS > 파일) including my AutoCAD fonts folder; a missing-SHX dialog with replacement choices that are remembered.
- STYLE dialog (문자 스타일): font, font style, use BigFont, annotative, height, width factor, oblique angle, upside down, backwards, vertical; new, rename, delete, set current.
- TEXT/DTEXT: every justification (Left, Center, Right, Align, Middle, Fit, TL TC TR ML MC MR BL BC BR), style, height, rotation; in-place multi-line entry on the canvas with Korean IME composition; TEXTEDIT and DTEXTED; %%c, %%d, %%p, %%u, %%o, %%nnn; QTEXT, TEXTFILL.
- MTEXT: an in-place editor with the contextual ribbon tab 문자 편집기 (font, height, color, bold/italic/underline/overline/strikethrough, width factor, oblique, tracking, stacking via \S, columns, paragraphs with indents, tabs, alignment, and line spacing, bullets and numbering, the symbol menu, background mask, AutoCAPS, find/replace, import text). Full read/write of MTEXT format codes (\P \f \F \H \W \Q \T \A \C \c \L \l \O \o \K \k \S \p \N \~ and the rest).
- FIND (find and replace with options), SPELL (English dictionary; never flag Hangul words).
- Text and SHX shapes inside complex linetypes; SHAPE and LOAD.
- Match AutoCAD's text height semantics for SHX and TrueType and its justification math. Compare against reference DXF files and add each case to the parity checklist.

Acceptance:
- [ ] A Korean drawing that uses romans.shx + whgtxt.shx renders identical to AutoCAD once my SHX folder is set; a missing SHX opens the substitution dialog.
- [ ] Korean typed into TEXT and MTEXT composes in place, with the IME candidate window at the caret and the 한자 key working.
- [ ] MTEXT with stacked fractions, columns, and numbered lists round-trips through DXF unchanged.
- [ ] TrueType and SHX text of height 2.5 in every justification lines up with AutoCAD in overlay comparisons.
