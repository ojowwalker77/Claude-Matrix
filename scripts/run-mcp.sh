#!/bin/bash
# Matrix MCP Server Launcher
# Runs MCP server via Bun

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="${PLUGIN_DIR:-$(dirname "$SCRIPT_DIR")}"

# Check for Bun
if ! command -v bun &> /dev/null; then
  echo "Bun is required but not installed." >&2
  echo "Install: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

# Auto-install/verify dependencies (fast if already installed)
(cd "$PLUGIN_DIR" && bun install --silent) >&2

# Run MCP server
exec bun run "$PLUGIN_DIR/src/index.ts" "$@"
