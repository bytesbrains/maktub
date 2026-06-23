/**
 * Constants for the ECIES + hybrid envelope encryption layer.
 *
 * Exported for tests and the spec validator.
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────
//  Constants (exported for tests and the spec validator)
// ─────────────────────────────────────────────────────────────

/** Length of the AES-GCM IV we use, in bytes. */
export const IV_LENGTH = 12;
/** Length of the AES-GCM authentication tag, in bytes. */
export const TAG_LENGTH = 16;
/** Length of an uncompressed secp256k1 public key (0x04 || X || Y). */
export const UNCOMPRESSED_PUBKEY_LENGTH = 65;
/** Length of a compressed secp256k1 public key (0x02/0x03 || X). */
export const COMPRESSED_PUBKEY_LENGTH = 33;
/** Length of a secp256k1 private key (a 32-byte scalar). */
export const PRIVATE_KEY_LENGTH = 32;
/** AES key length (AES-256). */
export const AES_KEY_LENGTH = 32;

/** Current bundle format version. */
export const BUNDLE_VERSION = 0x01;

/** Maximum length of a single encrypted blob (uint32 max). */
export const MAX_BLOB_LENGTH = 0xffff_ffff;
/** Maximum number of recipients in a single bundle (uint16 max). */
export const MAX_RECIPIENT_COUNT = 0xffff;

/** Version byte that marks a v2 hybrid envelope. */
export const HYBRID_VERSION = 0x02;

/** Per-recipient wrap: wrap_iv(12) | wrapped_key_ct(32) | tag(16). */
export const HYBRID_WRAP_LENGTH = IV_LENGTH + AES_KEY_LENGTH + TAG_LENGTH; // 60
