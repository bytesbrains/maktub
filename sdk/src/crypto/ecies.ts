/**
 * ECIES-on-secp256k1 encryption for Maktub heartbeat payloads.
 *
 * Implements the construction specified in
 * `internal/product/ENCRYPTION_FORMAT.md` (v1):
 *
 *   - KEM: secp256k1 ECDH (ephemeral-static)
 *   - KDF: HKDF-SHA256 over (ephemeral_pubkey || shared_x), no salt, no info
 *   - DEM: AES-256-GCM (12-byte IV, 16-byte tag)
 *   - Single blob layout: [65B ephemeral_pub | 12B IV | 16B tag | ciphertext]
 *   - Multi-recipient bundle layout:
 *       [1B version=0x01 | 2B count BE | repeated [4B len BE | blob]]
 *
 * This module is a thin barrel that re-exports the focused submodules
 * under `src/crypto/`. The construction is pure TypeScript with no
 * runtime dependency on ethers — it takes raw bytes and returns raw
 * bytes. The `MaktubClient` wraps it for ergonomics.
 *
 * @module
 */

export * from "./constants.js";
export * from "./types.js";
export * from "./bytes.js";
export * from "./aes.js";
export * from "./kdf.js";
export * from "./keypair.js";
export * from "./reading-key.js";
export * from "./blob.js";
export * from "./bundle.js";
export * from "./hybrid.js";
export * from "./hybrid-decrypt.js";
export * from "./padding.js";
