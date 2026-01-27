/**
 * GitHub Issue Template Generator
 */

import type { DoctorResult, DiagnosticCheck } from './types.js';

const GITHUB_REPO = 'https://github.com/ojowwalker77/Claude-Matrix';

/**
 * Generate GitHub issue template for unfixable issues
 */
export function generateIssueTemplate(result: DoctorResult): string {
  const failedChecks = result.checks.filter(c => c.status === 'fail' && !c.fixed);
  const warnChecks = result.checks.filter(c => c.status === 'warn' && !c.fixed);

  if (failedChecks.length === 0 && warnChecks.length === 0) {
    return '';
  }

  const failedSummary = failedChecks.length > 0
    ? failedChecks.map(c => '- **' + c.name + '**: ' + c.message).join('\n')
    : '_None_';

  const warnSummary = warnChecks.length > 0
    ? warnChecks.map(c => '- **' + c.name + '**: ' + c.message).join('\n')
    : '_None_';

  const categories = {
    core: ['Matrix Directory', 'Database', 'Configuration', 'Config Migration'],
    database: ['Background Jobs', 'Hook Executions', 'Dreamer Scheduler'],
    hooks: ['Hooks', 'Subagent Hooks'],
    config: ['Model Delegation'],
    features: ['Code Index', 'Skills Directory', 'File Suggestion', 'Repo Detection'],
  };

  const affectedCategories = new Set<string>();
  for (const check of [...failedChecks, ...warnChecks]) {
    for (const [cat, names] of Object.entries(categories)) {
      if (names.includes(check.name)) {
        affectedCategories.add(cat);
      }
    }
  }

  return `
## Bug Report

### Description
Matrix plugin diagnostic found issues that could not be auto-fixed.

### Failed Checks (Critical)
${failedSummary}

### Warning Checks (Non-Critical)
${warnSummary}

### Affected Categories
${Array.from(affectedCategories).map(c => '- ' + c).join('\n') || '_None identified_'}

### Environment
- **OS**: ${result.environment.os}
- **Bun Version**: ${result.environment.bunVersion}
- **Matrix Directory**: ${result.environment.matrixDir}
- **Config Path**: ${result.environment.configPath}
- **Database Path**: ${result.environment.dbPath}

### All Checks Summary
| Check | Status | Message |
|-------|--------|---------|
${result.checks.map(c => `| ${c.name} | ${c.status}${c.fixed ? ' (fixed)' : ''} | ${c.message.slice(0, 50)}${c.message.length > 50 ? '...' : ''} |`).join('\n')}

### Diagnostic Output
<details>
<summary>Full JSON Output</summary>

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

</details>

---
[Open issue on GitHub](${GITHUB_REPO}/issues/new?template=bug_report.md)
`;
}

export { GITHUB_REPO };
