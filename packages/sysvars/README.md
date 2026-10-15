# @hancad/sysvars

## Responsibility

Declarative system-variable definitions, validation, drawing/profile/session scopes and document management.

## Allowed dependencies

@hancad/db.

## Current status

The sourced catalog registers 860 distinct variables, including 798 fixed/metric
defaults and 62 explicit environment/document-dependent initial values. All 214
expanded DXF header names have a separate group-code schema; header-only names are
not invented as SETVAR command identities. `pnpm docs:sysvars` regenerates the
source-linked reference, and `pnpm docs:sysvars:check` verifies it offline.

The documented AREA/CENTER initial settings resolve to HPDRAWMODE=0 and
HPPATHALIGNMENT=1. The use-current initial settings for HPLAYER, HPTRANSPARENCY,
MLEADERLAYER and XREFLAYER use the source-defined `"."` sentinel. MEASUREINIT=1
follows HanCAD's metric startup policy; Autodesk documents a region-dependent
initial value rather than a universal fixed value.

Registration provides validation and scoped storage. Features controlled by these
variables still belong to their original later phases. Numeric ranges marked
pending and environment-dependent initial values remain explicit parity gaps;
unresolved reads fail instead of returning guessed zeroes or paths.

`HANDSEED` and `UNDOCTL` read the live database. Validated host providers supply
read-only document values. `setRuntimeSessionValue` updates read-only session
state for command/OS integrations while SETVAR remains forbidden for those names;
it cannot override drawing values or the database-managed UNDOCTL. Undo to an
unresolved initial value publishes an undefined change value without turning it
into an observer exception. Transparent/script command bit coverage is separate
from registration.

Validation errors expose structured code, reason, range and symbol-reference
details. A pure formatter accepts a typed message contract so command/UI boundaries
can select a language without coupling this package to UI or changing validation.
