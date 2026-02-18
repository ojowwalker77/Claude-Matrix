import { getDb } from '../db/client.js';
import { fingerprintRepo, getOrCreateRepo } from '../repo/index.js';
import { randomUUID } from 'crypto';

// Types
export type WarningSeverity = 'info' | 'warn' | 'block';
export type WarningType = 'file' | 'package';
export type PackageEcosystem = 'npm' | 'pip' | 'cargo' | 'go';

export interface Warning {
  id: string;
  type: WarningType;
  target: string;
  ecosystem: PackageEcosystem | null;
  reason: string;
  severity: WarningSeverity;
  repoId: string | null;
  createdAt: string;
}

// Input/Output types (exported for use in hooks)
interface WarnCheckInput {
  type: WarningType;
  target: string;
  ecosystem?: PackageEcosystem;
}

export interface WarnCheckResult {
  hasWarning: boolean;
  warnings: Array<{
    id: string;
    reason: string;
    severity: WarningSeverity;
    repoSpecific: boolean;
    createdAt: string;
  }>;
}

interface WarnAddInput {
  type: WarningType;
  target: string;
  reason: string;
  severity?: WarningSeverity;
  ecosystem?: PackageEcosystem;
  repoSpecific?: boolean;
}

export interface WarnAddResult {
  id: string;
  status: 'added' | 'updated';
  message: string;
}

interface WarnRemoveInput {
  id?: string;
  type?: WarningType;
  target?: string;
  ecosystem?: PackageEcosystem;
}

export interface WarnRemoveResult {
  removed: number;
  message: string;
}

interface WarnListInput {
  type?: WarningType;
  repoOnly?: boolean;
}

export interface WarnListResult {
  warnings: Warning[];
  total: number;
}

/**
 * Check if a file or package has warnings (internal helper)
 */
