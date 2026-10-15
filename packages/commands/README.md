# @hancad/commands

## Responsibility

Canonical command registry, PGP aliases and asynchronous headless command execution.

## Allowed dependencies

@hancad/db, @hancad/sysvars, @hancad/editor, @hancad/input, @hancad/geom.

## Current status

Typed command/input failures have locale-specific headless presentation. An
optional runner error formatter lets the app present errors from its registered
commands without adding UI or export-package dependencies here.

Core variable/history registry, all 216 supplied aliases, user PGP alias imports, prefix parsing, UNDEFINE/REDEFINE and the headless input runner are implemented. Future canonical commands are explicitly reported as not implemented. Advanced UNDO options, nested transparent commands, macros, graphical Editor prompts and drafting commands remain planned.
