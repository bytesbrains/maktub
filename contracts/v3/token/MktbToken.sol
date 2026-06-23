// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title MktbToken
 * @author Maktub Protocol
 * @notice The MKTB governance token — ERC-20 with voting power delegation,
 *         gasless approvals (Permit), and burn capability.
 *
 * @dev IMMUTABLE — no admin upgrade path. The owner can mint tokens up to
 *      the hard cap of 100,000,000 MKTB (100M). Once the cap is reached,
 *      no more tokens can ever be minted. The owner can also renounce
 *      ownership at any time, permanently disabling minting.
 *
 *      Token holders must delegate to themselves (or another address) to
 *      activate voting power checkpoints. This is standard ERC20Votes behavior.
 *
 *      Fair launch: no VC, no presale, community-first distribution.
 */
contract MktbToken is ERC20, ERC20Burnable, ERC20Permit, ERC20Votes, Ownable {
    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Maximum supply: 100,000,000 MKTB (100M with 18 decimals).
    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18;

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when a mint would exceed the maximum supply.
    error ExceedsMaxSupply(uint256 requested, uint256 available);

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @notice Deploys the MKTB token.
     * @param initialOwner The address that can mint tokens (up to MAX_SUPPLY).
     *                     This should be a multisig or governance timelock.
     */
    constructor(
        address initialOwner
    )
        ERC20("Maktub", "MKTB")
        ERC20Permit("Maktub")
        Ownable(initialOwner)
    {}

    // ──────────────────────────────────────────────
    //  Minting (Owner Only)
    // ──────────────────────────────────────────────

    /**
     * @notice Mint new MKTB tokens up to the hard cap.
     * @dev Only callable by the owner. Reverts if minting would exceed MAX_SUPPLY.
     *      Once totalSupply() == MAX_SUPPLY, no further minting is possible, ever.
     * @param to   The address to receive the minted tokens.
     * @param amount The number of tokens to mint (in wei, 18 decimals).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        uint256 available = MAX_SUPPLY - totalSupply();
        if (amount > available) {
            revert ExceedsMaxSupply(amount, available);
        }
        _mint(to, amount);
    }

    // ──────────────────────────────────────────────
    //  Required Overrides (Solidity linearization)
    // ──────────────────────────────────────────────

    /// @dev Required override for ERC20 + ERC20Votes _update hook.
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    /// @dev Required override for ERC20Permit + ERC20Votes nonces.
    function nonces(
        address owner_
    ) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner_);
    }
}
