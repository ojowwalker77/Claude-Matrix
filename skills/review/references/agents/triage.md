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
- Confidence >= 70%

Show unless signal ratio > 85% already.
```

### Tier 3: Noise (SUPPRESS)
```
Criteria (any of):
- Style/formatting issues
- Opinionated suggestions (e.g., "consider using X")
- Micro-optimizations with no measurable impact
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
