/**
 * Matrix Local Dashboard HTTP Server
 *
 * Runs alongside the MCP stdio transport on 127.0.0.1:4444 (configurable).
 * Serves the single-file dashboard HTML and a minimal REST API backed
 * directly by the shared SQLite database.
 */

import { getDb } from '../db/index.js';
import { getConfig, saveConfig } from '../config/index.js';
import { cancelJob } from '../jobs/manager.js';
import { matrixReindex } from '../tools/index-tools.js';
import { getDashboardHtml } from './dashboard.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

/**
 * Start the local HTTP dashboard server.
 * Returns null if dashboard.enabled is false in config.
 */
export function startDashboard(): ReturnType<typeof Bun.serve> | null {
  const config = getConfig();
  if (!config.dashboard?.enabled) return null;

  const host = config.dashboard.host;
  const preferredPort = config.dashboard.port;

  // Try preferred port first, then fall back to OS-assigned port
  for (const tryPort of [preferredPort, 0]) {
    try {
      const server = Bun.serve({
        port: tryPort,
        hostname: host,
        fetch: handleRequest,
        error(err: Error) {
          console.error('[Dashboard] HTTP error:', err.message);
          return new Response('Internal Server Error', { status: 500 });
        },
      });

      console.error(`[Matrix] Dashboard → http://${host}:${server.port}`);
      return server;
    } catch {
      if (tryPort !== 0) {
        console.error(`[Matrix] Port ${tryPort} in use, trying random port…`);
      }
    }
  }

  console.error('[Matrix] Dashboard failed to start — no available port');
  return null;
}

// ── Request dispatcher ──────────────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const res = await route(req.method, url.pathname, url.searchParams, req);
    // Attach CORS to every response
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Dashboard] Route error:', msg);
    return json({ error: msg }, 500);
  }
}

