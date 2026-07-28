// Stamp each build tree with the module type Node should read its `.js` files
// as.
//
// `tsc` emits ESM into dist/esm and CommonJS into dist/cjs, but the extension is
// `.js` in both, so Node decides which is which from the nearest package.json
// `type` field. Without these two markers the whole thing is decided by the
// root package.json, and one of the two trees is guaranteed to be interpreted
// wrong: an ESM file evaluated as CJS fails on `import`, a CJS file evaluated as
// ESM fails on `require` — which is precisely how the Veil wasm glue breaks,
// since it calls `require('fs')` at module-evaluation time.
//
// Stamping both trees explicitly also means the root package.json's `type` is
// not load-bearing, so it can stay unset (i.e. CommonJS, as it is today) without
// affecting either published entry point.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(dirname(fileURLToPath(import.meta.url))), "dist");

for (const [dir, type] of [
  ["esm", "module"],
  ["cjs", "commonjs"],
]) {
  const target = join(dist, dir);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, "package.json"),
    JSON.stringify({ type }, null, 2) + "\n"
  );
  console.log(`  dist/${dir}/package.json → { "type": "${type}" }`);
}
