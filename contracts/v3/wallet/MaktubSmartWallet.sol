// SPDX-License-Identifier: MIT
//
// Maktub Smart Wallet — MaktubSmartWallet.sol
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ FORK NOTICE                                                              │
// │                                                                          │
// │ This contract is a minimal fork of Coinbase's CoinbaseSmartWallet.sol    │
// │   https://github.com/coinbase/smart-wallet                               │
// │ Original © Coinbase Inc. 2024 — MIT License (preserved).                 │
// │                                                                          │
// │ Why we forked instead of importing:                                      │
// │   1. We need single-owner semantics for v1 (passkey = owner). The        │
// │      upstream contract supports an arbitrary number of owners via an     │
// │      indexed mapping; that surface area is not justified for v1 and      │
// │      adds storage / audit cost.                                          │
// │   2. We need predictable Solidity 0.8.28 + Cancun EVM compilation        │
// │      alongside the rest of the Maktub v3 contracts.                      │
// │   3. We want the contract to live inside our monorepo for the duration   │
// │      of v1 development, then be split out to a public                    │
// │      `base-passkey-wallet` repo at mainnet (per SMART_WALLET_SPEC §6).   │
// │                                                                          │
// │ What we KEPT from upstream:                                              │
// │   - The ERC-4337 v0.7 EntryPoint integration shape.                      │
// │   - The CREATE2 / clone-factory deployment pattern (counterfactual).     │
// │   - The on-chain WebAuthn assertion validation flow that ultimately      │
// │     dispatches to the secp256r1 (P-256) precompile (RIP-7212) on Base,   │
// │     with a Solidity fallback for chains without the precompile.          │
// │   - Single `execute(target,value,data)` and `executeBatch(Call[])`       │
// │     entry points.                                                        │
// │   - ERC-1271 `isValidSignature` for off-chain signing.                   │
// │                                                                          │
// │ What we STRIPPED for v1:                                                 │
// │   - Multi-owner storage (`ownerAtIndex`, `ownerCount`, `addOwnerPubkey`, │
// │     `removeOwnerAtIndex`, the cross-chain replayable signature paths     │
// │     used to add/remove owners). Single owner is sufficient for v1; v2    │
// │     re-introduces `addOwnerPubkey` as the recovery primitive.            │
// │   - UUPS upgradeability. v1 wallets are immutable bytecode forever.      │
// │   - Multi-owner signature decoding (`SignatureWrapper { ownerIndex, … }` │
// │     wrapper) — we read the WebAuthn assertion directly.                  │
// │                                                                          │
// │ What we ADDED:                                                           │
// │   - NatSpec on every external function.                                  │
// │   - `name()` and `version()` views.                                      │
// │   - `OwnerInitialized` event (no upstream equivalent, since upstream     │
// │     emits per-owner Add events).                                         │
// │                                                                          │
// │ Cryptographic primitives:                                                │
// │   We use OpenZeppelin v5.6 `WebAuthn` and `P256` libraries. These        │
// │   libraries themselves credit the Daimo / Base "webauthn-sol" lineage    │
// │   in their headers, which is the EXACT same code Coinbase Smart Wallet   │
// │   ships. So we inherit the same audited implementation by a different    │
// │   import path — one less file we have to maintain ourselves.             │
// └──────────────────────────────────────────────────────────────────────────┘
//
pragma solidity 0.8.28;

import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

import {IMaktubSmartWallet} from "./IMaktubSmartWallet.sol";

/**
 * @title MaktubSmartWallet
 * @author Maktub Protocol (forked from Coinbase Smart Wallet — © Coinbase, MIT)
 * @notice Single-owner ERC-4337 smart account whose owner is a P-256 (passkey) public key.
 *         Validates WebAuthn assertions on-chain via the RIP-7212 precompile on Base.
 *
 * @dev Deployed as an ERC-1167 minimal proxy (clone) by {MaktubSmartWalletFactory}, with
 *      the owner pubkey set via {initialize} immediately after CREATE2 deployment.
 */
