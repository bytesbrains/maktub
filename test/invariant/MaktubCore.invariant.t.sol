// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {CommonBase} from "forge-std/Base.sol";
import {MaktubCore} from "../../contracts/v3/core/MaktubCore.sol";
import {RecipientRegistry} from "../../contracts/v3/core/RecipientRegistry.sol";
import {IExecutorRewards} from "../../contracts/v3/core/IExecutorRewards.sol";

/// @dev Minimal ExecutorRewards stand-in: every caller is an active executor, so
///      the handler can drive execute() on the rewarded fast path right at expiry
///      (this suite is about MaktubCore's own state machine, not the reward gate).
contract MockExecutorRewards is IExecutorRewards {
    function isActiveExecutor(address) external pure returns (bool) {
        return true;
    }
}

/// @dev Drives the full Beat lifecycle with fuzzed inputs. Every call is the beat
///      owner (this handler created them), so owner-gated ops are authorised;
///      execute() is allowed via the mock rewards above. Reverting branches are
///      swallowed so the fuzzer keeps exploring; ghost mappings record the terminal
///      transitions the invariants then check never unwind.
contract MaktubCoreHandler is CommonBase {
    MaktubCore public core;
    RecipientRegistry public registry;
    address[] public pool; // registered recipients

    uint256[] public ids;
    mapping(uint256 => bool) public everExecuted;
    mapping(uint256 => bool) public everDeactivated;
    uint256 internal saltNonce;

    constructor(MaktubCore _core, RecipientRegistry _registry, address[] memory _pool) {
        core = _core;
        registry = _registry;
        pool = _pool;
    }

    receive() external payable {}

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function _pick(uint256 seed) internal view returns (uint256 id, bool ok) {
        if (ids.length == 0) return (0, false);
        return (ids[seed % ids.length], true);
    }

    function _boundInterval(uint256 x) internal view returns (uint256) {
        uint256 lo = core.MIN_INTERVAL();
        uint256 hi = core.MAX_INTERVAL();
        return lo + (x % (hi - lo + 1));
    }

    function _recips(uint256 rSeed) internal view returns (address[] memory recips) {
        uint256 count = (rSeed % pool.length) + 1; // 1..pool.length, all distinct + registered
        recips = new address[](count);
        for (uint256 i = 0; i < count; i++) recips[i] = pool[i];
    }

    function createBeat(uint256 rSeed, uint256 interval) external {
        address[] memory recips = _recips(rSeed);
        bytes32 salt = keccak256(abi.encode(saltNonce++));
        uint256 fee = core.creationFeeFor(recips.length);
        try core.createHeartbeat{value: fee}(salt, recips, hex"01", _boundInterval(interval)) returns (uint256 id) {
            ids.push(id);
        } catch {}
    }

    function checkIn(uint256 seed) external {
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        try core.checkIn(id) {} catch {}
    }

    function executeBeat(uint256 seed) external {
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        (, , , uint256 interval, uint256 lastCheckIn, , , , ) = core.getHeartbeat(id);
        uint256 expiry = lastCheckIn + interval;
        if (block.timestamp <= expiry) vm.warp(expiry + 1);
        try core.execute(id) {
            everExecuted[id] = true;
        } catch {}
    }

    function deactivateBeat(uint256 seed) external {
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        try core.deactivate(id) {
            everDeactivated[id] = true;
        } catch {}
    }

    function updateRecipients(uint256 seed, uint256 rSeed) external {
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        try core.updateRecipients(id, _recips(rSeed)) {} catch {}
    }

    function updateInterval(uint256 seed, uint256 interval) external {
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        try core.updateInterval(id, _boundInterval(interval)) {} catch {}
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + (dt % 400 days) + 1);
    }
}

/// @notice Invariants for MaktubCore's Beat state machine:
///   1. `executed` is terminal — once a Beat executes it stays executed and is
///      never again eligible for execution (one-shot delivery).
///   2. `deactivated` is terminal — once deactivated it stays deactivated.
///   3. The contract custodies no ETH — every creation fee is forwarded and any
///      excess refunded, so its balance is always zero.
contract MaktubCoreInvariant is StdInvariant, Test {
    uint256 internal constant BASE_FEE = 124_000_000_000_000;
    uint256 internal constant PER_ADDL = 40_000_000_000_000;
    address internal constant FEE_RECEIVER = address(0xFEE);

    MaktubCore internal core;
    RecipientRegistry internal registry;
    MockExecutorRewards internal rewards;
    MaktubCoreHandler internal handler;

    function setUp() public {
        registry = new RecipientRegistry();
        rewards = new MockExecutorRewards();
        core = new MaktubCore(BASE_FEE, PER_ADDL, payable(FEE_RECEIVER), registry, rewards);

        address[] memory pool = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            address r = address(uint160(0x1000 + i));
            pool[i] = r;
            vm.prank(r);
            registry.register(abi.encodePacked(uint8(0x02), bytes32(uint256(i + 1))));
        }

        handler = new MaktubCoreHandler(core, registry, pool);
        vm.deal(address(handler), 100 ether);
        targetContract(address(handler));
    }

    function invariant_coreHoldsNoEth() public view {
        assertEq(address(core).balance, 0, "core must never custody ETH");
    }

    function invariant_executedIsTerminal() public view {
        uint256 n = handler.idsLength();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.ids(i);
            if (!handler.everExecuted(id)) continue;
            (, , , , , , , bool executed, ) = core.getHeartbeat(id);
            assertTrue(executed, "executed unwound to false");
            assertFalse(core.isExpiredAndActive(id), "executed beat still eligible");
        }
    }

    function invariant_deactivatedIsTerminal() public view {
        uint256 n = handler.idsLength();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.ids(i);
            if (!handler.everDeactivated(id)) continue;
            (, , , , , , , , bool deactivated) = core.getHeartbeat(id);
            assertTrue(deactivated, "deactivated unwound to false");
        }
    }
}
