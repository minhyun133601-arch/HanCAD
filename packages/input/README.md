# @hancad/input

## Responsibility

Physical keyboard command input, Korean Dubeolsik reversal and prompt-mode routing.

## Allowed dependencies

None. Commands/editor/UI may consume this package.

## Current status

`ImeController` maps the active prompt type to an input policy. Command, keyword,
number, point, object snap and selection prompts use physical US QWERTY keys
(`KeyboardEvent.code`) on a non-editable element, convert stray Hangul jamo or
syllables back to Dubeolsik keys and accept on Space. Name prompts compose Korean
in an editable element but Space still accepts; free-text and file prompts insert
spaces. Ctrl+[ and Ctrl+ cancel like Esc. Shortcut, mouse and macro handling are
added by later Phase 03 milestones.
