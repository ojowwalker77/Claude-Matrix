#!/usr/bin/env bash
#
# Claude Matrix Installer
# https://github.com/ojowwalker77/Claude-Matrix
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ojowwalker77/Claude-Matrix/main/install.sh | bash
#
# Options (via environment variables):
#   MATRIX_SKIP_INIT=1     Skip running `matrix init` after installation
#   MATRIX_DIR=/path       Custom installation directory (default: ~/.claude/matrix)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# Configuration
MATRIX_REPO="https://github.com/ojowwalker77/Claude-Matrix.git"
MATRIX_DIR="${MATRIX_DIR:-$HOME/.claude/matrix}"
BUN_INSTALL_URL="https://bun.sh/install"

# Helper functions
info() {
    echo -e "${BLUE}→${RESET} $1"
}

success() {
    echo -e "${GREEN}✓${RESET} $1"
}

warn() {
    echo -e "${YELLOW}!${RESET} $1"
}

error() {
    echo -e "${RED}✗${RESET} $1"
    exit 1
}

header() {
    echo ""
    echo -e "${BOLD}${CYAN}╭─────────────────────────────────────╮${RESET}"
    echo -e "${BOLD}${CYAN}│${RESET}  ${BOLD}Claude Matrix Installer${RESET}           ${BOLD}${CYAN}│${RESET}"
    echo -e "${BOLD}${CYAN}╰─────────────────────────────────────╯${RESET}"
    echo ""
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)
            OS="macos"
            ;;
        Linux*)
            OS="linux"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            OS="windows"
            ;;
        *)
            error "Unsupported operating system: $(uname -s)"
            ;;
    esac
    info "Detected OS: $OS"
}

# Check for required commands
check_command() {
    command -v "$1" &> /dev/null
}

# Install Bun if not present
install_bun() {
    if check_command bun; then
        success "Bun is already installed ($(bun --version))"
        return 0
    fi

    info "Installing Bun..."

    if [ "$OS" = "macos" ] && check_command brew; then
        # Prefer Homebrew on macOS if available
        brew install oven-sh/bun/bun
    else
        # Use official installer
        curl -fsSL "$BUN_INSTALL_URL" | bash

        # Source bun into current shell
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
    fi

    if check_command bun; then
        success "Bun installed successfully ($(bun --version))"
    else
        error "Failed to install Bun. Please install it manually: https://bun.sh"
    fi
}

# Resilient bun install - handles native dependency failures gracefully
resilient_bun_install() {
    if bun install; then
        return 0
    fi

    warn "Some native dependencies failed to install"
    info "Retrying with --ignore-scripts (embeddings may use fallback)..."
    bun install --ignore-scripts || true
}

# Install Matrix via Homebrew (macOS only)
install_homebrew() {
    if ! check_command brew; then
        return 1
    fi

    info "Installing Matrix via Homebrew..."
    if ! brew tap ojowwalker77/matrix; then
        warn "Failed to tap Homebrew repository"
        return 1
    fi

    if ! brew install matrix; then
        warn "Failed to install Matrix via Homebrew"
        return 1
    fi

    # Install dependencies (Homebrew formula doesn't bundle node_modules)
    local libexec_dir="$(brew --prefix matrix)/libexec"
    if [ -d "$libexec_dir" ] && [ -f "$libexec_dir/package.json" ]; then
        info "Installing dependencies..."
        if ! (cd "$libexec_dir" && bun install --production); then
            warn "Failed to install dependencies via Homebrew"
            return 1
        fi
        success "Dependencies installed"
    else
        warn "Could not find libexec directory"
        return 1
    fi

    return 0
}

