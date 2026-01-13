---
name: Matrix Doctor
description: This skill should be used when the user asks to "run matrix diagnostics", "check matrix health", "fix matrix issues", "troubleshoot matrix", or mentions matrix not working. Runs comprehensive diagnostics on the Matrix plugin and automatically fixes issues.
user-invocable: true
agent: haiku
allowed-tools:
  - mcp__plugin_matrix_matrix__matrix_doctor
---

# Matrix Doctor

Run comprehensive diagnostics on the Matrix plugin and automatically fix issues when possible.

## What It Does

1. **Checks Matrix Directory**: Verifies ~/.claude/matrix/ exists and is writable
2. **Checks Database**: Tests connection, validates schema version
3. **Checks Configuration**: Validates config file, checks for missing sections
4. **Checks Hooks**: Verifies hooks are installed correctly
5. **Checks Code Index**: Confirms repository is indexed
6. **Checks Repo Detection**: Tests fingerprinting works

## Auto-Fix Capabilities

The doctor will automatically attempt to fix:
- Missing Matrix directory (creates it)
- Database connection issues (reinitializes)
- Invalid/missing configuration (resets to defaults)
- Missing code index (triggers reindex)

## Usage

Call the `matrix_doctor` tool with:
- `autoFix: true` (default) - Attempt to fix issues automatically
- `autoFix: false` - Only run diagnostics without fixing

## If Issues Cannot Be Fixed

If the doctor finds issues that cannot be automatically fixed:
1. A GitHub issue template will be generated
2. The user should be directed to open an issue at:
   https://github.com/ojowwalker77/Claude-Matrix/issues/new?template=bug_report.md
3. Include the full diagnostic output in the issue

## Expected Output

The tool returns a `DoctorResult` object containing:
- `healthy`: boolean indicating overall health
- `checks`: array of diagnostic results
- `environment`: OS, Bun version, paths
- `suggestions`: array of recommended actions
- `issueTemplate`: pre-filled GitHub issue template (if issues found)
