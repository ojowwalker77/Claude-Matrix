# Triage Agent

Classifies findings into tiers, calibrates confidence, filters noise to achieve >80% signal ratio.

## Input
- DetectionFinding[] from Detection Agent
- ImpactGraph from Impact Agent

## Output
```typescript
interface TriagedFinding extends DetectionFinding {
  tier: 1 | 2 | 3;
  calibratedConfidence: number;
  showInOutput: boolean;
  suppressionReason?: string;
}

interface TriageMetrics {
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  suppressedCount: number;
  signalRatio: number; // (tier1 + tier2) / total
}
```

---

## Tier Definitions

### Tier 1: Critical (MUST show)
```
Criteria (any of):
- Security: severity critical OR high
- Runtime: severity critical
- Breaking: any breaking change to public API
- Hygiene: console.log/debug INTRODUCED in this diff (confidence >= 90%)
- Confidence >= 90%

Always show these findings in review output.
```

### Tier 2: Important (SHOULD show)
```
Criteria (any of):
- Security: severity medium
- Runtime: severity high OR medium
- Architecture: significant pattern violations
- Performance: clear regression
- Hygiene (introduced): unused imports, dead exports, commented-out code, circular deps
- Hygiene (pre-existing): console.log leftovers, circular deps
- Confidence >= 70%

Show unless signal ratio > 85% already.
```

### Tier 3: Noise (SUPPRESS)
```
Criteria (any of):
- Style/formatting issues
- Opinionated suggestions (e.g., "consider using X")
- Micro-optimizations with no measurable impact
- Hygiene (pre-existing): stale TODOs, unnecessary comments, overengineered deps, duplication
- Confidence < 70%
- Low severity + low confidence combination

Collapse into expandable section, don't show by default.
```

---

## Confidence Calibration

### Base Confidence
Comes from Detection Agent based on pattern certainty.

### Calibration Modifiers

```typescript
function calibrateConfidence(finding: DetectionFinding, impact: ImpactGraph): number {
  let confidence = finding.confidence;

  // Boost if in API boundary
  if (isInServiceBoundary(finding.file, impact.serviceBoundaries)) {
    confidence += 15;
  }

  // Boost if in core utility (many callers)
  const callerCount = countCallers(finding.file, impact);
  if (callerCount > 10) {
    confidence += 10;
  }

  // Boost if similar past issue was confirmed
  // (check matrix_recall for validated solutions)
  if (hasPastConfirmedIssue(finding.pattern)) {
    confidence += 10;
  }

  // Reduce if file has false positive history
  if (hasHighFalsePositiveRate(finding.file)) {
    confidence -= 15;
  }

  // Reduce if in test file
  if (isTestFile(finding.file)) {
    confidence -= 10;
  }

  return Math.min(100, Math.max(0, confidence));
}
```

### Modifier Summary

| Condition | Modifier |
|-----------|----------|
| In API boundary | +15% |
| In core util (>10 callers) | +10% |
| Similar past issue confirmed | +10% |
| File has FP history | -15% |
| In test file | -10% |
| Hygiene: introduced by this change | +20% |
| Hygiene: pre-existing in touched file | -10% |

---

## Signal Ratio Calculation

```typescript
function calculateSignalRatio(findings: TriagedFinding[]): number {
  const tier1 = findings.filter(f => f.tier === 1).length;
  const tier2 = findings.filter(f => f.tier === 2).length;
  const total = findings.length;

  if (total === 0) return 100; // No findings = perfect signal

  return ((tier1 + tier2) / total) * 100;
}
```

**Target: >80% signal ratio**

If ratio < 80%, aggressively filter Tier 2 items with lowest confidence.

---

## Tier Assignment Algorithm

