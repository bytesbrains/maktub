#!/usr/bin/env node
// Enforce the coverage floors in scripts/coverage-floors.json against the
// istanbul coverage.json that `npm run coverage` writes at the repo root
// (issue #11 — the ratchet issue #6 deferred).
//
// Usage: node scripts/check-coverage.mjs   (from repo root, after `npm run coverage`)
//
// Fails (exit 1) if any global metric, or any per-file metric for a floored
// file, is below its floor. Floors ratchet UP as gaps close — never down.

import { readFileSync } from "node:fs";

const coverage = JSON.parse(readFileSync("coverage.json", "utf8"));
const floors = JSON.parse(readFileSync(new URL("./coverage-floors.json", import.meta.url), "utf8"));

// Fail CLOSED on a bad floors config: a missing or non-numeric floor would
// otherwise compare as `actual < undefined` === false and silently weaken the
// gate. Validate every floor set up front.
function validateFloorSet(label, floorSet) {
  for (const metric of METRICS) {
    if (!Number.isFinite(floorSet?.[metric])) {
      console.error(`coverage-floors.json: "${label}" lacks a numeric "${metric}" floor.`);
      process.exit(2);
    }
  }
}

// Per-metric (covered, total) counters from one istanbul file entry.
function tally(entry) {
  const hitCounts = (obj) => {
    const values = Object.values(obj);
    return [values.filter((v) => v > 0).length, values.length];
  };
  const branchHits = Object.values(entry.b).flat();
  return {
    statements: hitCounts(entry.s),
    branches: [branchHits.filter((v) => v > 0).length, branchHits.length],
    functions: hitCounts(entry.f),
    lines: hitCounts(entry.l),
  };
}

const pct = ([covered, total]) => (total === 0 ? 100 : (covered / total) * 100);

const METRICS = ["statements", "branches", "functions", "lines"];
const failures = [];

function check(label, tallies, floorSet) {
  for (const metric of METRICS) {
    const actual = pct(tallies[metric]);
    const floor = floorSet[metric];
    const line = `${label.padEnd(46)} ${metric.padEnd(10)} ${actual.toFixed(2).padStart(6)}% (floor ${floor}%)`;
    if (actual < floor) {
      failures.push(line);
      console.error(`FAIL  ${line}`);
    } else {
      console.log(`  ok  ${line}`);
    }
  }
}

if (typeof floors.perFile !== "object" || floors.perFile === null) {
  console.error('coverage-floors.json: missing "perFile" object.');
  process.exit(2);
}
validateFloorSet("global", floors.global);
for (const [file, floorSet] of Object.entries(floors.perFile)) {
  validateFloorSet(file, floorSet);
}

// Global: sum counters across every instrumented file.
const globalTally = { statements: [0, 0], branches: [0, 0], functions: [0, 0], lines: [0, 0] };
for (const entry of Object.values(coverage)) {
  const t = tally(entry);
  for (const metric of METRICS) {
    globalTally[metric][0] += t[metric][0];
    globalTally[metric][1] += t[metric][1];
  }
}
check("ALL FILES", globalTally, floors.global);

// Per-file floors for the protocol contracts.
for (const [file, floorSet] of Object.entries(floors.perFile)) {
  const entry = coverage[file];
  if (!entry) {
    failures.push(`${file}: not present in coverage.json (renamed? update coverage-floors.json)`);
    console.error(`FAIL  ${file}: not present in coverage.json`);
    continue;
  }
  check(file, tally(entry), floorSet);
}

if (failures.length > 0) {
  console.error(`\nCoverage floor violated (${failures.length} metric(s) below floor).`);
  console.error("Floors live in scripts/coverage-floors.json — they ratchet up, never down: add tests rather than lowering a floor.");
  process.exit(1);
}
console.log("\nAll coverage floors hold.");
