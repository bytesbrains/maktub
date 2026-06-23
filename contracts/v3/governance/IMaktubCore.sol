// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title IMaktubCore
 * @notice Interface for MaktubCore, used by ExecutorRewards to validate
 *         heartbeat eligibility for reward distribution (anti-self-dealing).
 */
interface IMaktubCore {
    /// @notice Retrieve heartbeat data needed for reward validation.
    function getHeartbeat(uint256 id)
        external
        view
        returns (
            address owner,
            address[] memory recipients,
            bytes memory payload,
            uint256 interval,
            uint256 lastCheckIn,
            uint256 createdAt,
            uint256 checkInCount,
            bool executed,
            bool deactivated
        );
}