```typescript
function assignTier(finding: DetectionFinding, impact: ImpactGraph): TriagedFinding {
  const calibrated = calibrateConfidence(finding, impact);

  // Tier 1 rules
  if (finding.type === 'security' && ['critical', 'high'].includes(finding.severity)) {
    return { ...finding, tier: 1, calibratedConfidence: calibrated, showInOutput: true };
  }
  if (finding.type === 'runtime' && finding.severity === 'critical') {
    return { ...finding, tier: 1, calibratedConfidence: calibrated, showInOutput: true };
  }
  if (finding.type === 'breaking') {
    return { ...finding, tier: 1, calibratedConfidence: calibrated, showInOutput: true };
  }
  // Hygiene: introduced console.log/debug with high confidence → Tier 1
  if (finding.type === 'hygiene' && finding.introduced && calibrated >= 90) {
    return { ...finding, tier: 1, calibratedConfidence: calibrated, showInOutput: true };
  }
  if (calibrated >= 90) {
    return { ...finding, tier: 1, calibratedConfidence: calibrated, showInOutput: true };
  }

  // Tier 3 rules (check before Tier 2)
  if (isStyleIssue(finding)) {
    return { ...finding, tier: 3, calibratedConfidence: calibrated, showInOutput: false, suppressionReason: 'style' };
  }
  if (isOpinion(finding)) {
    return { ...finding, tier: 3, calibratedConfidence: calibrated, showInOutput: false, suppressionReason: 'opinion' };
  }
  // Hygiene: pre-existing low-impact items → Tier 3
  if (finding.type === 'hygiene' && !finding.introduced && isLowImpactHygiene(finding)) {
    return { ...finding, tier: 3, calibratedConfidence: calibrated, showInOutput: false, suppressionReason: 'pre-existing hygiene' };
  }
  if (calibrated < 70) {
    return { ...finding, tier: 3, calibratedConfidence: calibrated, showInOutput: false, suppressionReason: 'low confidence' };
  }

  // Tier 2 (everything else that's not filtered)
  return { ...finding, tier: 2, calibratedConfidence: calibrated, showInOutput: true };
}
```

---

## Style/Opinion Detection

### Style Issues
```
Patterns indicating style:
- "inconsistent spacing"
- "prefer X over Y" (where both are valid)
- "naming convention"
- "formatting"
- "whitespace"
- "indentation"
- "trailing comma"
```

### Opinion Issues
```
Patterns indicating opinion:
- "consider using"
- "you might want to"
- "could be refactored"
- "alternative approach"
- "some prefer"
- "subjective"
```

---

## Output Format

```
Triage Summary
==============

Findings by Tier:
- Tier 1 (Critical): 3
- Tier 2 (Important): 7
- Tier 3 (Suppressed): 4

Signal Ratio: 71% (10/14) → Below target, filtering...

After aggressive filter:
- Tier 1: 3 (unchanged)
- Tier 2: 5 (removed 2 lowest confidence)
- Tier 3: 6 (absorbed filtered Tier 2)

Final Signal Ratio: 80% (8/10 shown)

Suppression Details:
- 2 items: Low confidence (< 70%)
- 2 items: Style issues
- 1 item: Opinionated suggestion
- 1 item: Absorbed from Tier 2 filter
```

---

## Aggressive Filtering (When Ratio < 80%)

If signal ratio falls below 80%:

1. Sort Tier 2 findings by calibrated confidence
2. Move lowest confidence Tier 2 items to Tier 3 until ratio >= 80%
3. Add suppressionReason: "below signal threshold"

```typescript
function enforceSignalRatio(findings: TriagedFinding[], target = 0.8): TriagedFinding[] {
  let ratio = calculateSignalRatio(findings);

  if (ratio >= target) return findings;

  // Sort Tier 2 by confidence ascending
  const tier2 = findings
    .filter(f => f.tier === 2)
    .sort((a, b) => a.calibratedConfidence - b.calibratedConfidence);

  for (const finding of tier2) {
    finding.tier = 3;
    finding.showInOutput = false;
    finding.suppressionReason = 'below signal threshold';

    ratio = calculateSignalRatio(findings);
    if (ratio >= target) break;
  }

  return findings;
}
```

---

## Hygiene Classification

### `isLowImpactHygiene(finding)`

Pre-existing hygiene findings that are low-impact for a code review:

```typescript
function isLowImpactHygiene(finding: DetectionFinding): boolean {
  const lowImpactPatterns = [
    'stale_todo',
    'unnecessary_comment',
    'overengineered_dep',
    'copy_paste_duplication',
  ];
  return lowImpactPatterns.includes(finding.pattern);
}
```

### Hygiene Tier Quick Reference

| Pattern | Introduced | Pre-existing |
|---------|-----------|-------------|
| Console.log/debug | Tier 1 (92%) | Tier 2 (70%) |
| Unused import | Tier 2 (90%) | Tier 2 (75%) |
| Dead export | Tier 2 (85%) | Tier 2 (75%) |
| Circular dep | Tier 2 (100%) | Tier 2 (100%) |
| Commented-out code | Tier 2 (72%) | Tier 3 (60%) |
| Orphaned file | Tier 2 (80%) | Tier 2 (70%) |
| Unused package | Tier 3 (75%) | Tier 3 (65%) |
| Stale TODO | n/a (new = not stale) | Tier 3 (65-80%) |
| Unnecessary comment | Tier 3 (70%) | Tier 3 (60%) |
| Overengineered dep | Tier 3 (70%) | Tier 3 (60%) |
| Duplication | Tier 2 (65%) | Tier 3 (55%) |
