#!/usr/bin/env node
// Gate Aderyn on NEW findings only (issue #11). Aderyn has no severity-based
// exit code and no per-finding suppression, so this compares its JSON report
// against the committed baseline scripts/aderyn-baseline.json:
//
//   { "<severity>:<detector>": { "<file>": <instance count>, ... }, ... }
//
// The baseline holds the triaged, accepted findings — every one sits in a
// deployed immutable contract, reviewed and intentional (e.g. the
// nonReentrant-guarded fee-forwarding calls flagged as reentrancy-state-change).
// A detector/file pair not in the baseline, or an instance-count increase,
// fails the build. Counts (not line numbers) keep the baseline stable across
// unrelated edits; the tradeoff is that a new instance replacing a removed one
// in the same file goes unnoticed — acceptable at this codebase size.
//
// Usage: node scripts/check-aderyn.mjs <aderyn-report.json>
//
// When a finding is genuinely resolved, TIGHTEN the baseline (lower/remove the
// entry). Never add to it without the same review the original triage got.

import { readFileSync } from "node:fs";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("usage: node scripts/check-aderyn.mjs <aderyn-report.json>");
  process.exit(2);
}
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const baseline = JSON.parse(readFileSync(new URL("./aderyn-baseline.json", import.meta.url), "utf8"));

// Current findings → the same {severity:detector: {file: count}} shape.
const current = {};
for (const [sevKey, sev] of [["high_issues", "high"], ["low_issues", "low"]]) {
  for (const issue of report[sevKey]?.issues ?? []) {
    const key = `${sev}:${issue.detector_name}`;
    current[key] ??= {};
    for (const inst of issue.instances) {
      current[key][inst.contract_path] = (current[key][inst.contract_path] ?? 0) + 1;
    }
  }
}

const regressions = [];
const improvements = [];

for (const [detector, files] of Object.entries(current)) {
  for (const [file, count] of Object.entries(files)) {
    const allowed = baseline[detector]?.[file] ?? 0;
    if (count > allowed) {
      regressions.push(`${detector} @ ${file}: ${count} instance(s), baseline allows ${allowed}`);
    } else if (count < allowed) {
      improvements.push(`${detector} @ ${file}: ${count} < baseline ${allowed}`);
    }
  }
}
for (const [detector, files] of Object.entries(baseline)) {
  for (const [file, allowed] of Object.entries(files)) {
    if (!(current[detector]?.[file] > 0)) {
      improvements.push(`${detector} @ ${file}: resolved (baseline ${allowed})`);
    }
  }
}

if (improvements.length > 0) {
  console.log("Baseline entries now unused — tighten scripts/aderyn-baseline.json:");
  for (const line of improvements) console.log(`  ${line}`);
}

if (regressions.length > 0) {
  console.error(`\n${regressions.length} NEW Aderyn finding(s) not in the baseline:`);
  for (const line of regressions) console.error(`  ${line}`);
  console.error("\nFix the finding, or — only after review concludes it is intentional — add it to scripts/aderyn-baseline.json with a justification in the PR.");
  process.exit(1);
}
console.log("No Aderyn findings beyond the committed baseline.");
