// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title IExecutorRewards
 * @notice Interface for ExecutorRewards, used by MaktubCore to validate
 *         that an executor is actively staked before allowing execution.
 */
interface IExecutorRewards {
    /// @notice Check whether an executor is actively staked (meets minimum stake).
    /// @param account The address to check.
    /// @return True if the executor is active (staked and not slashed).
    function isActiveExecutor(address account) external view returns (bool);
}
