---
name: Matrix Dreamer
description: This skill should be used when the user asks to "schedule a task", "add scheduled task", "list scheduled tasks", "run task now", "remove scheduled task", "task scheduler", "dreamer", "cron task", "automate with claude", or needs to manage scheduled Claude Code tasks.
user-invocable: true
agent: haiku
allowed-tools:
  - mcp__plugin_matrix_matrix__matrix_dreamer
---

# Matrix Dreamer - Scheduled Task Automation

Schedule and manage automated Claude Code tasks using native OS schedulers (launchd on macOS, crontab on Linux).

Parse user arguments from the skill invocation (text after the trigger phrase).

Use the `matrix_dreamer` tool with the appropriate action parameter.

## CRITICAL: One-Time vs Recurring

**BEFORE using `action: "add"`, you MUST clarify with the user:**
- "Do you want this to run ONCE or RECURRING (daily/weekly/etc)?"

Natural language like "at 1am" or "tonight at 3pm" is converted to cron expressions, which are **always recurring**. Users often expect one-time execution but get daily tasks instead.

- **One-time execution:** Use `action: "run"` for immediate execution
- **Recurring tasks:** Use `action: "add"` only after confirming recurring intent

## Actions

**List tasks** (default, or "list"):
Use `matrix_dreamer` with `action: "list"`.
- Optional: `limit` to cap results
- Optional: `tag` to filter by tag

**Add task** ("add", "schedule"):
Use `matrix_dreamer` with `action: "add"` and:
- `name`: Task name (required, max 100 chars)
- `schedule`: Cron expression or natural language (e.g., "every day at 9am")
- `command`: Claude prompt or /command to execute
- Optional: `description`, `workingDirectory`, `timeout`, `timezone`, `tags`, `skipPermissions`
- Optional: `worktree: { enabled: true }` for isolated git worktree execution
- Optional: `env` for environment variables

**Run immediately** ("run <taskId>"):
Use `matrix_dreamer` with `action: "run"` and `taskId`.

**Remove task** ("remove <taskId>", "delete <taskId>"):
Use `matrix_dreamer` with `action: "remove"` and `taskId`.

**System status** ("status"):
Use `matrix_dreamer` with `action: "status"`.

**View logs** ("logs <taskId>"):
Use `matrix_dreamer` with `action: "logs"` and `taskId`.
- Optional: `lines` (default: 50)
- Optional: `stream`: "stdout", "stderr", or "both"

**Execution history** ("history"):
Use `matrix_dreamer` with `action: "history"`.
- Optional: `limit` to cap results

## Examples

- `/matrix:dreamer` - list all scheduled tasks
- `/matrix:dreamer add "daily-review" every day at 9am "/matrix:review staged"`
- `/matrix:dreamer run task_abc123`
- `/matrix:dreamer status`
- `/matrix:dreamer logs task_abc123`
- `/matrix:dreamer remove task_abc123`
- `/matrix:dreamer history`
