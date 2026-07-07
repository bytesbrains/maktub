// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MaktubCore} from "../../contracts/v3/core/MaktubCore.sol";
import {RecipientRegistry} from "../../contracts/v3/core/RecipientRegistry.sol";
import {IExecutorRewards} from "../../contracts/v3/core/IExecutorRewards.sol";

/// @dev Executor-eligibility stand-in with a toggle, so the symbolic checks can
///      prove the execute() gate separately for the staked-executor fast path
///      (active = true) and the permissionless post-grace backstop (active = false).
contract ToggleExecutorRewards is IExecutorRewards {
    bool public active;

    function setActive(bool a) external {
        active = a;
    }

    function isActiveExecutor(address) external view returns (bool) {
        return active;
    }
}

/// @notice Halmos symbolic checks (Phase 3 of #6) over MaktubCore's trickiest
///         arithmetic and branching. Function args are SYMBOLIC — each `check_`
///         proves its property for every possible value, not a fuzzed sample:
///   1. `creationFeeFor` equals the committed curve `base + (n-1)*perAddl` on
///      the whole valid domain and reverts on a zero count (D-022/D-023).
///   2. The execute() timer gate is exact at both boundaries: an active executor
///      may execute iff `ts > expiry`; anyone else iff `ts > expiry + GRACE`.
///   3. The expiry views agree on the same boundary semantics (`isExpired` is
///      strict `>`; `timeRemaining` hits 0 already at `ts == expiry`).
///   4. `_page` (via the paged discovery views) returns exactly
///      `arr[start : min(start+count, len)]` for all non-overflowing inputs,
///      and reverts (checked overflow) when `start < len` and `start + count`
///      wraps — pinned, see `check_ownerBeatsPaged_overflowPinned`.
///
/// Run with `FOUNDRY_PROFILE=halmos halmos` — `check_` functions are ignored
/// by `forge test`.
contract MaktubCoreHalmos is Test {
    uint256 internal constant BASE_FEE = 124_000_000_000_000;
    uint256 internal constant PER_ADDL = 40_000_000_000_000;
    address internal constant FEE_RECEIVER = address(0xFEE);
    uint256 internal constant BEATS = 3;

    MaktubCore internal core;
    RecipientRegistry internal registry;
    ToggleExecutorRewards internal rewards;

    uint256[] internal beatIds; // BEATS beats owned by this contract, creation order
    uint256 internal beatId; // beatIds[0] — subject of the expiry checks
    uint256 internal lastCheckIn; // its creation timestamp
    uint256 internal interval; // its check-in interval

    function setUp() public {
        registry = new RecipientRegistry();
        rewards = new ToggleExecutorRewards();
        core = new MaktubCore(BASE_FEE, PER_ADDL, payable(FEE_RECEIVER), registry, rewards);

        address recipient = address(0x1001);
        vm.prank(recipient);
        registry.register(abi.encodePacked(uint8(0x02), bytes32(uint256(1))));

        address[] memory recips = new address[](1);
        recips[0] = recipient;
        interval = core.MIN_INTERVAL();
        lastCheckIn = block.timestamp;

        vm.deal(address(this), 1 ether);
        for (uint256 i = 0; i < BEATS; i++) {
            uint256 id = core.createHeartbeat{value: core.creationFeeFor(1)}(
                keccak256(abi.encode(i)), recips, hex"01", interval
            );
            beatIds.push(id);
        }
        beatId = beatIds[0];
    }

    // ──────────────────────────────────────────────
    //  1. creationFeeFor — the committed fee curve
    // ──────────────────────────────────────────────

    /// For EVERY valid recipient count the fee is exactly the committed curve.
    function check_creationFee_matchesCommittedCurve(uint256 n) public view {
        vm.assume(n >= 1 && n <= core.MAX_RECIPIENTS());
        assertEq(core.creationFeeFor(n), BASE_FEE + (n - 1) * PER_ADDL, "fee != base + (n-1)*perAddl");
    }

    /// A zero recipient count always reverts (NoRecipients) — the `n - 1`
    /// underflow branch is unreachable.
    function check_creationFee_zeroCountReverts() public view {
        (bool ok,) = address(core).staticcall(abi.encodeCall(core.creationFeeFor, (0)));
        assertFalse(ok, "creationFeeFor(0) must revert");
    }

    // ──────────────────────────────────────────────
    //  2. execute() — expiry and expiry+GRACE boundaries
    // ──────────────────────────────────────────────
    // State isolation: every check_ function starts from the post-setUp
    // baseline, and paths within a check are independent forks — so the
    // `executed = true` write on a successful-execute path never leaks into
    // the timer-gate reasoning of another path or check. If halmos ever
    // weakened that isolation, these gate proofs would need one fresh beat
    // per check.

    /// An ACTIVE executor can execute exactly when `ts > expiry` — never at or
    /// before expiry, always after (for every possible timestamp).
    function check_execute_executorGateExactAtExpiry(uint256 ts) public {
        rewards.setActive(true);
        vm.warp(ts);
        (bool ok,) = address(core).call(abi.encodeCall(core.execute, (beatId)));
        assertEq(ok, ts > lastCheckIn + interval, "executor gate not exact at expiry");
    }

    /// A NON-executor can execute exactly when `ts > expiry + EXECUTION_GRACE` —
    /// the permissionless backstop opens at that boundary and never before (#222).
    function check_execute_publicGateExactAtGrace(uint256 ts) public {
        rewards.setActive(false);
        vm.warp(ts);
        (bool ok,) = address(core).call(abi.encodeCall(core.execute, (beatId)));
        assertEq(ok, ts > lastCheckIn + interval + core.EXECUTION_GRACE(), "public gate not exact at expiry+GRACE");
    }

    // ──────────────────────────────────────────────
    //  3. Expiry views — boundary semantics
    // ──────────────────────────────────────────────

    /// `isExpired` / `isExpiredAndActive` are strict (`ts > expiry`), while
    /// `timeRemaining` returns 0 already AT expiry (`ts >= expiry`) — the two
    /// deliberately differ at exactly `ts == expiry`, pinned here.
    function check_expiryViews_boundarySemantics(uint256 ts) public {
        vm.warp(ts);
        uint256 expiry = lastCheckIn + interval;
        assertEq(core.isExpired(beatId), ts > expiry, "isExpired must be strict >");
        assertEq(core.isExpiredAndActive(beatId), ts > expiry, "active beat: isExpiredAndActive == isExpired");
        assertEq(core.timeRemaining(beatId), ts >= expiry ? 0 : expiry - ts, "timeRemaining boundary at >=");
    }

    // ──────────────────────────────────────────────
    //  4. Pagination — _page bounds via the discovery views
    // ──────────────────────────────────────────────
    // Halmos cannot allocate a memory array whose LENGTH is a symbolic value
    // (solc zeroes it with a symbolic-size calldatacopy), so a single fully
    // symbolic (start, count) check is not executable. Instead the (start,
    // count) plane is split into four regions that TOGETHER cover it
    // completely, each shaped so the page length is concrete on every path:
    //   A. no clamp     start + count <= len            (symbolic start × each concrete count)
    //   B. tail clamp   start < len < start + count     (each concrete start × symbolic count)
    //   C. past end     start >= len                    (fully symbolic)
    //   D. overflow     start < len, start+count wraps  (fully symbolic, pinned revert)

    /// Region A: whenever the requested window fits, the page is EXACTLY
    /// `ids[start : start+count]` — right length, right elements — for every
    /// start (count enumerated 0..len, which exhausts this region).
    function check_ownerBeatsPaged_noClampRegion(uint256 start) public view {
        for (uint256 c = 0; c <= BEATS; c++) {
            // Overflow-safe form of `start + c > BEATS` (c <= BEATS, so the
            // subtraction can't underflow): a checked `start + c` would revert
            // for start near 2^256, handing the solver an artifact path that
            // belongs to regions C/D, not here.
            if (start > BEATS - c) continue;
            uint256[] memory page = core.getOwnerBeatsPaged(address(this), start, c);
            assertEq(page.length, c, "unclamped page length != count");
            for (uint256 i = 0; i < c; i++) {
                assertEq(page[i], beatIds[start + i], "page element != ids[start+i]");
            }
        }
    }

    /// Region B: whenever the window runs past the end, the page is EXACTLY
    /// the tail `ids[start : len]` — for every non-overflowing count (start
    /// enumerated 0..len-1, which exhausts this region).
    function check_ownerBeatsPaged_clampRegion(uint256 count) public view {
        for (uint256 s = 0; s < BEATS; s++) {
            if (count <= BEATS - s) continue;
            if (count > type(uint256).max - s) continue; // region D, pinned below
            uint256[] memory page = core.getOwnerBeatsPaged(address(this), s, count);
            assertEq(page.length, BEATS - s, "clamped page length != len-start");
            for (uint256 i = 0; i < BEATS - s; i++) {
                assertEq(page[i], beatIds[s + i], "clamped page element != ids[start+i]");
            }
        }
    }

    /// Region C: a start at or past the end always yields an empty page,
    /// for every (start, count).
    function check_ownerBeatsPaged_pastEndEmpty(uint256 start, uint256 count) public view {
        vm.assume(start >= BEATS);
        assertEq(core.getOwnerBeatsPaged(address(this), start, count).length, 0, "page past end must be empty");
    }

    /// Region D, pinned behaviour: when `start < len`, a `count` so large that
    /// `start + count` overflows makes the view revert (checked arithmetic in
    /// `_page`) instead of clamping to the tail. Callers page with sane counts,
    /// so this is a documented wart, not a fix — the contract is immutable.
    function check_ownerBeatsPaged_overflowPinned(uint256 start, uint256 count) public view {
        vm.assume(start < BEATS);
        vm.assume(count > type(uint256).max - start);
        (bool ok,) = address(core).staticcall(abi.encodeCall(core.getOwnerBeatsPaged, (address(this), start, count)));
        assertFalse(ok, "start+count overflow is expected to revert");
    }

    /// The inbox view shares `_page`; prove its bounds independently anyway
    /// (past-end empty for all inputs, tail clamp for all counts) so a future
    /// divergence between the two views is caught.
    function check_inboxBeatsPaged_bounds(uint256 count) public view {
        address recipient = address(0x1001);
        uint256 len = core.inboxCount(recipient); // == BEATS (sole recipient of each)
        assertEq(core.getInboxBeatsPaged(recipient, len + 1, count).length, 0, "inbox page past end must be empty");
        if (count > len) {
            assertEq(core.getInboxBeatsPaged(recipient, 0, count).length, len, "inbox tail clamp");
        }
    }
}
