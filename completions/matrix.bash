# Bash completion for Matrix CLI
# Add to ~/.bashrc: source ~/.claude/matrix/completions/matrix.bash

_matrix_completions() {
    local cur prev commands
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    commands="init search list stats export version help"

    case "${prev}" in
        matrix)
            COMPREPLY=($(compgen -W "${commands}" -- "${cur}"))
            return 0
            ;;
        list|ls)
            COMPREPLY=($(compgen -W "solutions failures repos --page= --limit=" -- "${cur}"))
            return 0
            ;;
        export|backup)
            COMPREPLY=($(compgen -W "--format=json --format=csv --output= --type=all --type=solutions --type=failures --type=repos" -- "${cur}"))
            return 0
            ;;
        search|find|recall)
            COMPREPLY=($(compgen -W "--limit= --min-score= --scope=all --scope=repo --scope=stack --scope=global" -- "${cur}"))
            return 0
            ;;
        init)
            COMPREPLY=($(compgen -W "--force --skip-mcp --skip-claude-md" -- "${cur}"))
            return 0
            ;;
    esac

    return 0
}

complete -F _matrix_completions matrix
