// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {GovernorTimelockControl} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/**
 * @title MktbGovernance
 * @author Maktub Protocol
 * @notice OpenZeppelin Governor for the Maktub Protocol.
 *
 *         Governs upgradeable periphery contracts (ExecutorRewards, future modules)
 *         while the immutable core (MaktubCore, RecipientRegistry, MktbToken) remains
 *         untouchable. All governance proposals execute through a TimelockController
 *         for safety delay.
 *
 *         Default parameters (updatable via governance proposals):
 *         - Voting delay:       1 day  (43,200 blocks on Base @ 2s)
 *         - Voting period:      7 days (302,400 blocks on Base @ 2s)
 *         - Proposal threshold: 100,000 MKTB
 *         - Quorum:             4% of total MKTB supply
 *
 *         NOTE: Block counts are calibrated for Base L2 (~2s blocks). If this
 *         contract is ever deployed on a chain with a different block time
 *         (e.g., Ethereum mainnet @ 12s), the constructor arguments must be
 *         recomputed or the values updated by governance proposal post-deploy.
 *
 * @dev This contract IS upgradeable via governance — GovernorSettings parameters
 *      can be changed through successful proposals executed via the timelock.
 */
contract MktbGovernance is
    Governor,
    GovernorCountingSimple,
    GovernorSettings,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    /**
     * @notice Deploys the MktbGovernance contract.
     * @param _token    The MKTB token (must implement IVotes / ERC20Votes).
     * @param _timelock The TimelockController through which proposals execute.
     */
    constructor(
        IVotes _token,
        TimelockController _timelock
    )
        Governor("MktbGovernance")
        GovernorSettings(
            43_200,                     // votingDelay: ~1 day (43,200 blocks @ 2s on Base)
            302_400,                    // votingPeriod: ~7 days (302,400 blocks @ 2s on Base)
            100_000 * 1e18              // proposalThreshold: 100,000 MKTB
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4)  // 4% quorum
        GovernorTimelockControl(_timelock)
    {}

    // ──────────────────────────────────────────────
    //  Required Overrides (Solidity linearization)
    // ──────────────────────────────────────────────

    function votingDelay()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
        internal
        override(Governor, GovernorTimelockControl)
        returns (uint48)
    {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
        internal
        override(Governor, GovernorTimelockControl)
    {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
        internal
        override(Governor, GovernorTimelockControl)
        returns (uint256)
    {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }
}
