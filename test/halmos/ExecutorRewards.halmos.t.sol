// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ExecutorRewards} from "../../contracts/v3/governance/ExecutorRewards.sol";

/// @notice Halmos symbolic checks (Phase 3 of #6) over ExecutorRewards' reward
///         computation caps. Function args are SYMBOLIC — each `check_` proves
///         its property for every possible value:
///   1. `yearlyEmission` is zero from year TOTAL_PERIODS on, never exceeds the
///      year-one allocation, and halves exactly year over year.
///   2. `setRewardPerExecution` accepts a new reward iff it is at most
///      `maxRewardPerExecution` — the governance-drain hard cap.
///   3. `currentRewardAmount` never exceeds the (capped) `rewardPerExecution`
///      and is zero once the 10-year emission window has closed, at every
///      possible timestamp.
///
/// The stateful accumulation cap (`totalDistributed` never exceeding the 35M
/// pool across call sequences) is covered by the Foundry invariant suite; this
/// layer proves the per-call arithmetic that feeds it.
///
/// Run with `FOUNDRY_PROFILE=halmos halmos` — `check_` functions are ignored
/// by `forge test`.
contract ExecutorRewardsHalmos is Test {
    uint256 internal constant MIN_STAKE = 1000 ether;
    uint256 internal constant REWARD_PER_EXEC = 10 ether;

    ExecutorRewards internal rewards;
    uint256 internal emissionStart;

    function setUp() public {
        // The token is only dereferenced on stake/unstake/distribute paths,
        // none of which these pure/view cap checks touch.
        rewards = new ExecutorRewards(
            IERC20(address(0xBEEF)), MIN_STAKE, REWARD_PER_EXEC, address(this), address(this)
        );
        emissionStart = rewards.emissionStart();
    }

    // ──────────────────────────────────────────────
    //  1. yearlyEmission — halving schedule bounds
    // ──────────────────────────────────────────────

    /// For EVERY year index: zero outside the 10-year window, never above the
    /// year-one allocation inside it, and exactly `YEAR_ONE_EMISSION >> year`.
    function check_yearlyEmission_windowAndCap(uint256 year) public view {
        uint256 emission = rewards.yearlyEmission(year);
        if (year >= rewards.TOTAL_PERIODS()) {
            assertEq(emission, 0, "emission past the window must be 0");
        } else {
            assertEq(emission, rewards.YEAR_ONE_EMISSION() >> year, "emission != Y1 >> year");
            assertLe(emission, rewards.YEAR_ONE_EMISSION(), "emission above year-one allocation");
        }
    }

    /// The schedule halves exactly: each in-window year emits exactly twice the
    /// next (the shift is exact here — YEAR_ONE_EMISSION carries 2^24 as a
    /// factor, far more doublings than TOTAL_PERIODS consumes).
    function check_yearlyEmission_halvesExactly(uint256 year) public view {
        vm.assume(year < rewards.TOTAL_PERIODS() - 1);
        assertEq(rewards.yearlyEmission(year), 2 * rewards.yearlyEmission(year + 1), "halving not exact");
    }

    // ──────────────────────────────────────────────
    //  2. setRewardPerExecution — governance-drain hard cap
    // ──────────────────────────────────────────────

    /// Governance can set EVERY reward up to the cap and NO reward above it;
    /// on success the stored value is exactly what was set.
    function check_setRewardPerExecution_capExact(uint256 newReward) public {
        (bool ok,) = address(rewards).call(abi.encodeCall(rewards.setRewardPerExecution, (newReward)));
        assertEq(ok, newReward <= rewards.maxRewardPerExecution(), "cap gate not exact");
        if (ok) {
            assertEq(rewards.rewardPerExecution(), newReward, "stored reward != set reward");
        }
    }

    /// The deploy-time cap is 10x the initial per-execution reward.
    function check_maxReward_isTenXInitial() public view {
        assertEq(rewards.maxRewardPerExecution(), REWARD_PER_EXEC * 10, "cap != 10x initial");
    }

    // ──────────────────────────────────────────────
    //  3. currentRewardAmount — window + bound at every timestamp
    // ──────────────────────────────────────────────

    /// At EVERY timestamp from deployment on: the per-execution reward never
    /// exceeds the governance-set (hard-capped) value, and is zero once the
    /// 10-year window has closed.
    function check_currentReward_windowAndBound(uint256 ts) public {
        vm.assume(ts >= emissionStart);
        vm.warp(ts);
        uint256 reward = rewards.currentRewardAmount();
        assertLe(reward, rewards.rewardPerExecution(), "reward above configured amount");
        if ((ts - emissionStart) / rewards.HALVING_PERIOD() >= rewards.TOTAL_PERIODS()) {
            assertEq(reward, 0, "reward paid past the emission window");
        } else {
            assertEq(reward, rewards.rewardPerExecution(), "in-window reward != configured amount");
        }
    }

    /// Combined cap: whatever governance sets (gate proven above), the reward
    /// visible at any in-window timestamp never exceeds maxRewardPerExecution.
    function check_currentReward_neverAboveHardCap(uint256 newReward, uint256 ts) public {
        vm.assume(newReward <= rewards.maxRewardPerExecution());
        rewards.setRewardPerExecution(newReward);
        vm.assume(ts >= emissionStart);
        vm.warp(ts);
        assertLe(rewards.currentRewardAmount(), rewards.maxRewardPerExecution(), "reward above hard cap");
    }
}