async function matrixWarnCheck(input: WarnCheckInput): Promise<WarnCheckResult> {
  const db = getDb();

  // Get current repo for context
  const detected = fingerprintRepo();
  const repoId = await getOrCreateRepo(detected);

  // Query warnings matching the target
  // For files: support glob-like patterns using LIKE
  // For packages: exact match with optional ecosystem
  let query: string;
  let params: (string | null)[];

  if (input.type === 'file') {
    // File matching: check if target matches pattern or exact match
    // Pattern stored as "src/legacy/*" should match "src/legacy/old.ts"
    query = `
      SELECT id, reason, severity, repo_id, created_at
      FROM warnings
      WHERE type = 'file'
        AND (repo_id = ? OR repo_id IS NULL)
        AND (
          ? LIKE REPLACE(REPLACE(target, '*', '%'), '?', '_')
          OR target = ?
        )
      ORDER BY
        CASE WHEN repo_id IS NOT NULL THEN 0 ELSE 1 END,
        severity DESC
    `;
    params = [repoId, input.target, input.target];
  } else {
    // Package matching: exact name with optional ecosystem
    query = `
      SELECT id, reason, severity, repo_id, created_at
      FROM warnings
      WHERE type = 'package'
        AND target = ?
        AND (ecosystem = ? OR ecosystem IS NULL)
        AND (repo_id = ? OR repo_id IS NULL)
      ORDER BY
        CASE WHEN repo_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN ecosystem IS NOT NULL THEN 0 ELSE 1 END,
        severity DESC
    `;
    params = [input.target, input.ecosystem || null, repoId];
  }

  const rows = db.query(query).all(...params) as Array<{
    id: string;
    reason: string;
    severity: WarningSeverity;
    repo_id: string | null;
    created_at: string;
  }>;

  return {
    hasWarning: rows.length > 0,
    warnings: rows.map(row => ({
      id: row.id,
      reason: row.reason,
      severity: row.severity,
      repoSpecific: row.repo_id !== null,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Add a warning for a file or package (internal helper)
 */
async function matrixWarnAdd(input: WarnAddInput): Promise<WarnAddResult> {
  const db = getDb();
  const id = `warn_${randomUUID().slice(0, 8)}`;

  // Get repo ID if repo-specific
  let repoId: string | null = null;
  if (input.repoSpecific) {
    const detected = fingerprintRepo();
    repoId = await getOrCreateRepo(detected);
  }

  const severity = input.severity || 'warn';
  const ecosystem = input.type === 'package' ? (input.ecosystem || null) : null;

  // Check for existing warning first (handles NULL-aware matching that UNIQUE constraints can't)
  const existing = db.query(`
    SELECT id FROM warnings
    WHERE type = ? AND target = ?
      AND (ecosystem = ? OR (ecosystem IS NULL AND ? IS NULL))
      AND (repo_id = ? OR (repo_id IS NULL AND ? IS NULL))
  `).get(input.type, input.target, ecosystem, ecosystem, repoId, repoId) as { id: string } | null;

  if (existing) {
    db.query(`
      UPDATE warnings SET reason = ?, severity = ? WHERE id = ?
    `).run(input.reason, severity, existing.id);

    return {
      id: existing.id,
      status: 'updated',
      message: `Warning updated for ${input.type} "${input.target}"`,
    };
  }

  db.query(`
    INSERT INTO warnings (id, type, target, ecosystem, reason, severity, repo_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.type, input.target, ecosystem, input.reason, severity, repoId);

  return {
    id,
    status: 'added',
    message: `Warning added for ${input.type} "${input.target}"`,
  };
}

/**
 * Remove a warning by ID or by type+target (internal helper)
 */
async function matrixWarnRemove(input: WarnRemoveInput): Promise<WarnRemoveResult> {
  const db = getDb();

  if (input.id) {
    // Remove by ID
    const result = db.query('DELETE FROM warnings WHERE id = ?').run(input.id);
    return {
      removed: result.changes,
      message: result.changes > 0
        ? `Removed warning ${input.id}`
        : `Warning ${input.id} not found`,
    };
  }

  if (input.type && input.target) {
    // Remove by type + target + optional ecosystem
    let query = 'DELETE FROM warnings WHERE type = ? AND target = ?';
    const params: (string | null)[] = [input.type, input.target];

    if (input.ecosystem) {
      query += ' AND ecosystem = ?';
      params.push(input.ecosystem);
    }

    const result = db.query(query).run(...params);
    return {
      removed: result.changes,
      message: result.changes > 0
        ? `Removed ${result.changes} warning(s) for ${input.type} "${input.target}"`
        : `No warnings found for ${input.type} "${input.target}"`,
    };
  }

  return {
    removed: 0,
    message: 'Must provide either id or type+target',
  };
}

/**
 * List all warnings (internal helper)
 */
async function matrixWarnList(input: WarnListInput = {}): Promise<WarnListResult> {
  const db = getDb();

  let query = 'SELECT id, type, target, ecosystem, reason, severity, repo_id, created_at FROM warnings WHERE 1=1';
  const params: (string | null)[] = [];

  if (input.type) {
    query += ' AND type = ?';
    params.push(input.type);
  }

  if (input.repoOnly) {
    const detected = fingerprintRepo();
    const repoId = await getOrCreateRepo(detected);
    query += ' AND repo_id = ?';
    params.push(repoId);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.query(query).all(...params) as Array<{
    id: string;
    type: WarningType;
    target: string;
    ecosystem: PackageEcosystem | null;
    reason: string;
    severity: WarningSeverity;
    repo_id: string | null;
    created_at: string;
  }>;

  return {
    warnings: rows.map(row => ({
      id: row.id,
      type: row.type,
      target: row.target,
      ecosystem: row.ecosystem,
      reason: row.reason,
      severity: row.severity,
      repoId: row.repo_id,
      createdAt: row.created_at,
    })),
    total: rows.length,
  };
}

// ============================================================================
// v2.0 Unified Warn Tool
// ============================================================================

export interface WarnInput {
  action: 'check' | 'add' | 'remove' | 'list';
  type?: WarningType;
  target?: string;
  reason?: string;
  severity?: WarningSeverity;
  ecosystem?: PackageEcosystem;
  id?: string;
  repoOnly?: boolean;
  repoSpecific?: boolean;
}

export type WarnResult = WarnCheckResult | WarnAddResult | WarnRemoveResult | WarnListResult;

/**
 * Unified warning management tool (v2.0)
 * Consolidates check, add, remove, and list operations into a single tool.
 */
export async function matrixWarn(input: WarnInput): Promise<WarnResult> {
  switch (input.action) {
    case 'check': {
      if (!input.type || !input.target) {
        throw new Error('check action requires type and target');
      }
      return matrixWarnCheck({
        type: input.type,
        target: input.target,
        ecosystem: input.ecosystem,
      });
    }

    case 'add': {
      if (!input.type || !input.target || !input.reason) {
        throw new Error('add action requires type, target, and reason');
      }
      return matrixWarnAdd({
        type: input.type,
        target: input.target,
        reason: input.reason,
        severity: input.severity,
        ecosystem: input.ecosystem,
        repoSpecific: input.repoSpecific,
      });
    }

    case 'remove': {
      return matrixWarnRemove({
        id: input.id,
        type: input.type,
        target: input.target,
        ecosystem: input.ecosystem,
      });
    }

    case 'list': {
      return matrixWarnList({
        type: input.type,
        repoOnly: input.repoOnly,
      });
    }

    default:
      throw new Error(`Unknown action: ${input.action}`);
  }
}