contract MaktubSmartWallet is IMaktubSmartWallet {
    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /**
     * @dev Canonical ERC-4337 v0.7 EntryPoint, identical on every EVM chain it has
     *      been deployed to (Base, Optimism, Mainnet, etc.). Pinned at the bytecode
     *      level — making this mutable would be a governance attack vector.
     *      See SMART_WALLET_SPEC §7 item 9.
     */
    address public constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    /// @dev ERC-1271 magic value for a valid signature.
    bytes4 private constant _ERC1271_MAGIC_VALUE = 0x1626ba7e;

    /// @dev ERC-1271 magic value for an invalid signature.
    bytes4 private constant _ERC1271_INVALID = 0xffffffff;

    /// @dev ERC-4337 success / failure sentinel returns from validateUserOp.
    uint256 private constant _SIG_VALIDATION_SUCCESS = 0;
    uint256 private constant _SIG_VALIDATION_FAILED = 1;

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev x coordinate of the P-256 owner public key. Set once in {initialize}.
    bytes32 private _ownerX;

    /// @dev y coordinate of the P-256 owner public key. Set once in {initialize}.
    bytes32 private _ownerY;

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    /// @dev Restricts access to the canonical EntryPoint or to the wallet itself
    ///      (the latter enabling self-calls from within `executeBatch`).
    modifier onlyEntryPointOrSelf() {
        if (msg.sender != ENTRY_POINT && msg.sender != address(this)) revert Unauthorized();
        _;
    }

    /// @dev Restricts access to the canonical EntryPoint only.
    modifier onlyEntryPoint() {
        if (msg.sender != ENTRY_POINT) revert Unauthorized();
        _;
    }

    // ──────────────────────────────────────────────
    //  Construction
    // ──────────────────────────────────────────────

    /**
     * @dev The implementation contract is never used directly — only as a delegatecall
     *      target for ERC-1167 clones produced by the factory. Locking it down here
     *      prevents anyone from initializing the implementation itself and bricking it.
     */
    constructor() {
        // Mark the implementation as initialized so it can never be initialized.
        _ownerX = bytes32(uint256(1));
        _ownerY = bytes32(uint256(1));
    }

    // ──────────────────────────────────────────────
    //  Initialization
    // ──────────────────────────────────────────────

    /// @inheritdoc IMaktubSmartWallet
    function initialize(bytes32 ownerX, bytes32 ownerY) external {
        if (_ownerX != bytes32(0) || _ownerY != bytes32(0)) revert AlreadyInitialized();
        if (ownerX == bytes32(0) && ownerY == bytes32(0)) revert InvalidOwnerPubkey();
        _ownerX = ownerX;
        _ownerY = ownerY;
        emit OwnerInitialized(ownerX, ownerY);
    }

    // ──────────────────────────────────────────────
    //  ERC-4337 validation
    // ──────────────────────────────────────────────

    /// @inheritdoc IMaktubSmartWallet
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external onlyEntryPoint returns (uint256 validationData) {
        validationData = _validateSignature(userOpHash, userOp.signature)
            ? _SIG_VALIDATION_SUCCESS
            : _SIG_VALIDATION_FAILED;

        // Forward any prefund the EntryPoint asked for. We deliberately ignore the
        // success bool: the EntryPoint will revert the entire bundle if the prefund
        // didn't arrive, so a silent failure here cannot lead to a free UserOp.
        if (missingAccountFunds > 0) {
            (bool ok, ) = payable(ENTRY_POINT).call{value: missingAccountFunds}("");
            ok; // silence unused-var warning
        }
    }

    // ──────────────────────────────────────────────
    //  Execution
    // ──────────────────────────────────────────────

    /// @inheritdoc IMaktubSmartWallet
    function execute(address target, uint256 value, bytes calldata data) external onlyEntryPointOrSelf {
        _call(target, value, data);
    }

    /// @inheritdoc IMaktubSmartWallet
    function executeBatch(Call[] calldata calls) external onlyEntryPointOrSelf {
        uint256 len = calls.length;
        for (uint256 i; i < len; ++i) {
            _call(calls[i].target, calls[i].value, calls[i].data);
        }
    }

    // ──────────────────────────────────────────────
    //  Views
    // ──────────────────────────────────────────────

    /// @inheritdoc IMaktubSmartWallet
    function entryPoint() external pure returns (address) {
        return ENTRY_POINT;
    }

    /// @inheritdoc IMaktubSmartWallet
    function owner() external view returns (bytes32 x, bytes32 y) {
        return (_ownerX, _ownerY);
    }

    /// @inheritdoc IMaktubSmartWallet
    function name() external pure returns (string memory) {
        return "Maktub Smart Wallet v1";
    }

    /// @inheritdoc IMaktubSmartWallet
    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    /// @inheritdoc IMaktubSmartWallet
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return _validateSignature(hash, signature) ? _ERC1271_MAGIC_VALUE : _ERC1271_INVALID;
    }

    // ──────────────────────────────────────────────
    //  Receive
    // ──────────────────────────────────────────────

    /// @notice Accept plain ETH transfers (e.g. funding the counterfactual address).
    receive() external payable {}

    // ──────────────────────────────────────────────
    //  Internal
    // ──────────────────────────────────────────────

    /**
     * @dev Validate a WebAuthn assertion against the stored owner pubkey.
     *      The signature payload is ABI-encoded {WebAuthn.WebAuthnAuth} produced by
     *      the Flutter passkey client (see SMART_WALLET_SPEC §2.3).
     *
     *      The challenge that must appear inside `clientDataJSON` is `hash` itself
     *      (32 raw bytes, base64url-encoded by the WebAuthn library before comparison).
     */
    function _validateSignature(bytes32 hash, bytes calldata signature) internal view returns (bool) {
        // Defensive: a freshly-deployed (uninitialized) clone would otherwise validate
        // signatures against the zero pubkey, which the P-256 lib will reject anyway —
        // but we short-circuit explicitly for clarity and gas.
        if (_ownerX == bytes32(0) && _ownerY == bytes32(0)) return false;

        (bool ok, WebAuthn.WebAuthnAuth calldata auth) = WebAuthn.tryDecodeAuth(signature);
        if (!ok) return false;

        return WebAuthn.verify(abi.encodePacked(hash), auth, _ownerX, _ownerY);
    }

    /**
     * @dev Low-level call helper. Bubbles up the original revert data so that
     *      higher-level callers see precise error reasons instead of a generic
     *      `CallFailed` selector.
     */
    function _call(address target, uint256 value, bytes calldata data) internal {
        (bool success, bytes memory ret) = target.call{value: value}(data);
        if (!success) {
            if (ret.length == 0) revert CallFailed();
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
    }
}
