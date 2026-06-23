// SPDX-License-Identifier: MIT
//
// Maktub Smart Wallet — MaktubSmartWalletFactory.sol
//
// Forked & adapted from Coinbase's CoinbaseSmartWalletFactory.sol
//   https://github.com/coinbase/smart-wallet
// Original © Coinbase Inc. — MIT License (preserved).
//
// Diff vs. upstream:
//   - Single-owner: takes (ownerX, ownerY) instead of `bytes[] owners`.
//   - Uses OpenZeppelin's ERC-1167 `Clones.cloneDeterministic` for the CREATE2
//     proxy deploy (upstream uses the same minimal-proxy pattern, just inlined).
//   - Salt = keccak256(ownerX, ownerY, salt) — binds the address to the pubkey,
//     so the same passkey always yields the same wallet on this factory.
//
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {IMaktubSmartWallet} from "./IMaktubSmartWallet.sol";
import {IMaktubSmartWalletFactory} from "./IMaktubSmartWalletFactory.sol";
import {MaktubSmartWallet} from "./MaktubSmartWallet.sol";

/**
 * @title MaktubSmartWalletFactory
 * @author Maktub Protocol (forked from Coinbase Smart Wallet — © Coinbase, MIT)
 * @notice Deploys {MaktubSmartWallet} clones at deterministic CREATE2 addresses
 *         derived from the user's passkey public key.
 *
 * @dev The implementation is deployed once in the constructor and reused for every
 *      clone. Counterfactual addresses are computable client-side, so the app can
 *      treat the user as having a wallet from the moment a passkey is registered,
 *      with on-chain deployment happening lazily inside the first ERC-4337 UserOp
 *      via the `initCode` field.
 */
contract MaktubSmartWalletFactory is IMaktubSmartWalletFactory {
    /// @notice The MaktubSmartWallet implementation contract every clone delegatecalls to.
    address public immutable implementation;

    /**
     * @notice Deploys a fresh implementation and pins it for the lifetime of this factory.
     */
    constructor() {
        implementation = address(new MaktubSmartWallet());
    }

    /// @inheritdoc IMaktubSmartWalletFactory
    function createAccount(
        bytes32 ownerX,
        bytes32 ownerY,
        uint256 salt
    ) external payable returns (address wallet) {
        if (ownerX == bytes32(0) && ownerY == bytes32(0)) revert InvalidOwnerPubkey();

        bytes32 derivedSalt = _salt(ownerX, ownerY, salt);
        address predicted = Clones.predictDeterministicAddress(implementation, derivedSalt, address(this));

        // If the wallet is already deployed (idempotent semantics expected by ERC-4337
        // bundlers that may retry), simply return its address. Forward any ETH that
        // came with the call so first-deploy funding still works.
        if (predicted.code.length != 0) {
            if (msg.value > 0) {
                (bool ok, ) = payable(predicted).call{value: msg.value}("");
                ok; // silence unused-var warning; failure here just means ETH stays in factory, harmless
            }
            return predicted;
        }

        wallet = Clones.cloneDeterministic(implementation, derivedSalt);
        IMaktubSmartWallet(wallet).initialize(ownerX, ownerY);

        // Forward any ETH the caller sent (e.g. first-deploy funding from the bundler / user).
        if (msg.value > 0) {
            (bool ok, ) = payable(wallet).call{value: msg.value}("");
            ok;
        }

        emit WalletDeployed(wallet, ownerX, ownerY, salt);
    }

    /// @inheritdoc IMaktubSmartWalletFactory
    function predictAddress(bytes32 ownerX, bytes32 ownerY, uint256 salt) external view returns (address wallet) {
        return Clones.predictDeterministicAddress(implementation, _salt(ownerX, ownerY, salt), address(this));
    }

    /**
     * @dev Salt derivation: bind every byte of the owner pubkey + a user-supplied
     *      nonce. Using `salt = 0` for the user's primary wallet makes the address
     *      a pure function of the passkey.
     *
     *      Implemented in inline assembly: write the three 32-byte words directly
     *      to the free memory region and hash in place WITHOUT bumping the free
     *      memory pointer. This avoids the overhead of `abi.encode` (which
     *      allocates a 96-byte buffer, advances the FMP, and only then hashes)
     *      for an ephemeral payload we never read again. Memory-safe per
     *      Solidity's "memory-safe" assembly contract: we touch memory above
     *      the FMP without moving it, so any subsequent Solidity allocation
     *      simply overwrites the transient bytes.
     */
    function _salt(bytes32 ownerX, bytes32 ownerY, uint256 salt) internal pure returns (bytes32 result) {
        assembly ("memory-safe") {
            // Write into the free memory region WITHOUT bumping the free-memory
            // pointer (0x40). Solidity's memory-safe contract allows transient
            // writes past the FMP as long as we don't move it — any future
            // allocation will simply overwrite this scratch data.
            let ptr := mload(0x40)
            mstore(ptr, ownerX)
            mstore(add(ptr, 0x20), ownerY)
            mstore(add(ptr, 0x40), salt)
            result := keccak256(ptr, 0x60)
        }
    }
}