# Install Matrix via git clone
install_git() {
    if ! check_command git; then
        error "Git is required but not installed. Please install git first."
    fi

    if [ -d "$MATRIX_DIR" ]; then
        # Check if it's a valid Matrix installation
        if [ -f "$MATRIX_DIR/package.json" ] && [ -d "$MATRIX_DIR/src" ]; then
            info "Matrix directory exists at $MATRIX_DIR"
            info "Updating existing installation..."
            cd "$MATRIX_DIR"
            git pull || warn "Git pull failed, continuing with existing code"
            resilient_bun_install
        # Check for nested Claude-Matrix directory (common issue)
        elif [ -d "$MATRIX_DIR/Claude-Matrix" ] && [ -f "$MATRIX_DIR/Claude-Matrix/package.json" ]; then
            warn "Found nested installation at $MATRIX_DIR/Claude-Matrix"
            info "Fixing directory structure..."

            # Move contents up one level
            cd "$MATRIX_DIR"
            # Move all files from Claude-Matrix to parent
            shopt -s dotglob 2>/dev/null || true
            mv Claude-Matrix/* . 2>/dev/null || true
            mv Claude-Matrix/.* . 2>/dev/null || true
            rmdir Claude-Matrix 2>/dev/null || rm -rf Claude-Matrix 2>/dev/null || true
            shopt -u dotglob 2>/dev/null || true

            # Update and install
            git pull || warn "Git pull failed, continuing with existing code"
            resilient_bun_install
            success "Fixed nested installation"
        else
            # Directory exists but is not a valid Matrix installation
            warn "Directory exists but is not a valid Matrix installation"
            info "Backing up and reinstalling..."
            mv "$MATRIX_DIR" "$MATRIX_DIR.backup.$(date +%s)"

            mkdir -p "$(dirname "$MATRIX_DIR")"
            git clone "$MATRIX_REPO" "$MATRIX_DIR"
            cd "$MATRIX_DIR"
            resilient_bun_install
        fi
    else
        info "Cloning Matrix to $MATRIX_DIR..."
        mkdir -p "$(dirname "$MATRIX_DIR")"
        git clone "$MATRIX_REPO" "$MATRIX_DIR"
        cd "$MATRIX_DIR"
        resilient_bun_install
    fi

    # Create symlink in ~/.local/bin if it exists
    if [ -d "$HOME/.local/bin" ]; then
        ln -sf "$MATRIX_DIR/bin/matrix" "$HOME/.local/bin/matrix"
        success "Created symlink in ~/.local/bin/matrix"
    fi

    success "Matrix installed at $MATRIX_DIR"
}

# Run matrix init
run_init() {
    if [ "${MATRIX_SKIP_INIT:-}" = "1" ]; then
        info "Skipping init (MATRIX_SKIP_INIT=1)"
        return 0
    fi

    echo ""
    info "Running Matrix initialization..."
    echo ""

    if check_command matrix; then
        matrix init
    elif [ -x "$MATRIX_DIR/bin/matrix" ]; then
        "$MATRIX_DIR/bin/matrix" init
    else
        warn "Could not find matrix command. Run 'matrix init' manually."
    fi
}

# Verify installation
verify_installation() {
    echo ""
    info "Verifying installation..."

    local errors=0
    local warnings=0

    # Find the matrix command
    local matrix_cmd=""
    if check_command matrix; then
        matrix_cmd="matrix"
    elif [ -x "$MATRIX_DIR/bin/matrix" ]; then
        matrix_cmd="$MATRIX_DIR/bin/matrix"
    fi

    # Check 1: matrix version works
    if [ -n "$matrix_cmd" ]; then
        if $matrix_cmd version &>/dev/null; then
            success "Matrix CLI works"
        else
            error_noexit "Matrix CLI returns error"
            errors=$((errors + 1))
        fi
    else
        error_noexit "Matrix command not found"
        errors=$((errors + 1))
    fi

    # Check 2: MCP connection (if claude CLI available)
    if check_command claude; then
        local mcp_output=$(claude mcp list 2>&1)
        if echo "$mcp_output" | grep -q "matrix"; then
            if echo "$mcp_output" | grep -q "Failed to connect"; then
                warn "MCP server registered but connection failed"
                echo -e "  ${DIM}This may resolve after restarting Claude Code${RESET}"
                warnings=$((warnings + 1))
            else
                success "MCP server connected"
            fi
        else
            warn "MCP server not registered"
            echo -e "  ${DIM}Run: matrix init --force${RESET}"
            warnings=$((warnings + 1))
        fi
    else
        echo -e "  ${DIM}Skipping MCP check (Claude CLI not found)${RESET}"
    fi

    # Check 3: Run matrix verify if available
    if [ -n "$matrix_cmd" ]; then
        if $matrix_cmd verify --quiet 2>/dev/null; then
            success "All verification checks passed"
        else
            local verify_output=$($matrix_cmd verify 2>&1 || true)
            if echo "$verify_output" | grep -qi "critical\|fail"; then
                warn "Verification found issues"
                echo -e "  ${DIM}Run: matrix verify${RESET}"
                warnings=$((warnings + 1))
            fi
        fi
    fi

    echo ""

    if [ $errors -gt 0 ]; then
        return 1
    fi
    return 0
}

# Print error without exiting
error_noexit() {
    echo -e "${RED}✗${RESET} $1"
}

# Print success message
print_success() {
    echo ""
    echo -e "${GREEN}╭─────────────────────────────────────╮${RESET}"
    echo -e "${GREEN}│${RESET}  ${BOLD}Installation complete!${RESET}              ${GREEN}│${RESET}"
    echo -e "${GREEN}╰─────────────────────────────────────╯${RESET}"
    echo ""
    echo -e "  ${DIM}Verify installation:${RESET}"
    echo -e "    ${CYAN}matrix verify${RESET}"
    echo ""
    echo -e "  ${DIM}Check for updates:${RESET}"
    echo -e "    ${CYAN}matrix upgrade --check${RESET}"
    echo ""
    echo -e "  ${DIM}Get help:${RESET}"
    echo -e "    ${CYAN}matrix help${RESET}"
    echo ""
    echo -e "  ${DIM}Documentation:${RESET}"
    echo -e "    ${CYAN}https://github.com/ojowwalker77/Claude-Matrix${RESET}"
    echo ""
}

# Main installation flow
main() {
    header
    detect_os

    # Check for existing installation
    if check_command matrix; then
        warn "Matrix is already installed"
        info "Current version: $(matrix version 2>/dev/null || echo 'unknown')"
        echo ""
        read -p "Do you want to reinstall/update? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Aborted. Run 'matrix upgrade' to update."
            exit 0
        fi
    fi

    # Ensure Bun is installed
    install_bun

    # Choose installation method
    if [ "$OS" = "macos" ] && check_command brew && [ -z "${MATRIX_USE_GIT:-}" ]; then
        # Prefer Homebrew on macOS
        if ! install_homebrew; then
            info "Homebrew installation failed, falling back to git..."
            install_git
        fi
    else
        # Default to git clone for Linux and when Homebrew isn't available
        install_git
    fi

    # Run initialization
    run_init

    # Verify installation
    if ! verify_installation; then
        echo ""
        warn "Installation completed with issues."
        echo -e "  ${DIM}Run 'matrix verify' for details and fix suggestions${RESET}"
        echo ""
    fi

    # Print success message
    print_success
}

# Run main
main "$@"
