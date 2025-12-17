#compdef matrix
# Zsh completion for Matrix CLI
# Add to ~/.zshrc: fpath=(~/.claude/matrix/completions $fpath) && compinit

_matrix() {
    local -a commands
    commands=(
        'init:Initialize Matrix (auto-setup)'
        'search:Search past solutions semantically'
        'list:List solutions, failures, or repos'
        'stats:Show memory statistics'
        'export:Export database (JSON/CSV)'
        'version:Show version'
        'help:Show help'
    )

    local -a list_types
    list_types=(
        'solutions:List stored solutions'
        'failures:List recorded failures'
        'repos:List fingerprinted repositories'
    )

    local -a export_formats
    export_formats=(
        'json:Export as JSON (default)'
        'csv:Export as CSV'
    )

    local -a scopes
    scopes=(
        'all:Search all scopes'
        'repo:Search current repo only'
        'stack:Search similar tech stacks'
        'global:Search global solutions'
    )

    _arguments -C \
        '1: :->command' \
        '*: :->args'

    case $state in
        command)
            _describe -t commands 'matrix command' commands
            ;;
        args)
            case $words[2] in
                list|ls)
                    _arguments \
                        '1: :->list_type' \
                        '--page=[Page number]:page:' \
                        '--limit=[Results per page]:limit:'
                    case $state in
                        list_type)
                            _describe -t list_types 'type' list_types
                            ;;
                    esac
                    ;;
                search|find|recall)
                    _arguments \
                        '*:query:' \
                        '--limit=[Max results]:limit:' \
                        '--min-score=[Minimum similarity score]:score:' \
                        '--scope=[Filter by scope]:scope:(all repo stack global)'
                    ;;
                export|backup)
                    _arguments \
                        '--format=[Output format]:format:(json csv)' \
                        '--output=[Output file]:file:_files' \
                        '--type=[Data to export]:type:(all solutions failures repos)'
                    ;;
                init)
                    _arguments \
                        '--force[Continue despite errors]' \
                        '--skip-mcp[Skip MCP registration]' \
                        '--skip-claude-md[Skip CLAUDE.md setup]'
                    ;;
            esac
            ;;
    esac
}

_matrix "$@"