async function route(
  method: string,
  path: string,
  params: URLSearchParams,
  req: Request,
): Promise<Response> {
  // ── Static dashboard ─────────────────────────────────────────────────
  if (method === 'GET' && path === '/') {
    return new Response(getDashboardHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/stats') return json(getStats());

  // ── Solutions ─────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/solutions') return json(getSolutions(params));
  if (method === 'DELETE' && path.startsWith('/api/solutions/')) {
    return json(deleteRow('solutions', seg(path, 3)));
  }

  // ── Failures ──────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/failures') return json(getFailures());
  if (method === 'DELETE' && path.startsWith('/api/failures/')) {
    return json(deleteRow('failures', seg(path, 3)));
  }

  // ── Warnings ──────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/warnings') return json(getWarnings());
  if (method === 'DELETE' && path.startsWith('/api/warnings/')) {
    return json(deleteRow('warnings', seg(path, 3)));
  }

  // ── Repos / Index ─────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/repos') return json(getRepos());
  if (method === 'POST' && path.startsWith('/api/repos/') && path.endsWith('/reindex')) {
    const repoPath = decodeURIComponent(seg(path, 3));
    return json(await triggerReindex(repoPath));
  }

  // ── Background Jobs ───────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/jobs') return json(getJobs());
  if (method === 'DELETE' && path.startsWith('/api/jobs/')) {
    const jobId = seg(path, 3);
    const cancelled = cancelJob(jobId);
    return json({ cancelled, jobId });
  }

  // ── Dreamer ───────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/dreamer/tasks') return json(getDreamerTasks());
  if (method === 'DELETE' && path.startsWith('/api/dreamer/tasks/')) {
    return json(deleteRow('dreamer_tasks', seg(path, 4)));
  }
  if (method === 'GET' && path === '/api/dreamer/executions') return json(getDreamerExecutions());

  // ── Config ────────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/config') return json(getConfig());
  if (method === 'PUT' && path === '/api/config') {
    const body = await req.json() as Parameters<typeof saveConfig>[0];
    saveConfig(body);
    return json({ ok: true });
  }

  return new Response('Not Found', { status: 404 });
}

// ── Response helpers ────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Extract path segment at index (0-based after splitting by '/') */
function seg(path: string, idx: number): string {
  return path.split('/')[idx] ?? '';
}

// ── Data access functions ───────────────────────────────────────────────

function getStats() {
  const db = getDb();
  const totals = db.query(`
    SELECT
      (SELECT COUNT(*) FROM solutions) AS total_solutions,
      (SELECT COUNT(*) FROM failures)  AS total_failures,
      (SELECT COUNT(*) FROM warnings)  AS total_warnings,
      (SELECT COUNT(*) FROM repos)     AS total_repos
  `).get() as Record<string, number>;

  const byCategory = db.query(`
    SELECT category, COUNT(*) AS count FROM solutions
    WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC
  `).all();

  const byScope = db.query(`
    SELECT scope, COUNT(*) AS count FROM solutions GROUP BY scope ORDER BY count DESC
  `).all();

  // Map numeric buckets to human labels
  const rawBuckets = db.query(`
    SELECT CAST(FLOOR(score / 0.2) AS INTEGER) AS bucket, COUNT(*) AS count
    FROM solutions GROUP BY bucket ORDER BY bucket
  `).all() as Array<{ bucket: number; count: number }>;
  const bucketLabels = ['0–0.2', '0.2–0.4', '0.4–0.6', '0.6–0.8', '0.8–1.0'];
  const scoreDist = [0, 1, 2, 3, 4].map(b => ({
    label: bucketLabels[b],
    count: (rawBuckets.find(r => r.bucket === b)?.count ?? 0),
  }));

  const topTags = db.query(`
    SELECT json_each.value AS tag, COUNT(*) AS count
    FROM solutions, json_each(solutions.tags)
    GROUP BY tag ORDER BY count DESC LIMIT 12
  `).all();

  return { totals, byCategory, byScope, scoreDist, topTags };
}

function getSolutions(params: URLSearchParams) {
  const db = getDb();
  const limit = Math.min(Number(params.get('limit') ?? 300), 1000);
  const category = params.get('category');
  const scope = params.get('scope');

  const where: string[] = [];
  const args: (string | number)[] = [];
  if (category) { where.push('category = ?'); args.push(category); }
  if (scope)    { where.push('scope = ?');    args.push(scope); }

  const sql = `SELECT id, problem, solution, scope, category, complexity, score,
    uses, successes, failures, tags, created_at, updated_at FROM solutions`
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY score DESC LIMIT ?';
  args.push(limit);
  return db.query(sql).all(...args);
}

function getFailures() {
  const db = getDb();
  return db.query(`
    SELECT id, error_type, error_message, root_cause, fix_applied, occurrences, created_at
    FROM failures ORDER BY created_at DESC LIMIT 200
  `).all();
}

function getWarnings() {
  const db = getDb();
  return db.query(`
    SELECT id, type, target, ecosystem, reason, severity, repo_id, created_at
    FROM warnings ORDER BY severity DESC, created_at DESC
  `).all();
}

function getRepos() {
  const db = getDb();
  return db.query(`
    SELECT r.id, r.name, r.path, r.languages, r.frameworks, r.created_at,
           COUNT(DISTINCT rf.id)  AS indexed_files,
           COUNT(DISTINCT s.id)   AS symbol_count
    FROM repos r
    LEFT JOIN repo_files rf ON rf.repo_id = r.id
    LEFT JOIN symbols    s  ON s.repo_id  = r.id
    GROUP BY r.id ORDER BY r.created_at DESC
  `).all();
}

async function triggerReindex(repoPath: string) {
  const result = await matrixReindex({ repoPath, full: false });
  return result;
}

function getJobs() {
  const db = getDb();
  return db.query(`
    SELECT id, tool_name, status, progress_percent, progress_message,
           created_at, started_at, completed_at, error
    FROM background_jobs ORDER BY created_at DESC LIMIT 50
  `).all();
}

function getDreamerTasks() {
  const db = getDb();
  return db.query(`
    SELECT id, name, description, enabled, cron_expression,
           timezone, command, working_directory, timeout, tags, created_at
    FROM dreamer_tasks ORDER BY created_at DESC
  `).all();
}

function getDreamerExecutions() {
  const db = getDb();
  return db.query(`
    SELECT id, task_id, started_at, completed_at, status,
           duration, exit_code, error, task_name
    FROM dreamer_executions ORDER BY started_at DESC LIMIT 100
  `).all();
}

/** Generic single-row delete — table name is validated by the caller via routing. */
function deleteRow(table: 'solutions' | 'failures' | 'warnings' | 'dreamer_tasks', id: string) {
  if (!id) return { deleted: false, error: 'Missing id' };
  const db = getDb();
  // Table names come from hard-coded string literals above — safe from injection
  const result = db.query(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return { deleted: result.changes > 0, id };
}
