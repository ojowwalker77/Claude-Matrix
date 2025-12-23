import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { getDb } from '../db/index.js';
import { getConfig } from '../config/index.js';
import { bold, dim, success, error, info, warn } from './utils/output.js';

interface ExportOptions {
  format: 'json' | 'csv';
  output: string | null;
  type: 'all' | 'solutions' | 'failures' | 'repos';
}

function generateFilename(type: string, format: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `matrix-export-${type}-${timestamp}.${format}`;
}

function parseArgs(args: string[]): ExportOptions {
  const config = getConfig();
  let format: 'json' | 'csv' = config.export.defaultFormat;
  let output: string | null = null;
  let type: 'all' | 'solutions' | 'failures' | 'repos' = 'all';

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      const f = arg.split('=')[1] ?? '';
      if (f === 'json' || f === 'csv') {
        format = f;
      }
    } else if (arg.startsWith('--output=') || arg.startsWith('-o=')) {
      output = arg.split('=')[1] ?? null;
    } else if (arg.startsWith('--type=')) {
      const t = arg.split('=')[1] ?? '';
      if (['all', 'solutions', 'failures', 'repos'].includes(t)) {
        type = t as typeof type;
      }
    }
  }

  return { format, output, type };
}

function escapeCSV(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const lines = rows.map(row =>
    columns.map(col => escapeCSV(row[col])).join(',')
  );
  return [header, ...lines].join('\n');
}

export async function exportDb(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const db = getDb();

  info(`Exporting ${options.type} as ${options.format}...`);

  // Fetch data (excluding embeddings which are binary)
  const data: Record<string, unknown[]> = {};

  if (options.type === 'all' || options.type === 'solutions') {
    data.solutions = db.query(`
      SELECT id, repo_id, problem, solution, scope, tags, context, score, uses, successes, partial_successes, failures, created_at, updated_at, last_used_at
      FROM solutions
    `).all();
  }

  if (options.type === 'all' || options.type === 'failures') {
    data.failures = db.query(`
      SELECT id, repo_id, error_type, error_message, error_signature, stack_trace, files_involved, root_cause, fix_applied, prevention, occurrences, created_at, resolved_at
      FROM failures
    `).all();
  }

  if (options.type === 'all' || options.type === 'repos') {
    data.repos = db.query(`
      SELECT id, name, path, languages, frameworks, dependencies, patterns, created_at, updated_at
      FROM repos
    `).all();
  }

  let content: string;

  if (options.format === 'json') {
    const exportData = {
      ...data,
      exportedAt: new Date().toISOString(),
      version: '0.3.0',
    };
    content = JSON.stringify(exportData, null, 2);
  } else {
    // CSV format - only works for single type
    if (options.type === 'all') {
      error('CSV format requires --type=solutions|failures|repos (not all)');
      process.exit(1);
    }

    const rows = data[options.type] as Record<string, unknown>[];
    if (!rows || rows.length === 0) {
      console.log(dim('No data to export'));
      return;
    }

    const firstRow = rows[0];
    if (!firstRow) {
      console.log(dim('No data to export'));
      return;
    }

    const columns = Object.keys(firstRow);
    content = toCSV(rows, columns);
  }

  // Determine output path
  const config = getConfig();
  let outputPath: string;

  if (options.output) {
    outputPath = options.output;
    // Verify parent directory exists for custom paths
    const parentDir = dirname(outputPath);
    if (parentDir !== '.' && !existsSync(parentDir)) {
      error(`Directory does not exist: ${parentDir}`);
      process.exit(1);
    }
  } else {
    // Use configured default directory
    const dir = config.export.defaultDirectory;
    const filename = generateFilename(options.type, options.format);
    outputPath = join(dir, filename);

    // Verify directory exists
    if (!existsSync(dir)) {
      warn(`Directory does not exist: ${dir}`);
      error('Configure export directory: matrix config set export.defaultDirectory /path/to/dir');
      process.exit(1);
    }
  }

  // Write to file
  await Bun.write(outputPath, content);
  success(`Exported to ${bold(outputPath)}`);

  // Show stats
  const stats: string[] = [];
  if (data.solutions) stats.push(`${data.solutions.length} solutions`);
  if (data.failures) stats.push(`${data.failures.length} failures`);
  if (data.repos) stats.push(`${data.repos.length} repos`);
  console.log(dim(stats.join(', ')));
}
