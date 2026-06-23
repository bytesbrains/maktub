// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RecipientRegistry} from "./RecipientRegistry.sol";

/**
 * @title RecipientRegistryV2
 * @author Maktub Protocol
 * @notice Immutable recipient key registry with typed key slots — the substrate
 *         for Maktub Flash (committed schema: D-023; public spec:
 *         docs/developer/protocol-family.md §3).
 *
 *         Two named slots per recipient:
 *           - `encPubKey`     — long-lived ECIES key (v1-compatible), used by
 *                               Beat envelopes and as the Flash X3DH identity key.
 *           - `ratchetPubKey` — per-session ratchet key for Flash forward
 *                               secrecy. Registering one is the explicit
 *                               Flash opt-in.
 *
 *         Plus an extensibility hatch: `bytes32`-namespaced extension keys
 *         (post-quantum, hardware-attested, ...) so future key types do not
 *         force a v3 — apps agree on `keccak256("maktub.keytype.v1.<name>")`
 *         namespaces.
 *
 *         Backward compatibility: an immutable fall-through pointer to
 *         RecipientRegistry v1. `getEncPubKey(addr)` returns the v2 record if
 *         set, else `v1.getPrePublicKey(addr)`. Beat users do NOT re-register;
 *         they remain Beat-addressable through v1 forever.
 *
 * @dev This contract is intentionally immutable: no owner, no pause, no proxy,
 *      no upgrade path. Once deployed, the code never changes. Substrate
 *      evolution means new immutable contracts deployed alongside (v1 runs
 *      forever), never in-place upgrades.
 *
 *      Unlike v1, registration validates key lengths (issue #20): secp256k1
 *      public keys are 33 bytes (compressed) or 65 bytes (uncompressed).
 *      Key rotation is supported per slot (issue #30, protocol leg) with
 *      update timestamps so apps can detect rotations and prompt owners to
 *      re-encrypt against the new key.
 */
