import { bold, cyan, muted, printBox } from './utils/output.js';

export function printHelp(): void {
  console.log();
  printBox('Matrix', ['Persistent memory system for Claude Code'], 50);

  console.log(`
${bold('USAGE')}
  ${cyan('matrix')} ${muted('<command>')} ${muted('[options]')}

${bold('COMMANDS')}
  ${cyan('init')}                    Initialize Matrix (auto-setup)
  ${cyan('search')} ${muted('<query>')}         Search past solutions semantically
  ${cyan('list')} ${muted('[type]')}            List solutions, failures, or repos
  ${cyan('merge')}                   Find and merge duplicate solutions
  ${cyan('config')}                  View and edit configuration
  ${cyan('stats')}                   Show memory statistics
  ${cyan('export')}                  Export database (JSON/CSV)
  ${cyan('version')}                 Show version
  ${cyan('help')}                    Show this help

${bold('SEARCH OPTIONS')}
  ${muted('--limit=N')}              Max results (default: 5)
  ${muted('--min-score=N')}          Min similarity 0-1 (default: 0.3)
  ${muted('--scope=SCOPE')}          Filter: all, repo, stack, global

${bold('MERGE OPTIONS')}
  ${muted('--threshold=N')}          Similarity threshold (default: 0.8)
  ${muted('--type=TYPE')}            solutions or failures
  ${muted('--dry-run')}              Show pairs without prompts

${bold('EXPORT OPTIONS')}
  ${muted('--format=FORMAT')}        json or csv (default: json)
  ${muted('--type=TYPE')}            all, solutions, failures, repos
  ${muted('--output=PATH')}          Custom output path

${bold('CONFIG SUBCOMMANDS')}
  ${muted('list')}                   Show all settings
  ${muted('get <key>')}              Get a specific value
  ${muted('set <key> <val>')}        Set a specific value
  ${muted('reset')}                  Reset to defaults

${bold('EXAMPLES')}
  ${muted('# Complete setup (for first-time users)')}
  matrix init

  ${muted('# Search for OAuth-related solutions')}
  matrix search "OAuth implementation"

  ${muted('# List recent solutions')}
  matrix list solutions

  ${muted('# Find duplicate solutions')}
  matrix merge --dry-run

  ${muted('# View/edit configuration')}
  matrix config
  matrix config set search.defaultLimit 10

  ${muted('# Export to Downloads folder (default)')}
  matrix export

  ${muted('# Export to custom path')}
  matrix export --output=/path/to/backup.json

  ${muted('# Configure export directory')}
  matrix config set export.defaultDirectory ~/Documents

${bold('ENVIRONMENT')}
  ${cyan('MATRIX_DB')}      Custom database path
  ${cyan('MATRIX_DIR')}     Matrix installation directory

${bold('LEARN MORE')}
  ${muted('https://github.com/ojowwalker77/Claude-Matrix')}
`);
}
