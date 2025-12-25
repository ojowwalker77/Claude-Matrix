#!/usr/bin/env bun
/**
 * PreToolUse:Bash Hook (Package Auditor)
 *
 * Runs before Bash tool executes.
 * Detects package install commands and audits packages for:
 *   - CVEs (via OSV.dev)
 *   - Bundle size (via Bundlephobia, npm only)
 *   - Deprecation status (via npm registry)
 *   - Local warnings (Matrix database)
 *
 * Exit codes:
 *   0 = Success (allows tool to proceed)
 *   1 = Non-blocking error
 *   2 = Blocking error (stops tool)
 */

import {
  readStdin,
  outputJson,
  hooksEnabled,
  getHooksConfig,
  parsePackageCommand,
  getCachedResponse,
  setCachedResponse,
  type PreToolUseInput,
  type HookOutput,
  type Ecosystem,
} from './index.js';
import { matrixWarnCheck } from '../tools/warn.js';
import { printToUser, renderAuditorBox, renderErrorBox } from './ui.js';

interface AuditIssue {
  type: 'cve' | 'deprecated' | 'size' | 'warning';
  severity: 'info' | 'warn' | 'critical';
  message: string;
  details?: unknown;
}

interface PackageAudit {
  package: string;
  ecosystem: Ecosystem;
  issues: AuditIssue[];
}

/**
 * Query OSV.dev for vulnerabilities
 */
async function queryOSV(packageName: string, ecosystem: Ecosystem): Promise<unknown[]> {
  const ecosystemMap: Record<Ecosystem, string> = {
    npm: 'npm',
    pip: 'PyPI',
    cargo: 'crates.io',
    go: 'Go',
  };

  const cacheKey = `osv:${ecosystem}:${packageName}`;
  const cached = getCachedResponse(cacheKey) as unknown[] | null;
  if (cached !== null) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: packageName, ecosystem: ecosystemMap[ecosystem] },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json() as { vulns?: unknown[] };
    const vulns = data.vulns || [];

    setCachedResponse(cacheKey, vulns);
    return vulns;
  } catch {
    return [];
  }
}

/**
 * Query Bundlephobia for package size (npm only)
 */
async function queryBundlephobia(packageName: string): Promise<{ size: number; gzip: number } | null> {
  const cacheKey = `bundlephobia:${packageName}`;
  const cached = getCachedResponse(cacheKey) as { size: number; gzip: number } | null;
  if (cached !== null) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://bundlephobia.com/api/size?package=${encodeURIComponent(packageName)}`,
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json() as { size: number; gzip: number };
    const result = { size: data.size, gzip: data.gzip };

    setCachedResponse(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Query npm registry for deprecation status
 */
async function queryNpmRegistry(packageName: string): Promise<{ deprecated?: string } | null> {
  const cacheKey = `npm-registry:${packageName}`;
  const cached = getCachedResponse(cacheKey) as { deprecated?: string } | null;
  if (cached !== null) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json() as { deprecated?: string };
    const result = { deprecated: data.deprecated };

    setCachedResponse(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Audit a single package
 */
async function auditPackage(packageName: string, ecosystem: Ecosystem): Promise<PackageAudit> {
  const config = getHooksConfig();
  const issues: AuditIssue[] = [];

  // Run all checks in parallel
  const [cves, localWarnings, bundleInfo, npmInfo] = await Promise.all([
    queryOSV(packageName, ecosystem),
    matrixWarnCheck({ type: 'package', target: packageName, ecosystem }),
    ecosystem === 'npm' ? queryBundlephobia(packageName) : Promise.resolve(null),
    ecosystem === 'npm' ? queryNpmRegistry(packageName) : Promise.resolve(null),
  ]);

  // Check CVEs
  if (cves.length > 0) {
    const vulns = cves as Array<{ severity?: string; id?: string; summary?: string }>;
    const criticalVulns = vulns.filter(v =>
      v.severity === 'CRITICAL' || v.severity === 'HIGH'
    );

    if (criticalVulns.length > 0) {
      issues.push({
        type: 'cve',
        severity: 'critical',
        message: `${criticalVulns.length} critical/high CVE(s) found`,
        details: criticalVulns.slice(0, 3).map(v => ({
          id: v.id,
          summary: v.summary?.slice(0, 100),
        })),
      });
    } else if (cves.length > 0) {
      issues.push({
        type: 'cve',
        severity: 'warn',
        message: `${cves.length} vulnerability/ies found (non-critical)`,
      });
    }
  }

  // Check local warnings
  if (localWarnings.hasWarning) {
    for (const warning of localWarnings.warnings) {
      issues.push({
        type: 'warning',
        severity: warning.severity === 'block' ? 'critical' : (warning.severity as 'info' | 'warn'),
        message: warning.reason,
      });
    }
  }

  // Check deprecation (npm only)
  if (npmInfo?.deprecated && !config.skipDeprecationWarnings) {
    issues.push({
      type: 'deprecated',
      severity: 'warn',
      message: `Package is deprecated: ${npmInfo.deprecated.slice(0, 100)}`,
    });
  }

  // Check size (npm only)
  const sizeThreshold = config.sizeWarningThreshold || 500000;
  if (bundleInfo && bundleInfo.size > sizeThreshold) {
    issues.push({
      type: 'size',
      severity: 'info',
      message: `Large package: ${Math.round(bundleInfo.size / 1024)}KB (gzip: ${Math.round(bundleInfo.gzip / 1024)}KB)`,
    });
  }

  return { package: packageName, ecosystem, issues };
}

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<PreToolUseInput>();

    // Get command from tool input
    const command = input.tool_input.command as string | undefined;
    if (!command) {
      process.exit(0);
    }

    // Parse package command
    const parsed = parsePackageCommand(command);
    if (!parsed || parsed.packages.length === 0) {
      // Not a package install command
      process.exit(0);
    }

    // Audit all packages in parallel
    const audits = await Promise.all(
      parsed.packages.map(pkg => auditPackage(pkg, parsed.ecosystem))
    );

    // Collect all issues
    const allIssues = audits.flatMap(a => a.issues);
    const criticalIssues = allIssues.filter(i => i.severity === 'critical');
    const warnIssues = allIssues.filter(i => i.severity === 'warn');

    // Count issues by severity
    const infoIssues = allIssues.filter(i => i.severity === 'info');

    // Display audit box to user
    const box = renderAuditorBox(
      parsed.packages,
      criticalIssues.length,
      warnIssues.length,
      infoIssues.length
    );
    printToUser(box);

    if (criticalIssues.length > 0) {
      // Critical issues - ask user
      const packageNames = parsed.packages.join(', ');
      const issuesSummary = criticalIssues
        .map(i => `• [${i.type.toUpperCase()}] ${i.message}`)
        .join('\n');

      const output: HookOutput = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `Matrix Auditor found critical issues with: ${packageNames}\n\n${issuesSummary}\n\nProceed with installation anyway?`,
        },
      };

      outputJson(output);
      process.exit(0);
    }

    process.exit(0);
  } catch (err) {
    // Log error but don't block
    const errorBox = renderErrorBox('Auditor', err instanceof Error ? err.message : 'Unknown error');
    printToUser(errorBox);
    process.exit(1);
  }
}

if (import.meta.main) run();