contract RecipientRegistryV2 {
    // ──────────────────────────────────────────────
    //  Constants & Immutables
    // ──────────────────────────────────────────────

    /// @notice Length of a compressed secp256k1 public key (0x02/0x03 || X).
    uint256 public constant COMPRESSED_KEY_LENGTH = 33;

    /// @notice Length of an uncompressed secp256k1 public key (0x04 || X || Y).
    uint256 public constant UNCOMPRESSED_KEY_LENGTH = 65;

    /// @notice The v1 registry this contract falls through to for Beat-only
    ///         recipients. Immutable — v1 runs forever.
    RecipientRegistry public immutable v1;

    // ──────────────────────────────────────────────
    //  Data Structures
    // ──────────────────────────────────────────────

    /**
     * @notice Typed key slots for one recipient (committed shape, D-023).
     * @param encPubKey        Long-lived ECIES key, 33 or 65 bytes.
     * @param ratchetPubKey    Per-session ratchet key for Flash forward
     *                         secrecy, 33 or 65 bytes; empty = not Flash-eligible.
     * @param encUpdatedAt     Timestamp of the last encPubKey write. Nonzero
     *                         doubles as the v2-registered marker.
     * @param ratchetUpdatedAt Timestamp of the last ratchetPubKey write.
     */
    struct RecipientV2 {
        bytes encPubKey;
        bytes ratchetPubKey;
        uint64 encUpdatedAt;
        uint64 ratchetUpdatedAt;
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @notice Typed key slots per recipient.
    mapping(address => RecipientV2) private _recipients;

    /// @notice Extension keys per recipient, namespaced by key type
    ///         (`keccak256("maktub.keytype.v1.<name>")`).
    mapping(address => mapping(bytes32 => bytes)) private _extKeys;

    /// @notice Timestamp of the last write per extension key.
    mapping(address => mapping(bytes32 => uint64)) private _extUpdatedAt;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a recipient registers on v2.
    /// @param recipient     The address that registered.
    /// @param encPubKey     The ECIES public key stored.
    /// @param ratchetPubKey The ratchet public key stored (empty = Beat-only).
    event RecipientRegisteredV2(
        address indexed recipient,
        bytes encPubKey,
        bytes ratchetPubKey
    );

    /// @notice Emitted on encPubKey rotation. Apps watching this should prompt
    ///         owners of live Beats referencing this recipient to re-encrypt.
    event EncPubKeyUpdated(address indexed recipient, bytes newEncPubKey);

    /// @notice Emitted on ratchetPubKey registration or rotation.
    event RatchetPubKeyUpdated(address indexed recipient, bytes newRatchetPubKey);

    /// @notice Emitted on extension-key registration or rotation.
    event ExtKeyUpdated(address indexed recipient, bytes32 indexed keyType, bytes newKey);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when an already-registered address registers again.
    error AlreadyRegistered();

    /// @notice Thrown when a key update is attempted by an unregistered address.
    error NotRegistered();

    /// @notice Thrown when a key is neither 33 nor 65 bytes (issue #20).
    error InvalidKeyLength(uint256 length);

    /// @notice Thrown when a key has the wrong prefix byte for its length
    ///         (compressed keys start 0x02/0x03, uncompressed 0x04).
    error InvalidKeyPrefix(bytes1 prefix);

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @notice Deploys the v2 registry with its immutable v1 fall-through.
     * @param _v1 The deployed RecipientRegistry v1 contract.
     */
    constructor(RecipientRegistry _v1) {
        require(address(_v1) != address(0), "V1 registry cannot be zero");
        v1 = _v1;
    }

    // ──────────────────────────────────────────────
    //  External Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Register the caller with typed key slots.
     * @dev Registration is free (gas only). Cannot register twice — use the
     *      per-slot setters to rotate keys afterwards.
     * @param encPubKey     The caller's ECIES public key (33 or 65 bytes, required).
     * @param ratchetPubKey The caller's ratchet public key (33 or 65 bytes), or
     *                      empty bytes to register Beat-only. Registering a
     *                      ratchet key is the explicit Flash opt-in.
     */
    function register(
        bytes calldata encPubKey,
        bytes calldata ratchetPubKey
    ) external {
        if (_recipients[msg.sender].encUpdatedAt != 0) revert AlreadyRegistered();
        _validateKey(encPubKey);

        RecipientV2 storage rec = _recipients[msg.sender];
        rec.encPubKey = encPubKey;
        rec.encUpdatedAt = uint64(block.timestamp);

        if (ratchetPubKey.length != 0) {
            _validateKey(ratchetPubKey);
            rec.ratchetPubKey = ratchetPubKey;
            rec.ratchetUpdatedAt = uint64(block.timestamp);
        }

        emit RecipientRegisteredV2(msg.sender, encPubKey, ratchetPubKey);
    }

    /**
     * @notice Rotate the caller's ECIES public key.
     * @dev Issue #30: rotation is the remediation path for device compromise.
     *      NOTE: live Beats referencing the old key are NOT re-encrypted by
     *      this call — their owners must run `updateRecipients` with a fresh
     *      envelope. Apps watch `EncPubKeyUpdated` to drive that flow.
     * @param newEncPubKey The new ECIES public key (33 or 65 bytes).
     */
    function setEncPubKey(bytes calldata newEncPubKey) external {
        RecipientV2 storage rec = _recipients[msg.sender];
        if (rec.encUpdatedAt == 0) revert NotRegistered();
        _validateKey(newEncPubKey);

        rec.encPubKey = newEncPubKey;
        rec.encUpdatedAt = uint64(block.timestamp);

        emit EncPubKeyUpdated(msg.sender, newEncPubKey);
    }

    /**
     * @notice Register, rotate, or clear the caller's ratchet public key.
     * @dev Registering a key is the Flash opt-in. Passing empty bytes clears
     *      the key — the Flash opt-OUT: a recipient whose device is
     *      compromised can revoke eligibility so senders fail loud
     *      (`RecipientNotFlashEligible`) instead of encrypting to a
     *      compromised key.
     * @param newRatchetPubKey The new ratchet public key (33 or 65 bytes),
     *                         or empty bytes to opt out of Flash.
     */
    function setRatchetPubKey(bytes calldata newRatchetPubKey) external {
        RecipientV2 storage rec = _recipients[msg.sender];
        if (rec.encUpdatedAt == 0) revert NotRegistered();
        if (newRatchetPubKey.length != 0) {
            _validateKey(newRatchetPubKey);
        }

        rec.ratchetPubKey = newRatchetPubKey;
        rec.ratchetUpdatedAt = uint64(block.timestamp);

        emit RatchetPubKeyUpdated(msg.sender, newRatchetPubKey);
    }

    /**
     * @notice Register, rotate, or delete an extension key for the caller.
     * @dev No shape validation — extension key formats (post-quantum,
     *      hardware-attested, ...) are defined by the apps that namespace
     *      them, not by this contract. Passing empty bytes deletes the key
     *      (revocation); the update timestamp still bumps so watchers can
     *      detect the revocation.
     * @param keyType Namespaced key type, `keccak256("maktub.keytype.v1.<name>")`.
     * @param key     The key material, or empty bytes to delete.
     */
    function setExtKey(bytes32 keyType, bytes calldata key) external {
        if (_recipients[msg.sender].encUpdatedAt == 0) revert NotRegistered();

        if (key.length == 0) {
            delete _extKeys[msg.sender][keyType];
        } else {
            _extKeys[msg.sender][keyType] = key;
        }
        _extUpdatedAt[msg.sender][keyType] = uint64(block.timestamp);

        emit ExtKeyUpdated(msg.sender, keyType, key);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Whether an address is registered on v2 OR on the v1 fall-through.
     * @dev Beat-style "is this a valid recipient" check against the v2 stack.
     *      For Flash eligibility use `isFlashEligible` instead.
     */
    function isRegistered(address account) external view returns (bool) {
        if (_recipients[account].encUpdatedAt != 0) return true;
        return v1.isRegistered(account);
    }

    /// @notice Whether an address is registered on v2 specifically.
    function isRegisteredV2(address account) external view returns (bool) {
        return _recipients[account].encUpdatedAt != 0;
    }

    /**
     * @notice Whether an address can receive Flash messages (has opted in by
     *         registering a ratchet public key on v2).
     */
    function isFlashEligible(address account) public view returns (bool) {
        return _recipients[account].ratchetPubKey.length != 0;
    }

    /**
     * @notice The ECIES public key for a recipient, with v1 fall-through.
     * @dev Returns the v2 `encPubKey` if the recipient registered here, else
     *      `v1.getPrePublicKey(account)` (which returns empty bytes when the
     *      account is unknown to both registries).
     */
    function getEncPubKey(address account) external view returns (bytes memory) {
        RecipientV2 storage rec = _recipients[account];
        if (rec.encUpdatedAt != 0) return rec.encPubKey;
        return v1.getPrePublicKey(account);
    }

    /// @notice The ratchet public key for a recipient (empty if not opted in).
    function getRatchetPubKey(address account) external view returns (bytes memory) {
        return _recipients[account].ratchetPubKey;
    }

    /// @notice The full v2 record for a recipient (all-empty if not v2-registered).
    function getRecipient(address account) external view returns (RecipientV2 memory) {
        return _recipients[account];
    }

    /// @notice An extension key for a recipient (empty if never set).
    function getExtKey(address account, bytes32 keyType) external view returns (bytes memory) {
        return _extKeys[account][keyType];
    }

    /// @notice Timestamp of the last write to an extension key (0 if never set).
    function extKeyUpdatedAt(address account, bytes32 keyType) external view returns (uint64) {
        return _extUpdatedAt[account][keyType];
    }

    // ──────────────────────────────────────────────
    //  Internal Functions
    // ──────────────────────────────────────────────

    /// @dev Reverts unless `key` is a plausibly-shaped secp256k1 public key:
    ///      33 bytes with an 0x02/0x03 prefix (compressed) or 65 bytes with
    ///      an 0x04 prefix (uncompressed). On-curve checks happen client-side
    ///      at encryption time; the registry enforces shape so user error
    ///      surfaces at registration, not at decryption.
    function _validateKey(bytes calldata key) internal pure {
        if (key.length == COMPRESSED_KEY_LENGTH) {
            if (key[0] != 0x02 && key[0] != 0x03) revert InvalidKeyPrefix(key[0]);
        } else if (key.length == UNCOMPRESSED_KEY_LENGTH) {
            if (key[0] != 0x04) revert InvalidKeyPrefix(key[0]);
        } else {
            revert InvalidKeyLength(key.length);
        }
    }
}
