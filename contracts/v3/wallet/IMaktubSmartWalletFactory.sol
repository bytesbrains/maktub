// SPDX-License-Identifier: MIT
//
// Maktub Smart Wallet — IMaktubSmartWalletFactory
// Forked & adapted from Coinbase Smart Wallet (https://github.com/coinbase/smart-wallet)
// Original factory © Coinbase Inc. — MIT License.
//
pragma solidity 0.8.28;

/**
 * @title IMaktubSmartWalletFactory
 * @author Maktub Protocol (forked from Coinbase Smart Wallet)
 * @notice Factory that deploys {MaktubSmartWallet} instances at deterministic
 *         CREATE2 addresses derived from the owner's P-256 public key.
 *
 * @dev The address can be computed off-chain via {getAddress} before the wallet
 *      is deployed on-chain. This is the counterfactual deployment pattern that
 *      lets the app show the user "their wallet" the moment a passkey is created,
 *      with the actual on-chain deployment happening lazily inside the first
 *      ERC-4337 UserOperation (via the `initCode` field).
 */
interface IMaktubSmartWalletFactory {
    /// @notice Emitted when a new wallet is deployed.
    /// @param wallet The address of the freshly-deployed wallet.
    /// @param ownerX P-256 owner pubkey x.
    /// @param ownerY P-256 owner pubkey y.
    /// @param salt   Salt nonce used (allows multiple wallets per pubkey if desired).
    event WalletDeployed(address indexed wallet, bytes32 ownerX, bytes32 ownerY, uint256 salt);

    /// @notice Thrown when a zero P-256 public key is supplied.
    error InvalidOwnerPubkey();

    /**
     * @notice Deploys a new wallet (or returns the existing one) at the deterministic
     *         CREATE2 address derived from `(ownerX, ownerY, salt)`.
     * @param  ownerX P-256 owner pubkey x.
     * @param  ownerY P-256 owner pubkey y.
     * @param  salt   Arbitrary salt nonce; pass 0 for the user's primary wallet.
     * @return wallet The address of the deployed wallet.
     */
    function createAccount(bytes32 ownerX, bytes32 ownerY, uint256 salt) external payable returns (address wallet);

    /**
     * @notice Pure view: compute the address a wallet *would* have if deployed with these parameters.
     *         Always equal to the eventual deployed address; safe to use for receiving ETH before deploy.
     * @dev    Named `predictAddress` (rather than the more conventional `getAddress`) to avoid a
     *         name collision with `ethers.Contract.getAddress()` in ethers v6.
     * @param  ownerX P-256 owner pubkey x.
     * @param  ownerY P-256 owner pubkey y.
     * @param  salt   Salt nonce.
     * @return wallet The deterministic future address.
     */
    function predictAddress(bytes32 ownerX, bytes32 ownerY, uint256 salt) external view returns (address wallet);

    /// @notice The implementation contract that all wallet clones delegatecall into.
    function implementation() external view returns (address);
}
