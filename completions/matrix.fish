# Fish completion for Matrix CLI
# Add to ~/.config/fish/completions/matrix.fish

# Disable file completion
complete -c matrix -f

# Commands
complete -c matrix -n "__fish_use_subcommand" -a "init" -d "Initialize Matrix (auto-setup)"
complete -c matrix -n "__fish_use_subcommand" -a "search" -d "Search past solutions semantically"
complete -c matrix -n "__fish_use_subcommand" -a "list" -d "List solutions, failures, or repos"
complete -c matrix -n "__fish_use_subcommand" -a "stats" -d "Show memory statistics"
complete -c matrix -n "__fish_use_subcommand" -a "export" -d "Export database (JSON/CSV)"
complete -c matrix -n "__fish_use_subcommand" -a "version" -d "Show version"
complete -c matrix -n "__fish_use_subcommand" -a "help" -d "Show help"

# list subcommand
complete -c matrix -n "__fish_seen_subcommand_from list ls" -a "solutions" -d "List stored solutions"
complete -c matrix -n "__fish_seen_subcommand_from list ls" -a "failures" -d "List recorded failures"
complete -c matrix -n "__fish_seen_subcommand_from list ls" -a "repos" -d "List fingerprinted repos"
complete -c matrix -n "__fish_seen_subcommand_from list ls" -l "page" -d "Page number"
complete -c matrix -n "__fish_seen_subcommand_from list ls" -l "limit" -d "Results per page"

# search subcommand
complete -c matrix -n "__fish_seen_subcommand_from search find recall" -l "limit" -d "Max results"
complete -c matrix -n "__fish_seen_subcommand_from search find recall" -l "min-score" -d "Minimum similarity score"
complete -c matrix -n "__fish_seen_subcommand_from search find recall" -l "scope" -a "all repo stack global" -d "Filter by scope"

# export subcommand
complete -c matrix -n "__fish_seen_subcommand_from export backup" -l "format" -a "json csv" -d "Output format"
complete -c matrix -n "__fish_seen_subcommand_from export backup" -l "output" -d "Output file"
complete -c matrix -n "__fish_seen_subcommand_from export backup" -l "type" -a "all solutions failures repos" -d "Data to export"

# init subcommand
complete -c matrix -n "__fish_seen_subcommand_from init" -l "force" -d "Continue despite errors"
complete -c matrix -n "__fish_seen_subcommand_from init" -l "skip-mcp" -d "Skip MCP registration"
complete -c matrix -n "__fish_seen_subcommand_from init" -l "skip-claude-md" -d "Skip CLAUDE.md setup"
