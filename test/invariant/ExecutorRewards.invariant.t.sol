// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ExecutorRewards} from "../../contracts/v3/governance/ExecutorRewards.sol";
import {IMaktubCore} from "../../contracts/v3/governance/IMaktubCore.sol";
import {MktbToken} from "../../contracts/v3/token/MktbToken.sol";

/// @dev Always-eligible heartbeat: executed, old enough (createdAt=0 + a warped
///      clock), and checked-in once. Lets the fuzzer drive real reward payouts so
///      the solvency invariant is exercised, not vacuously true.
contract MockCoreEligible is IMaktubCore {
    function getHeartbeat(uint256)
        external
        pure
        returns (address, address[] memory, bytes memory, uint256, uint256, uint256, uint256, bool, bool)
    {
        address[] memory r = new address[](0);
        // owner, recipients, payload, interval, lastCheckIn, createdAt, checkInCount, executed, deactivated
        return (address(0), r, "", 0, 0, 0, 1, true, false);
    }
}

/// @dev One staker/executor identity. Stakes and unstakes its own MKTB, and (once
///      active) pulls rewards via distributeReward — it holds CORE_ROLE for that.
///      Reverting branches (under-min, pool exhausted, ...) are swallowed.
contract ExecutorRewardsHandler {
    ExecutorRewards public rewards;
    MktbToken public token;

    constructor(ExecutorRewards _rewards, MktbToken _token) {
        rewards = _rewards;
        token = _token;
        token.approve(address(_rewards), type(uint256).max);
    }

    function stakeSome(uint256 amount) external {
        amount = 1 + (amount % (2_000 ether));
        try rewards.stake(amount) {} catch {}
    }

    function unstakeSome(uint256 amount) external {
        uint256 s = rewards.stakes(address(this));
        if (s == 0) return;
        amount = 1 + (amount % s);
        try rewards.unstake(amount) {} catch {}
    }

    function distribute(uint256 hbId) external {
        try rewards.distributeReward(address(this), hbId) {} catch {}
    }
}

/// @notice ExecutorRewards solvency: staked principal is ALWAYS fully backed by
///         the contract's token balance — reward payouts draw only from the
///         non-staked remainder (`balance - totalStaked`), so they can never eat
///         a staker's principal. Also: cumulative distribution never exceeds the
///         35M pool cap.
contract ExecutorRewardsInvariant is StdInvariant, Test {
    uint256 internal constant MIN_STAKE = 1_000 ether;
    // Reward-per-exec and pool funding are sized so a single invariant run
    // (depth 32 => ~10 distribute calls) can actually push `totalDistributed`
    // to the 35M TOTAL_REWARD_POOL cap: ~7 payouts of 5M reach it, after which
    // the cap-enforcement path (reward -> remaining -> RewardPoolExhausted)
    // engages. POOL_FUNDS exceeds the cap so the pool limit — not the
    // on-contract balance — is the binding constraint. (State resets between
    // runs, so the *deterministic* test_poolCapEnforced… below is the rigorous
    // proof that the cap is reached and enforced; the funding here just lets the
    // fuzzer exercise the same path under random sequences too.)
    uint256 internal constant REWARD_PER_EXEC = 5_000_000 ether;
    uint256 internal constant HANDLER_FUNDS = 10_000_000 ether;
    uint256 internal constant POOL_FUNDS = 36_000_000 ether; // > 35M TOTAL_REWARD_POOL

    MktbToken internal token;
    ExecutorRewards internal rewards;
    MockCoreEligible internal mockCore;
    ExecutorRewardsHandler internal handler;

    function setUp() public {
        token = new MktbToken(address(this)); // test is owner/minter
        rewards = new ExecutorRewards(token, MIN_STAKE, REWARD_PER_EXEC, address(this), address(this));
        mockCore = new MockCoreEligible();
        rewards.setMaktubCore(mockCore);

        handler = new ExecutorRewardsHandler(rewards, token);
        rewards.grantRole(rewards.CORE_ROLE(), address(handler)); // handler may distribute

        token.mint(address(handler), HANDLER_FUNDS); // stake capital
        token.mint(address(rewards), POOL_FUNDS); // reward pool

        // Age the clock past MIN_HEARTBEAT_AGE (7d) so distribute() is eligible;
        // emissionStart is already fixed at deploy above, so rewards still emit.
        vm.warp(block.timestamp + 8 days);

        targetContract(address(handler));
    }

    /// Staked principal is never lent out as rewards.
    function invariant_stakeFullyBacked() public view {
        assertLe(rewards.totalStaked(), token.balanceOf(address(rewards)), "staked principal not fully backed");
    }

    /// Cumulative emissions never exceed the hard pool cap.
    function invariant_distributionWithinPool() public view {
        assertLe(rewards.totalDistributed(), rewards.TOTAL_REWARD_POOL(), "distribution exceeded pool cap");
    }

    /// @notice Deterministic companion to invariant_distributionWithinPool: drive
    ///         distribution PAST the pool cap and prove the cap is (a) reached
    ///         exactly, (b) never exceeded even mid-loop, and (c) hard — the next
    ///         payout reverts RewardPoolExhausted. This removes the reliance on
    ///         the fuzzer happening to reach 35M within a run.
    function test_poolCapEnforcedAndNeverExceeded() public {
        uint256 cap = rewards.TOTAL_REWARD_POOL();

        vm.prank(address(handler));
        rewards.stake(MIN_STAKE); // handler becomes an active executor

        // 5M per payout, 36M funded, 35M cap => ~7 payouts reach the cap.
        bool reached;
        for (uint256 i = 0; i < 50; i++) {
            vm.prank(address(handler));
            try rewards.distributeReward(address(handler), 1) {
                assertLe(rewards.totalDistributed(), cap, "exceeded pool cap mid-loop");
            } catch {
                reached = true; // RewardPoolExhausted once the cap is hit
                break;
            }
        }

        assertTrue(reached, "distribution never exhausted the pool");
        assertEq(rewards.totalDistributed(), cap, "distribution did not reach the pool cap exactly");

        // Cap is hard: any further payout reverts.
        vm.prank(address(handler));
        vm.expectRevert(ExecutorRewards.RewardPoolExhausted.selector);
        rewards.distributeReward(address(handler), 1);
    }
}
