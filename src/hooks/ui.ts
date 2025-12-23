/**
 * Matrix Hooks - UI Components
 *
 * Shared terminal UI components for consistent hook output.
 * Attempts TTY output for visibility, falls back to stderr.
 *
 * Note: Claude Code hook output visibility is limited.
 * Workaround: Enable verbose mode with Ctrl+O
 * Related issues:
 *   - https://github.com/anthropics/claude-code/issues/4084
 *   - https://github.com/anthropics/claude-code/issues/10964
 */

// ANSI colors
export const CYAN = '\x1b[36m';
export const DIM = '\x1b[2m';
export const RESET = '\x1b[0m';
export const RED = '\x1b[31m';
export const GREEN = '\x1b[32m';
export const YELLOW = '\x1b[33m';
export const BOLD = '\x1b[1m';

/**
 * Render a styled box with title
 */
export function renderBox(title: string, lines: string[], width = 44): string {
  const titleLen = title.length + 2; // space on each side
  const dashesAfter = Math.max(0, width - 3 - titleLen);

  const top = `${DIM}╭─${RESET}${CYAN} ${title} ${RESET}${DIM}${'─'.repeat(dashesAfter)}╮${RESET}`;
  const bottom = `${DIM}╰${'─'.repeat(width)}╯${RESET}`;

  const content = lines.map(line => {
    // Calculate visible length (without ANSI codes)
    const visibleLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = Math.max(0, width - 2 - visibleLen);
    return `${DIM}│${RESET} ${line}${' '.repeat(padding)}${DIM}│${RESET}`;
  });

  return [top, ...content, bottom].join('\n');
}

/**
 * Output to user's terminal.
 * Attempts TTY, falls back to stderr.
 */
export function printToUser(message: string): void {
  try {
    // Try writing directly to TTY
    const tty = Bun.file('/dev/tty');
    const writer = tty.writer();
    writer.write(message + '\n');
    writer.flush();
  } catch {
    // Fallback to stderr
    console.error(message);
  }
}

/**
 * Format complexity with color
 */
export function formatComplexity(score: number): string {
  const color = score >= 7 ? YELLOW : score >= 5 ? CYAN : GREEN;
  return `${color}${score}/10${RESET}`;
}

/**
 * Format a count with label
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  const label = count === 1 ? singular : (plural || singular + 's');
  return `${count} ${label}`;
}

/**
 * Render Matrix Memory box (for UserPromptSubmit)
 */
export function renderMemoryBox(
  complexity: number,
  solutionCount: number,
  errorCount: number,
  skipped = false,
  threshold = 5
): string {
  const complexityLine = `Complexity: ${formatComplexity(complexity)}`;

  if (skipped) {
    return renderBox('Matrix Memory', [
      complexityLine,
      `${DIM}Below threshold (${threshold}) - skipped${RESET}`,
    ]);
  }

  let resultLine: string;
  if (solutionCount === 0 && errorCount === 0) {
    resultLine = `${DIM}No relevant memories found${RESET}`;
  } else {
    const parts: string[] = [];
    if (solutionCount > 0) {
      parts.push(`${GREEN}${formatCount(solutionCount, 'solution')}${RESET}`);
    }
    if (errorCount > 0) {
      parts.push(`${YELLOW}${formatCount(errorCount, 'error')}${RESET}`);
    }
    resultLine = `Found: ${parts.join(' • ')}`;
  }

  return renderBox('Matrix Memory', [complexityLine, resultLine]);
}

/**
 * Render Package Auditor box (for PreToolUse:Bash)
 */
export function renderAuditorBox(
  packages: string[],
  criticalCount: number,
  warnCount: number,
  infoCount: number
): string {
  const pkgLine = packages.length <= 2
    ? `Packages: ${packages.join(', ')}`
    : `Packages: ${packages.length} total`;

  const parts: string[] = [];
  if (criticalCount > 0) parts.push(`${RED}${criticalCount} critical${RESET}`);
  if (warnCount > 0) parts.push(`${YELLOW}${warnCount} warnings${RESET}`);
  if (infoCount > 0) parts.push(`${DIM}${infoCount} info${RESET}`);

  const statusLine = parts.length > 0
    ? `Issues: ${parts.join(' • ')}`
    : `${GREEN}No issues found${RESET}`;

  return renderBox('Matrix Auditor', [pkgLine, statusLine]);
}

/**
 * Render File Warning box (for PreToolUse:Edit)
 */
export function renderFileWarningBox(
  filePath: string,
  warningCount: number,
  severity: 'info' | 'warn' | 'block'
): string {
  const fileName = filePath.split('/').pop() || filePath;
  const fileLine = `File: ${fileName.slice(0, 35)}`;

  const severityColor = severity === 'block' ? RED : severity === 'warn' ? YELLOW : DIM;
  const severityLabel = severity === 'block' ? 'BLOCKED' : severity === 'warn' ? 'WARNING' : 'INFO';
  const statusLine = `${severityColor}${severityLabel}${RESET} • ${warningCount} warning${warningCount !== 1 ? 's' : ''}`;

  return renderBox('Matrix Warning', [fileLine, statusLine]);
}

/**
 * Render Dependency Log box (for PostToolUse:Bash)
 */
export function renderDependencyBox(packages: string[], ecosystem: string): string {
  const pkgLine = packages.length <= 2
    ? `Logged: ${packages.join(', ')}`
    : `Logged: ${packages.length} packages`;

  const ecoLine = `${DIM}Ecosystem: ${ecosystem}${RESET}`;

  return renderBox('Matrix Logger', [pkgLine, ecoLine]);
}

/**
 * Render Session Analysis box (for Stop)
 */
export function renderSessionBox(
  complexity: number,
  messageCount: number,
  toolUseCount: number
): string {
  const complexityLine = `Complexity: ${formatComplexity(complexity)}`;
  const statsLine = `${messageCount} messages • ${toolUseCount} tool uses`;

  return renderBox('Matrix Session', [complexityLine, statsLine]);
}

/**
 * Render Error box
 */
export function renderErrorBox(hookName: string, error: string): string {
  return renderBox(`Matrix ${hookName}`, [
    `${RED}Error${RESET}`,
    `${DIM}${error.slice(0, 38)}${RESET}`,
  ]);
}
