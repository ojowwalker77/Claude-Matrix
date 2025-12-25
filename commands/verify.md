---
description: Verify Matrix plugin installation
---

# Matrix Verify

Check the health of the Matrix plugin installation.

## Checks to Perform

1. **Database**: Verify `~/.claude/matrix/matrix.db` exists and is readable
2. **MCP Server**: Confirm Matrix tools are available (try `matrix_status`)
3. **Models**: Check if embedding models are downloaded at `~/.claude/matrix/models/`
4. **Hooks**: Verify hooks are registered and working

## Report Format

For each check, report:
- Status (pass/warn/fail)
- Details if issues found
- Suggested fixes

If everything passes, confirm Matrix is healthy and ready to use.
