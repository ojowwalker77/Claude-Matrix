#!/bin/bash
# Matrix MCP Server Launcher
# Detects platform and runs the appropriate compiled binary

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="${PLUGIN_DIR:-$(dirname "$SCRIPT_DIR")}"

# Detect platform
PLATFORM="$(uname -s)-$(uname -m)"

case "$PLATFORM" in
  Darwin-arm64)
    BINARY="darwin-arm64/matrix-mcp"
    ;;
  Darwin-x86_64)
    BINARY="darwin-x64/matrix-mcp"
    ;;
  Linux-x86_64)
    BINARY="linux-x64/matrix-mcp"
    ;;
  Linux-aarch64)
    BINARY="linux-arm64/matrix-mcp"
    ;;
  *)
    echo "Unsupported platform: $PLATFORM" >&2
    echo "Supported: Darwin-arm64, Darwin-x86_64, Linux-x86_64, Linux-aarch64" >&2
    exit 1
    ;;
esac

BINARY_PATH="$PLUGIN_DIR/bin/$BINARY"

if [ ! -x "$BINARY_PATH" ]; then
  echo "Matrix MCP binary not found: $BINARY_PATH" >&2
  echo "Run the build script or download pre-built binaries." >&2
  exit 1
fi

exec "$BINARY_PATH" "$@"
