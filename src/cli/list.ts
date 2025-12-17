import { getDb } from '../db/index.js';
import { bold, cyan, dim, printTable, error, formatDate, formatScore } from './utils/output.js';

type ListType = 'solutions' | 'failures' | 'repos';

interface ListOptions {
  type: ListType;
  page: number;
  limit: number;
}

function parseArgs(args: string[]): ListOptions {
  const type = (args[0] as ListType) || 'solutions';
  const validTypes: ListType[] = ['solutions', 'failures', 'repos'];

  if (!validTypes.includes(type)) {
    error(`Invalid type: ${type}. Use: solutions, failures, or repos`);
    process.exit(1);
  }

  let page = 1;
  let limit = 20;

  for (const arg of args) {
    if (arg.startsWith('--page=')) {
      page = parseInt(arg.split('=')[1], 10) || 1;
    } else if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10) || 20;
    }
  }

  return { type, page, limit };
}

export function list(args: string[]): void {
  const { type, page, limit } = parseArgs(args);
  const offset = (page - 1) * limit;
  const db = getDb();

  console.log(`\n${bold(`Listing ${type}`)} ${dim(`(page ${page})`)}\n`);

  switch (type) {
    case 'solutions': {
      const countResult = db.query('SELECT COUNT(*) as total FROM solutions').get() as { total: number };
      const total = countResult.total;
      const totalPages = Math.ceil(total / limit);

      const rows = db.query(`
        SELECT id, problem, scope, score, uses, created_at
        FROM solutions
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as Array<{
        id: string;
        problem: string;
        scope: string;
        score: number;
        uses: number;
        created_at: string;
      }>;

      const formatted = rows.map(row => ({
        id: row.id,
        problem: row.problem.slice(0, 50) + (row.problem.length > 50 ? '...' : ''),
        scope: row.scope,
        score: formatScore(row.score),
        uses: row.uses.toString(),
        created: formatDate(row.created_at),
      }));

      printTable(formatted, ['id', 'problem', 'scope', 'score', 'uses', 'created']);
      console.log(`\n${dim(`Page ${page}/${totalPages} (${total} total)`)}`);
      break;
    }

    case 'failures': {
      const countResult = db.query('SELECT COUNT(*) as total FROM failures').get() as { total: number };
      const total = countResult.total;
      const totalPages = Math.ceil(total / limit);

      const rows = db.query(`
        SELECT id, error_type, error_message, occurrences, root_cause, created_at
        FROM failures
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as Array<{
        id: string;
        error_type: string;
        error_message: string;
        occurrences: number;
        root_cause: string;
        created_at: string;
      }>;

      const formatted = rows.map(row => ({
        id: row.id,
        type: row.error_type,
        message: row.error_message.slice(0, 40) + (row.error_message.length > 40 ? '...' : ''),
        occurrences: row.occurrences.toString(),
        created: formatDate(row.created_at),
      }));

      printTable(formatted, ['id', 'type', 'message', 'occurrences', 'created']);
      console.log(`\n${dim(`Page ${page}/${totalPages} (${total} total)`)}`);
      break;
    }

    case 'repos': {
      const countResult = db.query('SELECT COUNT(*) as total FROM repos').get() as { total: number };
      const total = countResult.total;
      const totalPages = Math.ceil(total / limit);

      const rows = db.query(`
        SELECT id, name, path, languages, frameworks, patterns, updated_at
        FROM repos
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as Array<{
        id: string;
        name: string;
        path: string;
        languages: string;
        frameworks: string;
        patterns: string;
        updated_at: string;
      }>;

      const formatted = rows.map(row => ({
        id: row.id,
        name: row.name,
        languages: JSON.parse(row.languages || '[]').join(', '),
        frameworks: JSON.parse(row.frameworks || '[]').slice(0, 3).join(', '),
        updated: formatDate(row.updated_at),
      }));

      printTable(formatted, ['id', 'name', 'languages', 'frameworks', 'updated']);
      console.log(`\n${dim(`Page ${page}/${totalPages} (${total} total)`)}`);
      break;
    }
  }

  // Navigation hint
  if (page > 1 || offset + limit < 1000) {
    console.log(dim(`\nUse --page=N to navigate`));
  }

  console.log('');
}
