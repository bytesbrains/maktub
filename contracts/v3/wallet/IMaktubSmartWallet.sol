// SPDX-License-Identifier: MIT
//
// Maktub Smart Wallet — IMaktubSmartWallet
// Forked & adapted from Coinbase Smart Wallet (https://github.com/coinbase/smart-wallet)
// Original CoinbaseSmartWallet.sol © Coinbase Inc. — MIT License.
//
// Diff vs. upstream:
//   - Single-owner only (the passkey). Multi-owner add/remove APIs deferred to v2.
//   - Owner is a P-256 (secp256r1) public key registered on first init, then immutable.
//   - WebAuthn signature parsing/verification follows Coinbase's choice of the
//     Daimo / Base "webauthn-sol" library (now upstreamed into OpenZeppelin v5.6).
//
pragma solidity 0.8.28;

import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";

/**
 * @title IMaktubSmartWallet
 * @author Maktub Protocol (forked from Coinbase Smart Wallet)
 * @notice Interface for a single-owner, passkey-native ERC-4337 smart account.
 *         The owner is a P-256 (secp256r1) public key — typically a platform passkey
 *         held in Apple Secure Enclave or Android Keystore. Signatures are validated
 *         on-chain via the RIP-7212 precompile on Base (with a Solidity fallback).
 *
 * @dev v1 is intentionally minimal: no multi-owner, no upgrade path, no social recovery.
 *      The contract is deployed as an ERC-1167 minimal proxy via {MaktubSmartWalletFactory}.
 */
interface IMaktubSmartWallet {
    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    /**
     * @notice A single call to be executed by the wallet.
     * @param target The destination address.
     * @param value  ETH (wei) to send with the call.
     * @param data   Calldata to forward.
     */
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted exactly once when the wallet is initialized with its owner pubkey.
    /// @param ownerX The x coordinate of the P-256 owner public key.
    /// @param ownerY The y coordinate of the P-256 owner public key.
    event OwnerInitialized(bytes32 ownerX, bytes32 ownerY);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when a non-EntryPoint / non-self caller invokes a guarded function.
    error Unauthorized();

    /// @notice Thrown when {initialize} is called more than once.
    error AlreadyInitialized();

    /// @notice Thrown when {initialize} is called with an all-zero pubkey.
    error InvalidOwnerPubkey();

    /// @notice Thrown when an external call inside {execute} or {executeBatch} reverts
    ///         (the original revert data is bubbled up via assembly).
    error CallFailed();

    // ──────────────────────────────────────────────
    //  Initialization
    // ──────────────────────────────────────────────

    /**
     * @notice Initialize the wallet with its single owner P-256 public key.
     *         May only be called once, immediately after CREATE2 deployment by the factory.
     * @param ownerX x coordinate (32 bytes) of the secp256r1 public key.
     * @param ownerY y coordinate (32 bytes) of the secp256r1 public key.
     */
    function initialize(bytes32 ownerX, bytes32 ownerY) external;

    // ──────────────────────────────────────────────
    //  Execution
    // ──────────────────────────────────────────────

    /**
     * @notice Execute a single call from the wallet. Restricted to the EntryPoint or self.
     * @param target Destination address.
     * @param value  ETH (wei) to forward.
     * @param data   Calldata to forward.
     */
    function execute(address target, uint256 value, bytes calldata data) external;

    /**
     * @notice Execute a batch of calls atomically. Restricted to the EntryPoint or self.
     * @param calls Array of {Call} structs.
     */
    function executeBatch(Call[] calldata calls) external;

    // ──────────────────────────────────────────────
    //  ERC-4337
    // ──────────────────────────────────────────────

    /**
     * @notice Validate a UserOperation per ERC-4337.
     * @param userOp              The packed user operation.
     * @param userOpHash          The hash the signature is over.
     * @param missingAccountFunds Funds the wallet must forward to the EntryPoint.
     * @return validationData     0 on success, 1 on signature failure (per ERC-4337 spec).
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);

    // ──────────────────────────────────────────────
    //  Views
    // ──────────────────────────────────────────────

    /// @notice The canonical EntryPoint authorized to call this wallet.
    function entryPoint() external view returns (address);

    /// @notice Returns the owner P-256 public key (x, y).
    function owner() external view returns (bytes32 x, bytes32 y);

    /// @notice Human-readable wallet name (e.g. "Maktub Smart Wallet v1").
    function name() external pure returns (string memory);

    /// @notice Semver string for upgrade tooling (e.g. "1.0.0").
    function version() external pure returns (string memory);

    /**
     * @notice ERC-1271 signature validation for off-chain wallet signing.
     * @param hash      Hash that was (allegedly) signed.
     * @param signature ABI-encoded WebAuthn assertion.
     * @return magicValue 0x1626ba7e if valid, 0xffffffff otherwise.
     */
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue);
}
