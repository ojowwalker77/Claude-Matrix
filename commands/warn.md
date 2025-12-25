---
description: Manage file and package warnings
---

# Matrix Warnings

Manage "personal grudges" - warnings for problematic files or packages.

Parse the arguments: `$ARGUMENTS`

## Actions

**List warnings** (default, or "list"):
Use `matrix_warn_list` to show all warnings.

**Add warning** ("add <type> <target> <reason>"):
Use `matrix_warn_add` with:
- type: "file" or "package"
- target: file path/pattern or package name
- reason: why this is problematic
- severity: "info", "warn", or "block" (default: warn)

**Remove warning** ("remove <target>" or "rm <target>"):
Use `matrix_warn_remove` to delete a warning.

**Check target** ("check <target>"):
Use `matrix_warn_check` to see if a file/package has warnings.

## Examples
- `/matrix:warn` - list all warnings
- `/matrix:warn add file src/legacy/*.ts "Deprecated, do not modify"`
- `/matrix:warn add package moment "Use date-fns instead"`
- `/matrix:warn remove moment`
