/**
 * Veil — time-confidential Beats (PREVIEW).
 *
 * Veil layers Warden's threshold-IBE **condition gate** (timing) over Maktub's existing **v2
 * hybrid envelope** (recipient confidentiality). A payload is unreadable by everyone — including
 * the recipient — until the Beat executes, then end-to-end to the recipient exactly as today.
 * Strip the gate and you have a normal Beat envelope.
 *
 * ⚠️ **PREVIEW — do not claim timing-confidentiality.** Warden's federation is an all-ours
 * testnet (zero-security by design), so the *unreadable-until-trigger* property is NOT real yet.
 * **Recipient confidentiality IS real today** (the hybrid layer, independent of Warden).
 * See `warden/docs/05-threat-model.md` and D-031.
 *
 * @module
 */

import { decryptHybridAt } from "../crypto/hybrid-decrypt.js";
import { encryptHybrid } from "../crypto/hybrid.js";
import { bytesToHex, hexToBytes } from "../crypto/bytes.js";
import type { BytesInput } from "../crypto/types.js";
// Vendored wasm-bindgen bindings over warden-core (nodejs target; sync require, no async init).
import * as wasm from "./wasm/warden_wasm.js";

/** Base Sepolia chain id — the Phase-0 condition source. */
export const VEIL_CHAIN_ID = 84532;
/** Veil is a preview: the federation is zero-security testnet. Gate UI on this. */
export const VEIL_PREVIEW = true;

/** Build the Veil release condition: `MaktubCore.getHeartbeat(beatId).executed == true`. */
export function beatExecutedCondition(opts: {
  core: string;
  beatId: bigint | number | string;
  chainId?: number;
  finality?: number;
}): object {
  return {
    type: "contract",
    chain: opts.chainId ?? VEIL_CHAIN_ID,
    address: opts.core,
    fn: "getHeartbeat(uint256)",
    args: [String(opts.beatId)],
    word: 7,
    test: { cmp: "==", value: true },
    meta: { finality: opts.finality ?? 32, tier: 1 },
  };
}

/** `H(condition)` hex — the identity the federation releases for. */
export function conditionIdentity(condition: object): string {
  if (!condition || typeof condition !== "object") {
    throw new Error("conditionIdentity: condition must be a non-null object");
  }
  return wasm.condition_identity(JSON.stringify(condition));
}

/**
 * Seal a payload as a Veil envelope: hybrid-encrypt to `recipientPublicKeys`, then gate on
 * `condition` under the federation's `masterPubHex`/`network`. Returns the `warden-gate-v1`
 * envelope JSON (publish its CID on-chain as the Beat payload).
 */
export async function veilSeal(opts: {
  plaintext: BytesInput;
  recipientPublicKeys: BytesInput[];
  condition: object;
  masterPubHex: string;
  network: string;
}): Promise<string> {
  const hybrid = await encryptHybrid(opts.plaintext, opts.recipientPublicKeys);
  return wasm.seal_gated(
    JSON.stringify(opts.condition),
    opts.masterPubHex,
    opts.network,
    bytesToHex(hybrid).slice(2) // bare hex — the wasm boundary is 0x-less
  );
}

/**
 * Verify + Lagrange-combine node partials into the released key `d_id` (hex). Tolerant of a
 * noisy set (malformed/duplicate/invalid partials dropped); throws if fewer than `t` are valid.
 */
export function combinePartials(
  partialsHex: string[],
  identityHex: string,
  federationJson: string
): string {
  return wasm.combine(JSON.stringify(partialsHex), identityHex, federationJson);
}

/**
 * Open a Veil envelope once you hold the released key `d_id`: ungate → recover the hybrid
 * envelope → decrypt with the recipient's key at `recipientIndex`. Returns the plaintext.
 */
export async function veilUnwrap(opts: {
  gatedEnvelope: string;
  dIdHex: string;
  recipientPrivateKey: BytesInput;
  recipientIndex: number;
}): Promise<Uint8Array> {
  const hybridHex = wasm.open_gated(opts.gatedEnvelope, opts.dIdHex);
  return decryptHybridAt(opts.recipientPrivateKey, hexToBytes(hybridHex), opts.recipientIndex);
}

/**
 * Full open: poll the federation (`nodes`) for partials, retry-until-released, combine, and
 * unwrap to plaintext. Idempotent — monotonic conditions only ratchet toward released.
 */
export async function veilOpen(opts: {
  gatedEnvelope: string;
  nodes: string[];
  federationJson: string;
  recipientPrivateKey: BytesInput;
  recipientIndex: number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<Uint8Array> {
  let env: { condition?: object };
  try {
    env = JSON.parse(opts.gatedEnvelope);
  } catch (e) {
    throw new Error(`veilOpen: gatedEnvelope is not valid JSON: ${(e as Error).message}`);
  }
  if (!env || typeof env !== "object" || !env.condition) {
    throw new Error("veilOpen: gatedEnvelope must be a JSON object with a 'condition'");
  }
  const idHex = conditionIdentity(env.condition);
  const dIdHex = await pollAndCombine(
    opts.nodes,
    env.condition,
    idHex,
    opts.federationJson,
    opts.timeoutMs ?? 120_000,
    opts.intervalMs ?? 3_000
  );
  return veilUnwrap({
    gatedEnvelope: opts.gatedEnvelope,
    dIdHex,
    recipientPrivateKey: opts.recipientPrivateKey,
    recipientIndex: opts.recipientIndex,
  });
}

async function pollAndCombine(
  nodes: string[],
  condition: object,
  idHex: string,
  federationJson: string,
  timeoutMs: number,
  intervalMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const body = JSON.stringify({ condition });
  for (;;) {
    // Query all nodes concurrently with a per-request timeout, so one hung/slow node can't
    // stall the round (AbortSignal.timeout: Node 18+ / modern browsers).
    const results = await Promise.all(
      nodes.map(async (node) => {
        try {
          const r = await fetch(`${node.replace(/\/$/, "")}/partial`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: AbortSignal.timeout(5_000),
          });
          if (!r.ok) return null;
          const j = (await r.json()) as { released?: boolean; partial?: string };
          return j.released && typeof j.partial === "string" ? j.partial : null;
        } catch {
          return null; // node down / timed out → retry next round
        }
      })
    );
    const partials = results.filter((p): p is string => p !== null);
    try {
      return combinePartials(partials, idHex, federationJson); // succeeds once t valid collected
    } catch (e) {
      // "only N valid partials, need t=T" is transient (poll again). Anything else
      // (bad federationJson / idHex) is permanent — fail fast instead of retrying to timeout.
      const msg = (e as Error).message || "";
      if (!msg.includes("valid partials") && !msg.includes("need t=")) throw e;
    }
    if (Date.now() >= deadline) {
      throw new Error("veilOpen: timed out polling the federation for partials");
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}
