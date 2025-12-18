import { bold, cyan, dim, gray } from './utils/output.js';

export function printHelp(): void {
  console.log(`
${bold('Matrix')} - Persistent memory system for Claude Code

${bold('USAGE')}
  ${cyan('matrix')} ${gray('<command>')} ${gray('[options]')}

${bold('COMMANDS')}
  ${cyan('init')}                    Initialize Matrix (auto-setup)
  ${cyan('search')} ${gray('<query>')}         Search past solutions semantically
  ${cyan('list')} ${gray('[type]')}            List solutions, failures, or repos
  ${cyan('stats')}                   Show memory statistics
  ${cyan('export')}                  Export database (JSON/CSV)
  ${cyan('version')}                 Show version
  ${cyan('help')}                    Show this help

${bold('EXAMPLES')}
  ${dim('# Complete setup (for first-time users)')}
  matrix init

  ${dim('# Search for OAuth-related solutions')}
  matrix search "OAuth implementation"

  ${dim('# List recent solutions')}
  matrix list solutions

  ${dim('# Show statistics')}
  matrix stats

  ${dim('# Export to JSON')}
  matrix export --format=json --output=backup.json

${bold('ENVIRONMENT')}
  ${cyan('MATRIX_DB')}      Custom database path (default: ~/.claude/matrix/matrix.db)
  ${cyan('MATRIX_DIR')}     Matrix installation directory (default: ~/.claude/matrix)

${bold('LEARN MORE')}
  ${dim('https://github.com/ojowwalker77/Claude-Matrix')}
`);
}
