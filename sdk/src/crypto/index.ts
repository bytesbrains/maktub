/**
 * Public entry point for the crypto layer — `@bytesbrains/maktub-sdk/crypto`.
 *
 * This subpath exists so a consumer can take the encryption layer *alone*:
 * reading-key derivation, ECIES-on-secp256k1, and the hybrid envelope, with no
 * `ethers`, no contract wrappers, and — the reason it is a separate entry — no
 * Veil and no WebAssembly anywhere in the module graph.
 *
 * That last property is load-bearing rather than cosmetic. A browser client
 * that derives reading keys wants the tightest CSP it can get on that origin,
 * because a derived reading key is long-lived and its published half is
 * write-once: one injected script that reads it decrypts everything that user
 * has ever received, unrotatably. Instantiating WebAssembly requires
 * `wasm-unsafe-eval`, so a barrel that drags the Veil glue in would force the
 * key-derivation origin to weaken exactly the policy protecting the key.
 * Importing from here keeps `script-src 'self'` achievable.
 *
 * Everything re-exported below is pure TypeScript over `@noble/*` and
 * WebCrypto — it takes raw bytes and returns raw bytes.
 *
 * @module
 */

export * from "./ecies.js";
