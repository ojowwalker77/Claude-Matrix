---
description: Verify Matrix plugin installation
---

# Matrix Verify

Check the health of the Matrix plugin installation.

## Checks to Perform

1. **Database**: Verify `~/.claude/matrix/matrix.db` exists and is readable
2. **MCP Server**: Confirm Matrix tools are available (try `matrix_status`)
3. **Models**: Check if embedding models are downloaded at `~/.claude/matrix/models/`
4. **Hooks**: Matrix hooks are registered via the plugin manifest (hooks/hooks.json), NOT in settings.json. To verify hooks are working, check if this message arrived through a hook (it did if you're seeing this during a session). Matrix uses 7 hooks: SessionStart, UserPromptSubmit, PreToolUse (Bash, Edit, WebFetch), PostToolUse (Bash), and Stop.

## Report Format

For each check, report:
- Status (pass/warn/fail)
- Details if issues found
- Suggested fixes

**Important**: Hooks are plugin-scoped, not settings-scoped. If hooks are responding (you received context from session-start or user-prompt-submit), they are working correctly.

If everything passes, confirm Matrix is healthy and ready to use.
