/* tslint:disable */
/* eslint-disable */

/**
 * Verify node partials against the federation's share public keys and Lagrange-combine `t`
 * of them into `d_id` (hex). `partials_json` is a JSON array of hex-encoded `Partial`s
 * (collected from any number of nodes — may include duplicates, malformed, or invalid ones);
 * `fed_json` is the public `federation.json`; `id_hex` is the condition identity.
 *
 * **Tolerant of a noisy federation:** malformed / wrong-index / signature-invalid partials are
 * dropped (not fatal), and partials are deduped by node index — so a single down or malicious
 * node can't fail or grief the combine. Errors only if fewer than `t` *valid* partials remain.
 */
export function combine(partials_json: string, id_hex: string, fed_json: string): string;

/**
 * `H("warden-cond-v1" ‖ jcs(condition))` as 32-byte hex. Must match the Rust KATs.
 */
export function condition_identity(condition_json: string): string;

/**
 * Open a `warden-gate-v1` envelope (JSON) with the released key `d_id` (hex). Returns the
 * original blob as hex.
 */
export function open_gated(envelope_json: string, d_id_hex: string): string;

/**
 * Gate an already-encrypted `blob` (hex) on `condition` under `master_pub` (hex). Returns the
 * `warden-gate-v1` envelope as JSON.
 */
export function seal_gated(condition_json: string, master_pub_hex: string, network: string, blob_hex: string): string;
