// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

export function bold(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

export function dim(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}

export function green(text: string): string {
  return `${colors.green}${text}${colors.reset}`;
}

export function yellow(text: string): string {
  return `${colors.yellow}${text}${colors.reset}`;
}

export function blue(text: string): string {
  return `${colors.blue}${text}${colors.reset}`;
}

export function cyan(text: string): string {
  return `${colors.cyan}${text}${colors.reset}`;
}

export function red(text: string): string {
  return `${colors.red}${text}${colors.reset}`;
}

export function gray(text: string): string {
  return `${colors.gray}${text}${colors.reset}`;
}

// Success/error indicators
export function success(message: string): void {
  console.log(`${green('✓')} ${message}`);
}

export function error(message: string): void {
  console.error(`${red('✗')} ${message}`);
}

export function info(message: string): void {
  console.log(`${blue('→')} ${message}`);
}

export function warn(message: string): void {
  console.log(`${yellow('!')} ${message}`);
}

// Table formatting
export function printTable(
  rows: Record<string, unknown>[],
  columns: string[],
  options: { maxWidth?: number; truncate?: boolean } = {}
): void {
  const { maxWidth = 40, truncate = true } = options;

  if (rows.length === 0) {
    console.log(dim('No results'));
    return;
  }

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const col of columns) {
    const headerLen = col.length;
    const maxDataLen = Math.max(
      ...rows.map((row) => String(row[col] ?? '').length)
    );
    widths[col] = Math.min(Math.max(headerLen, maxDataLen), maxWidth);
  }

  // Print header
  const header = columns
    .map((col) => bold(col.padEnd(widths[col])))
    .join('  ');
  console.log(header);
  console.log(
    columns.map((col) => '─'.repeat(widths[col])).join('──')
  );

  // Print rows
  for (const row of rows) {
    const line = columns
      .map((col) => {
        let val = String(row[col] ?? '');
        if (truncate && val.length > widths[col]) {
          val = val.slice(0, widths[col] - 1) + '…';
        }
        return val.padEnd(widths[col]);
      })
      .join('  ');
    console.log(line);
  }
}

// Truncate text with ellipsis
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

// Format date for display
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format score as percentage
export function formatScore(score: number): string {
  return `${(score * 100).toFixed(0)}%`;
}
