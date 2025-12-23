import { getDb } from '../db/index.js';
import {
  matrixWarnAdd,
  matrixWarnRemove,
  matrixWarnList,
  type WarningType,
  type WarningSeverity,
  type PackageEcosystem,
} from '../tools/warn.js';
import {
  header,
  muted,
  printTable,
  printBox,
  success,
  error,
  warn as warnOutput,
  formatDate,
} from './utils/output.js';

type Subcommand = 'add' | 'remove' | 'rm' | 'list' | 'ls';

interface AddOptions {
  type: WarningType;
  target: string;
  reason: string;
  severity: WarningSeverity;
  ecosystem?: PackageEcosystem;
  repoSpecific: boolean;
}

interface RemoveOptions {
  id?: string;
  type?: WarningType;
  target?: string;
  ecosystem?: PackageEcosystem;
}

interface ListOptions {
  type?: WarningType;
  repoOnly: boolean;
}

function parseAddArgs(args: string[]): AddOptions | null {
  // matrix warn add <type> <target> --reason "..." [--severity info|warn|block] [--ecosystem npm|pip|cargo|go] [--repo]
  const type = args[0] as WarningType | undefined;
  const target = args[1];

  if (!type || !target) {
    error('Usage: matrix warn add <file|package> <target> --reason "..." [--severity info|warn|block]');
    return null;
  }

  if (type !== 'file' && type !== 'package') {
    error('Type must be "file" or "package"');
    return null;
  }

  let reason = '';
  let severity: WarningSeverity = 'warn';
  let ecosystem: PackageEcosystem | undefined;
  let repoSpecific = false;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--reason' || arg === '-r') {
      reason = args[++i] || '';
    } else if (arg.startsWith('--reason=')) {
      reason = arg.slice('--reason='.length);
    } else if (arg === '--severity' || arg === '-s') {
      severity = (args[++i] as WarningSeverity) || 'warn';
    } else if (arg.startsWith('--severity=')) {
      severity = arg.slice('--severity='.length) as WarningSeverity;
    } else if (arg === '--ecosystem' || arg === '-e') {
      ecosystem = args[++i] as PackageEcosystem;
    } else if (arg.startsWith('--ecosystem=')) {
      ecosystem = arg.slice('--ecosystem='.length) as PackageEcosystem;
    } else if (arg === '--repo' || arg === '--repo-specific') {
      repoSpecific = true;
    }
  }

  if (!reason) {
    error('Reason is required. Use --reason "..."');
    return null;
  }

  if (!['info', 'warn', 'block'].includes(severity)) {
    error('Severity must be: info, warn, or block');
    return null;
  }

  if (type === 'package' && ecosystem && !['npm', 'pip', 'cargo', 'go'].includes(ecosystem)) {
    error('Ecosystem must be: npm, pip, cargo, or go');
    return null;
  }

  return { type, target, reason, severity, ecosystem, repoSpecific };
}

function parseRemoveArgs(args: string[]): RemoveOptions | null {
  // matrix warn remove <id>
  // matrix warn remove <type> <target> [--ecosystem ...]
  const first = args[0];

  if (!first) {
    error('Usage: matrix warn remove <id> OR matrix warn remove <type> <target>');
    return null;
  }

  // Check if it's an ID (starts with warn_)
  if (first.startsWith('warn_')) {
    return { id: first };
  }

  // Otherwise it's type + target
  const type = first as WarningType;
  const target = args[1];

  if (!target) {
    error('Usage: matrix warn remove <type> <target>');
    return null;
  }

  let ecosystem: PackageEcosystem | undefined;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--ecosystem' || arg === '-e') {
      ecosystem = args[++i] as PackageEcosystem;
    } else if (arg.startsWith('--ecosystem=')) {
      ecosystem = arg.slice('--ecosystem='.length) as PackageEcosystem;
    }
  }

  return { type, target, ecosystem };
}

function parseListArgs(args: string[]): ListOptions {
  let type: WarningType | undefined;
  let repoOnly = false;

  for (const arg of args) {
    if (arg === 'file' || arg === 'package') {
      type = arg;
    } else if (arg === '--file') {
      type = 'file';
    } else if (arg === '--package') {
      type = 'package';
    } else if (arg === '--repo' || arg === '--repo-only') {
      repoOnly = true;
    }
  }

  return { type, repoOnly };
}

