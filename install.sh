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

# Install Matrix via Homebrew (macOS only)
install_homebrew() {
    if ! check_command brew; then
        return 1
    fi

    info "Installing Matrix via Homebrew..."
    brew tap ojowwalker77/matrix
    brew install matrix
    return 0
}

# Install Matrix via git clone
install_git() {
    if ! check_command git; then
        error "Git is required but not installed. Please install git first."
    fi

    if [ -d "$MATRIX_DIR" ]; then
        warn "Matrix directory already exists at $MATRIX_DIR"
        info "Updating existing installation..."
        cd "$MATRIX_DIR"
        git pull
        bun install
    else
        info "Cloning Matrix to $MATRIX_DIR..."
        mkdir -p "$(dirname "$MATRIX_DIR")"
        git clone "$MATRIX_REPO" "$MATRIX_DIR"
        cd "$MATRIX_DIR"
        bun install
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

# Print success message
print_success() {
    echo ""
    echo -e "${GREEN}╭─────────────────────────────────────╮${RESET}"
    echo -e "${GREEN}│${RESET}  ${BOLD}Installation complete!${RESET}              ${GREEN}│${RESET}"
    echo -e "${GREEN}╰─────────────────────────────────────╯${RESET}"
    echo ""
    echo -e "  ${DIM}Verify installation:${RESET}"
    echo -e "    ${CYAN}matrix version${RESET}"
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

    # Print success message
    print_success
}

# Run main
main "$@"
