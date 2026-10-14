# @hancad/sysvars

## Responsibility

Declarative system-variable definitions, validation, drawing/profile/session scopes and document management.

## Allowed dependencies

@hancad/db.

## Current status

Registered variables are implemented and tested. The 500+ variable parity target remains planned; unregistered names are rejected explicitly.

Validation errors expose structured code, reason, range and symbol-reference
details. A pure formatter accepts a typed message contract so command/UI boundaries
can select a language without coupling this package to UI or changing validation.
