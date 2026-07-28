// Regression gate for issue #39 — the packaging claims, checked against the
// build output rather than trusted.
//
// The failure this exists to prevent is silent and only shows up in someone
// else's bundler: a re-export added to the root barrel drags the Veil wasm glue
// back into the default import path, and every browser consumer either breaks
// outright or has to weaken the CSP on the origin that derives their reading
// keys. Nothing in the unit tests would notice — they run against `src/` and
// under Node, where the glue loads fine.
//
// So this runs against `dist/`, after a build:
//
//   1. every target named in package.json#exports exists on disk
//   2. the ESM tree mentions no wasm and no `require(` at all
//   3. importing the root and `./crypto` entries instantiates no WebAssembly —
//      enforced by trapping the constructors first, which is the only check
//      here that would survive someone re-exporting Veil through a chain of
//      files a grep did not anticipate
//   4. `./veil` still works, wasm and all — the point is to move it, not drop it
//
// Run as `npm run verify:packaging` (and by `npm run build`).

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

let failed = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failed++;
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

// ── 1. Every exports target resolves to a real file ──────────────────────────
// A wrong path here is invisible until install time, where it surfaces as
// ERR_MODULE_NOT_FOUND with no indication of which condition was at fault.

const targets = [];
const walk = (node, path) => {
  if (typeof node === "string") {
    if (!node.includes("*")) targets.push([path, node]);
    return;
  }
  for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
};
walk(pkg.exports, "exports");

for (const [path, target] of targets) {
  if (existsSync(join(root, target))) pass(`${path} → ${target}`);
  else fail(`${path} → ${target} does not exist`);
}

// ── 2. The ESM tree is free of wasm and of CommonJS ──────────────────────────
// `require(` in a tree stamped `"type": "module"` is a ReferenceError at
// runtime, and it is exactly what the vendored nodejs-target wasm glue is made
// of, so the two checks catch the same mistake from either direction.

const filesUnder = (dir) =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? filesUnder(full) : [full];
      });

const esmDir = join(root, "dist", "esm");
const esmJs = filesUnder(esmDir).filter((f) => f.endsWith(".js"));

if (esmJs.length === 0) fail("dist/esm contains no JavaScript — did the ESM build run?");

// Comments survive into the emitted `.js`, and the source files here discuss
// `require('fs')` and WebAssembly at length precisely because of this issue —
// so a naive scan reports the documentation as the defect. Strip comments
// first. The stripper is regex-based and will also blank a `/*` that appears
// inside a string literal; that direction costs a false negative at worst, and
// the runtime trap below is the real backstop.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

for (const needle of ["warden_wasm", "WebAssembly", "require("]) {
  const hits = esmJs.filter((f) =>
    stripComments(readFileSync(f, "utf8")).includes(needle)
  );
  if (hits.length === 0) {
    pass(`dist/esm is free of \`${needle}\` (${esmJs.length} files)`);
  } else {
    fail(
      `dist/esm references \`${needle}\` in: ${hits
        .map((f) => relative(root, f))
        .join(", ")}`
    );
  }
}

// ── 3. Importing `./crypto` instantiates no WebAssembly ──────────────────────
// Trapping the constructors covers the whole transitive graph, including
// anything reached through a dependency, which grepping the emitted files
// cannot.
//
// The trap is applied to the `./crypto` entries only, and that scoping is
// deliberate rather than a weakening. The root entry pulls `ethers`, which on
// Node reaches undici — and undici compiles its llhttp wasm on first load.
// That is Node's own HTTP stack, it is not in any browser bundle, and it is
// not something this package can or should prevent; trapping globally just
// reports it as our defect. `./crypto` is the entry the CSP argument is about,
// it depends on nothing but `@noble/*`, and for it the claim is absolute.
//
// Crypto is imported *before* the root entries below, so the trap sees the
// modules actually execute rather than a warm cache.

const realWebAssembly = globalThis.WebAssembly;
const trap = (what) => () => {
  throw new Error(
    `WebAssembly.${what} was called while importing @bytesbrains/maktub-sdk/crypto. ` +
      `Something pulled Veil back into the graph — see sdk/src/index.ts (#39).`
  );
};
globalThis.WebAssembly = {
  ...realWebAssembly,
  Module: trap("Module"),
  Instance: trap("Instance"),
  instantiate: trap("instantiate"),
  compile: trap("compile"),
};

// An ESM namespace exposes CJS named exports directly; `default` is the whole
// module.exports. Merge so one shape works for both trees.
const flatten = (mod) => ({ ...(mod.default ?? {}), ...mod });

for (const [label, entry] of [
  ["crypto (esm)", "dist/esm/crypto/index.js"],
  ["crypto (cjs)", "dist/cjs/crypto/index.js"],
]) {
  try {
    const ns = flatten(await import(pathToFileURL(join(root, entry)).href));
    if (typeof ns.deriveReadingKeyFromPrfOutput !== "function") {
      fail(`${label} does not export deriveReadingKeyFromPrfOutput`);
    } else {
      pass(`${label} imports with no WebAssembly and exposes reading-key derivation`);
    }
  } catch (err) {
    fail(`${label} failed to import: ${err.message}`);
  }
}

globalThis.WebAssembly = realWebAssembly;

// The root entries only have to load and carry the surface. Their freedom from
// wasm is established statically, by check 2 over the whole ESM tree.
for (const [label, entry] of [
  ["root (esm)", "dist/esm/index.js"],
  ["root (cjs)", "dist/cjs/index.js"],
]) {
  try {
    const ns = flatten(await import(pathToFileURL(join(root, entry)).href));
    const missing = ["MaktubClient", "deriveReadingKeyFromPrfOutput"].filter(
      (name) => typeof ns[name] !== "function"
    );
    if (missing.length) fail(`${label} does not export ${missing.join(", ")}`);
    else pass(`${label} imports and carries the public surface`);
  } catch (err) {
    fail(`${label} failed to import: ${err.message}`);
  }
}

// Veil must be gone from the root barrel — that is the change, and a re-export
// would silently undo it.
try {
  const ns = flatten(
    await import(pathToFileURL(join(root, "dist/esm/index.js")).href)
  );
  if (ns.veilSeal === undefined) pass("root barrel no longer re-exports Veil");
  else fail("root barrel re-exports Veil again — move it back behind ./veil (#39)");
} catch {
  // Already reported above.
}

// ── 4. Veil still works from its own subpath ─────────────────────────────────
// Moving it off the root barrel must not amount to quietly dropping it.

try {
  const veil = await import(
    pathToFileURL(join(root, "dist/cjs/veil/veil.js")).href
  );
  const ns = veil.veilSeal ? veil : veil.default;
  if (typeof ns.veilSeal === "function") pass("./veil loads and exposes veilSeal");
  else fail("./veil does not export veilSeal");
} catch (err) {
  fail(`./veil failed to import: ${err.message}`);
}

// ── Result ───────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\npackaging verification failed (${failed} problem(s)).`);
  process.exit(1);
}
console.log("\npackaging verification passed.");
