// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title RecipientRegistry
 * @author Maktub Protocol
 * @notice Immutable registry for recipients and their Proxy Re-Encryption (PRE) public keys.
 *         Recipients must register before they can be assigned to any heartbeat in MaktubCore.
 * @dev This contract is intentionally immutable: no owner, no pause, no proxy, no upgrade path.
 *      Once deployed, the code never changes. Users trust math, not governance.
 */
contract RecipientRegistry {
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @notice PRE public key stored for each registered recipient.
    mapping(address => bytes) private _prePublicKeys;

    /// @notice Whether an address has completed registration.
    mapping(address => bool) private _registered;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a new recipient registers.
    /// @param recipient The address that registered.
    /// @param prePublicKey The PRE public key stored for this recipient.
    event RecipientRegistered(address indexed recipient, bytes prePublicKey);

    /// @notice Emitted when a recipient updates their PRE public key.
    /// @param recipient The address that updated their key.
    /// @param newPrePublicKey The new PRE public key.
    event PrePublicKeyUpdated(address indexed recipient, bytes newPrePublicKey);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when an already-registered address attempts to register again.
    error AlreadyRegistered();

    /// @notice Thrown when a zero-length PRE public key is provided.
    error EmptyPublicKey();

    /// @notice Thrown when caller is not registered (for key updates).
    error NotRegistered();

    // ──────────────────────────────────────────────
    //  External Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Register the caller as a recipient with a PRE public key.
     * @dev Registration is free (gas only). Cannot register twice.
     *      The PRE public key is required for Proxy Re-Encryption so that
     *      payloads can be re-encrypted for this recipient upon heartbeat execution.
     * @param prePublicKey The caller's PRE public key (cannot be empty).
     */
    function register(bytes calldata prePublicKey) external {
        if (_registered[msg.sender]) revert AlreadyRegistered();
        if (prePublicKey.length == 0) revert EmptyPublicKey();

        _registered[msg.sender] = true;
        _prePublicKeys[msg.sender] = prePublicKey;

        emit RecipientRegistered(msg.sender, prePublicKey);
    }

    /**
     * @notice Update the caller's PRE public key.
     * @dev Only callable by an already-registered recipient. Allows key
     *      rotation in case of compromise or initial misconfiguration.
     * @param newPrePublicKey The new PRE public key (cannot be empty).
     */
    function updatePrePublicKey(bytes calldata newPrePublicKey) external {
        if (!_registered[msg.sender]) revert NotRegistered();
        if (newPrePublicKey.length == 0) revert EmptyPublicKey();

        _prePublicKeys[msg.sender] = newPrePublicKey;

        emit PrePublicKeyUpdated(msg.sender, newPrePublicKey);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Check whether an address is registered as a recipient.
     * @param account The address to check.
     * @return True if the address has registered.
     */
    function isRegistered(address account) external view returns (bool) {
        return _registered[account];
    }

    /**
     * @notice Retrieve the PRE public key for a registered recipient.
     * @param account The recipient address.
     * @return The PRE public key bytes. Returns empty bytes if not registered.
     */
    function getPrePublicKey(address account) external view returns (bytes memory) {
        return _prePublicKeys[account];
    }
}
