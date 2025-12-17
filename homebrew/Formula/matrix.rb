class Matrix < Formula
  desc "Persistent memory system for Claude Code - Learn from past solutions"
  homepage "https://github.com/ojowwalker77/Claude-Matrix"
  url "https://github.com/ojowwalker77/Claude-Matrix/archive/refs/tags/v0.3.0.tar.gz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"
  head "https://github.com/ojowwalker77/Claude-Matrix.git", branch: "main"

  depends_on "oven-sh/bun/bun"

  def install
    # Install source files to libexec
    libexec.install Dir["*"]

    # Create wrapper script in bin
    (bin/"matrix").write <<~EOS
      #!/usr/bin/env bash
      set -e

      if ! command -v bun &> /dev/null; then
          echo "Error: Bun is required but not installed."
          echo "Install with: brew install oven-sh/bun/bun"
          exit 1
      fi

      export MATRIX_DIR="#{libexec}"
      exec bun run "#{libexec}/src/cli.ts" "$@"
    EOS

    # Install shell completions
    bash_completion.install "completions/matrix.bash" => "matrix"
    zsh_completion.install "completions/matrix.zsh" => "_matrix"
    fish_completion.install "completions/matrix.fish"
  end

  def post_install
    # Run bun install in libexec
    system "bun", "install", "--cwd", libexec

    ohai "Matrix installed successfully!"
    ohai "Run 'matrix init' to complete setup"
  end

  def caveats
    <<~EOS
      Matrix has been installed!

      To complete setup, run:
        matrix init

      This will:
        - Initialize the database at ~/.claude/matrix/matrix.db
        - Register the MCP server with Claude Code
        - Set up the CLAUDE.md template

      For manual MCP registration:
        claude mcp add matrix -s user -- bun run #{libexec}/src/index.ts

      CLI Commands:
        matrix search <query>  - Search past solutions
        matrix list            - List solutions/failures/repos
        matrix stats           - Show memory statistics
        matrix export          - Export database

      Documentation: https://github.com/ojowwalker77/Claude-Matrix
    EOS
  end

  test do
    assert_match "Matrix Memory System", shell_output("#{bin}/matrix version")
  end
end
