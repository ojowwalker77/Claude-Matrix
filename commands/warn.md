---
description: Manage file and package warnings
---

# Matrix Warnings

Manage "personal grudges" - warnings for problematic files or packages.

Parse the arguments: `$ARGUMENTS`

Use the `matrix_warn` tool with the appropriate action parameter.

## Actions

**List warnings** (default, or "list"):
Use `matrix_warn` with `action: "list"` to show all warnings.
- Optional: `type: "file"` or `type: "package"` to filter
- Optional: `repoOnly: true` to show only repo-specific warnings

**Add warning** ("add <type> <target> <reason>"):
Use `matrix_warn` with `action: "add"` and:
- type: "file" or "package"
- target: file path/pattern or package name
- reason: why this is problematic
- severity: "info", "warn", or "block" (default: warn)
- repoSpecific: true if warning should only apply to current repo

**Remove warning** ("remove <target>" or "rm <target>"):
Use `matrix_warn` with `action: "remove"` and either:
- id: the warning ID to remove, or
- type + target: to remove by type and target

**Check target** ("check <target>"):
Use `matrix_warn` with `action: "check"` and:
- type: "file" or "package"
- target: file path or package name

## Examples
- `/matrix:warn` - list all warnings
- `/matrix:warn add file src/legacy/*.ts "Deprecated, do not modify"`
- `/matrix:warn add package moment "Use date-fns instead"`
- `/matrix:warn remove moment`
- `/matrix:warn check .env`
