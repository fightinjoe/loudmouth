function inline(value) { return String(value).replaceAll('`', "'").replaceAll('\n', ' '); }

export function renderReport(report) {
  if (report.mode === 'proposed-single-baseline-freeze') {
    return [
      '# Proposed offline calibration plan',
      '',
      `Single baseline freeze: ${report.counts.a} A + ${report.counts.b} B + ${report.counts['c-detection']} C detection + ${report.counts['c-known-location-repair']} known-location repair = **${report.totalCalls} proposed calls**.`,
      '',
      '**Not approved; not execution-ready. No dispatch, retry, paid judge or paid observations.**',
      'Provider, model/revision, prices, budget, latency, tokens and cost are unbound/null. Comparisons are deferred.',
      'Detector-gated offline patch reuse is only a counterfactual composition check. Fresh neutral handle-only repair calls are not in this proposal and have not been observed.',
      '',
      ...report.blockers.map(blocker => `- ${blocker}`),
      '',
      `Plan SHA-256: \`${report.planSha256}\``,
      `Contexts SHA-256: \`${report.contexts}\``,
      `Fixtures SHA-256: \`${report.fixtures}\``,
      '',
      'Use `calibration --plan --json` for the exact per-request prompt, input and schema hashes and unbound model/provider manifest.',
      '',
      report.note,
      '',
    ].join('\n');
  }
  const lines = [
    `# Pipeline ${report.pipeline.toUpperCase()} — ${report.provenance}`,
    '',
    `Structural result: **${report.structuralPass ? 'PASS' : 'FAIL'}**. Quality: **${report.quality}**.`,
    `Coverage: ${report.coverage.contexts} contexts (${report.coverage.ordinary} ordinary, ${report.coverage.challenge} challenge). Deliberate challenge sampling is not production prevalence.`,
    'This evaluator made no provider calls. Imported provider latency/tokens/cost are unavailable (null); subjective scores = null. Authored fixtures are not linguistic certification.',
    `Rubric: \`${report.rubric.path}\` (${report.rubric.version}); all subjective scores remain null.`,
    '',
  ];
  for (const result of report.results) {
    lines.push(`## ${result.contextId} (${result.kind})`, '');
    for (const stage of result.stages) {
      lines.push(`- ${stage.stage.toUpperCase()}: **${stage.status.toUpperCase()}**${stage.error ? ` — ${inline(stage.error)}` : ''}`);
      if (stage.raw) lines.push(`  - Raw: ${stage.raw.bytes} bytes, SHA-256 \`${stage.raw.sha256.slice(0, 12)}\`; normalized failureLevel=${stage.normalized.failureLevel}. Raw response is not written or reproduced.`);
      if (stage.englishSource) lines.push(`  - English: ${stage.englishSource}; SHA-256 \`${stage.englishSha256.slice(0, 12)}\`.`);
      if (stage.example) lines.push(`  - \`${stage.example.path}\`: English “${inline(stage.example.english)}”${stage.example.target ? `; target “${inline(stage.example.target)}”` : ''}.`);
      if (stage.normalized) for (const change of stage.normalized.changes) lines.push(`  - Normalization ${change.path || '/'}: ${inline(change.reason)}`);
      for (const review of stage.reviews ?? []) {
        lines.push(`  - **${review.id}** (${review.kind}): ${review.detection.assessment === 'unscored-uncertainty-probe' ? 'detection not scored against a known error (uncertainty probe)' : `strict attribution ${review.detection.exactMatches.length} exact matches / ${review.detection.unmatchedExpectations.length} unmatched expectations / ${review.detection.unmatchedPredictions.length} unmatched predictions`}; ${review.detection.unresolved.length} detector abstentions.`);
        lines.push(`    - Review coverage: ${!review.detection.valid ? 'invalid response' : review.detection.complete ? 'complete (not a claim of correctness)' : 'incomplete; whole-topic correction blocked'}. Semantic recognition is unassessed by this deterministic comparison.`);
        lines.push(`    - Known-location (oracle-assisted): ${review.knownLocationRepair.outcome}, ${review.knownLocationRepair.application}, ${review.knownLocationRepair.changedFields} changed fields; ${review.knownLocationRepair.checks.filter(check => check.pass).length}/${review.knownLocationRepair.checks.length} authored checks; ${review.responseInventory.localizedRepairResponsesSupplied ? `offline control changed items=${review.knownLocationRepair.correctControlChangedItems}` : 'no repair response supplied; model repair restraint unmeasured'}.`);
        lines.push(`    - Detector-gated **${review.effective.evidence}** (reused known-location replies, not a fresh neutral-model observation): ${review.effective.outcome}; ${review.effective.status}; ${review.effective.application}; ${review.effective.proposedFieldEdits} proposed / ${review.effective.appliedFieldEdits} applied field edits; ${review.effective.unresolvedHandles.length} unresolved handles; offline correct-control changed items=${review.effective.correctControlChangedItems}.`);
        lines.push(`    - Authored expectation: ${review.fixtureExpectation.pass ? 'PASS' : 'FAIL'} (${review.fixtureExpectation.expectedOutcome}); evidence ${review.effective.sourceEvidence.retained}/${review.effective.sourceEvidence.before} retained, ${review.effective.sourceEvidence.removed} removed, ${review.effective.sourceEvidence.introduced} introduced. Unexpected field changes=${review.effective.introducedDamage.unexpectedFieldChanges.length}; linguistic damage remains unjudged.`);
        for (const finding of review.detection.unmatchedExpectations) lines.push(`    - Unmatched authored location: \`${finding.handle}/${finding.field}\` (${finding.category}); not automatically an unnoticed linguistic defect.`);
        for (const finding of review.detection.unmatchedPredictions) lines.push(`    - Unmatched prediction: \`${finding.handle}/${finding.field}\` (${finding.category}, ${finding.severity}): “${inline(finding.reason)}”. Requires review, not automatically a false alarm.`);
        for (const candidate of review.detection.attributionCandidates) {
          lines.push(`    - Same-handle attribution candidate (not semantic credit): expected \`${candidate.expected.handle}/${candidate.expected.field}/${candidate.expected.category}\`; observed \`${candidate.predicted.handle}/${candidate.predicted.field}/${candidate.predicted.category}\`; field ${candidate.fieldMatches ? 'matches' : 'differs'}, category ${candidate.categoryMatches ? 'matches' : 'differs'}; severity ${candidate.predicted.severity} vs authored ${candidate.authoredSeverity ?? 'unassessed'}${candidate.severityMatches === false ? ' (differs; impact needs review)' : ''}.`);
        }
        lines.push(`    - \`${review.example.path}\`: English “${inline(review.example.english)}”; input target “${inline(review.example.target)}”.`);
        if (review.kind === 'unresolved') lines.push(`    - Uncertainty: ${inline(review.note)}`);
        for (const example of review.effective.examples) lines.push(`    - Applied \`${example.path}\` (English “${inline(example.english)}”): “${inline(example.before)}” → “${inline(example.after)}”. Reason: ${inline(example.reason ?? 'not supplied')}`);
        for (const error of review.errors) lines.push(`    - Error: ${inline(error)}`);
      }
    }
    lines.push('');
  }
  if (report.fixtureExpectationsPass !== null) lines.push(`Fixture expectations: **${report.fixtureExpectationsPass ? 'PASS' : 'FAIL'}** (deterministic authored outcomes only, not linguistic quality).`, '');
  return lines.join('\n');
}