async function addWarning(args: string[]): Promise<void> {
  const options = parseAddArgs(args);
  if (!options) return;

  const result = await matrixWarnAdd({
    type: options.type,
    target: options.target,
    reason: options.reason,
    severity: options.severity,
    ecosystem: options.ecosystem,
    repoSpecific: options.repoSpecific,
  });

  if (result.status === 'added') {
    success(result.message);
    console.log(muted(`  ID: ${result.id}`));
  } else {
    warnOutput(result.message);
    console.log(muted(`  ID: ${result.id}`));
  }
}

async function removeWarning(args: string[]): Promise<void> {
  const options = parseRemoveArgs(args);
  if (!options) return;

  const result = await matrixWarnRemove(options);

  if (result.removed > 0) {
    success(result.message);
  } else {
    warnOutput(result.message);
  }
}

async function listWarnings(args: string[]): Promise<void> {
  const options = parseListArgs(args);

  const result = await matrixWarnList({
    type: options.type,
    repoOnly: options.repoOnly,
  });

  console.log();

  if (result.total === 0) {
    console.log(muted('  No warnings found.'));
    console.log();
    console.log(muted('  Add one with: matrix warn add <file|package> <target> --reason "..."'));
    console.log();
    return;
  }

  const severityColors: Record<WarningSeverity, (s: string) => string> = {
    info: (s: string) => `\x1b[36m${s}\x1b[0m`,    // cyan
    warn: (s: string) => `\x1b[33m${s}\x1b[0m`,    // yellow
    block: (s: string) => `\x1b[31m${s}\x1b[0m`,   // red
  };

  const formatted = result.warnings.map(w => ({
    id: w.id,
    type: w.type,
    target: w.target.slice(0, 30) + (w.target.length > 30 ? '...' : ''),
    severity: severityColors[w.severity](w.severity),
    reason: w.reason.slice(0, 35) + (w.reason.length > 35 ? '...' : ''),
    scope: w.repoId ? 'repo' : 'global',
    created: formatDate(w.createdAt),
  }));

  const title = options.type
    ? `${options.type.charAt(0).toUpperCase() + options.type.slice(1)} Warnings`
    : 'All Warnings';

  printBox(title, [], 90);
  console.log();
  printTable(formatted, [
    { key: 'id', header: 'ID', width: 13 },
    { key: 'type', header: 'Type', width: 8 },
    { key: 'target', header: 'Target', width: 30 },
    { key: 'severity', header: 'Level', width: 7 },
    { key: 'reason', header: 'Reason', width: 35 },
    { key: 'scope', header: 'Scope', width: 6 },
  ]);

  console.log();
  console.log(muted(`  Total: ${result.total} warning(s)`));
  console.log();
}

function showHelp(): void {
  console.log();
  printBox('Matrix Warn - Manage file and package warnings', [], 70);
  console.log();
  console.log('  Commands:');
  console.log();
  console.log('    matrix warn list [--file|--package] [--repo]');
  console.log(muted('      List all warnings'));
  console.log();
  console.log('    matrix warn add <file|package> <target> --reason "..." [options]');
  console.log(muted('      Add a warning for a file or package'));
  console.log();
  console.log('      Options:');
  console.log('        --severity <info|warn|block>  Warning level (default: warn)');
  console.log('        --ecosystem <npm|pip|cargo|go>  Package ecosystem');
  console.log('        --repo                        Repo-specific warning');
  console.log();
  console.log('    matrix warn remove <id>');
  console.log('    matrix warn remove <type> <target> [--ecosystem ...]');
  console.log(muted('      Remove a warning'));
  console.log();
  console.log('  Examples:');
  console.log();
  console.log(muted('    matrix warn add package lodash --reason "Use lodash-es instead"'));
  console.log(muted('    matrix warn add file "src/legacy/*" --reason "Legacy code" --severity block'));
  console.log(muted('    matrix warn add package moment --reason "Deprecated" --ecosystem npm'));
  console.log(muted('    matrix warn remove warn_abc12345'));
  console.log(muted('    matrix warn list --package'));
  console.log();
}

export async function warn(args: string[]): Promise<void> {
  const subcommand = args[0] as Subcommand | undefined;

  switch (subcommand) {
    case 'add':
      return addWarning(args.slice(1));

    case 'remove':
    case 'rm':
      return removeWarning(args.slice(1));

    case 'list':
    case 'ls':
      return listWarnings(args.slice(1));

    case undefined:
      // No subcommand = list all
      return listWarnings([]);

    default:
      if (args.includes('--help') || args.includes('-h')) {
        return showHelp();
      }
      // Unknown subcommand, try to treat as list filter
      return listWarnings(args);
  }
}
