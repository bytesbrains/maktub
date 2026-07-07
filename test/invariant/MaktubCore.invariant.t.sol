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
    bytes32[] public usedSalts; // parallel to ids: the salt each beat was created with
    mapping(uint256 => bool) public everExecuted;
    mapping(uint256 => bool) public everDeactivated;
    uint256 internal saltNonce;

    /// @dev Set true iff re-creating a beat with an already-used (creator, salt)
    ///      ever SUCCEEDS. It must always stay false — the second create must
    ///      revert HeartbeatAlreadyExists, proving id collisions can't overwrite.
    bool public collisionDetected;

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
        // Rotating window over the pool: `count` distinct, registered recipients
        // starting at a seed-derived offset, so different recipients land in the
        // discovery index across beats (exercises the recipient-index invariants).
        uint256 count = (rSeed % pool.length) + 1; // 1..pool.length
        uint256 offset = (rSeed / 7) % pool.length;
        recips = new address[](count);
        for (uint256 i = 0; i < count; i++) recips[i] = pool[(offset + i) % pool.length];
    }

    function createBeat(uint256 rSeed, uint256 interval) external {
        address[] memory recips = _recips(rSeed);
        bytes32 salt = keccak256(abi.encode(saltNonce++));
        uint256 fee = core.creationFeeFor(recips.length);
        try core.createHeartbeat{value: fee}(salt, recips, hex"01", _boundInterval(interval)) returns (uint256 id) {
            ids.push(id);
            usedSalts.push(salt);
        } catch {}
    }

    /// @dev Re-submit a previously-used salt (same creator). The derived id already
    ///      exists, so this MUST revert HeartbeatAlreadyExists; if it ever returns
    ///      an id instead, the collision guard is broken and we flag it.
    function attemptDuplicate(uint256 seed) external {
        if (usedSalts.length == 0) return;
        bytes32 salt = usedSalts[seed % usedSalts.length];
        address[] memory recips = _recips(seed);
        uint256 fee = core.creationFeeFor(recips.length);
        try core.createHeartbeat{value: fee}(salt, recips, hex"02", core.MIN_INTERVAL()) returns (uint256) {
            collisionDetected = true;
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
///   4. Beat ids are exactly `keccak256(creator, salt)` and a reused (creator,
///      salt) can never overwrite an existing beat (collision-proof ids, D-038).
///   5. The recipient discovery index is de-duplicated (a beat appears at most
///      once per recipient) and never misses a current recipient.
contract MaktubCoreInvariant is StdInvariant, Test {
    uint256 internal constant BASE_FEE = 124_000_000_000_000;
    uint256 internal constant PER_ADDL = 40_000_000_000_000;
    address internal constant FEE_RECEIVER = address(0xFEE);
    uint256 internal constant POOL_N = 5;

    MaktubCore internal core;
    RecipientRegistry internal registry;
    MockExecutorRewards internal rewards;
    MaktubCoreHandler internal handler;
    address[] internal pool;

    function setUp() public {
        registry = new RecipientRegistry();
        rewards = new MockExecutorRewards();
        core = new MaktubCore(BASE_FEE, PER_ADDL, payable(FEE_RECEIVER), registry, rewards);

        for (uint256 i = 0; i < POOL_N; i++) {
            address r = address(uint160(0x1000 + i));
            pool.push(r);
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

    /// Every id equals keccak256(creator, salt) — content-addressed, not enumerable (D-038).
    function invariant_idDerivation() public view {
        uint256 n = handler.idsLength();
        for (uint256 i = 0; i < n; i++) {
            uint256 expected = uint256(keccak256(abi.encode(address(handler), handler.usedSalts(i))));
            assertEq(handler.ids(i), expected, "id != keccak256(creator, salt)");
        }
    }

    /// Re-using a (creator, salt) never overwrites an existing beat.
    function invariant_noIdCollision() public view {
        assertFalse(handler.collisionDetected(), "reused salt overwrote an existing beat");
    }

    /// The discovery index holds each beat at most once per recipient (dedup).
    function invariant_recipientIndexNoDuplicates() public view {
        for (uint256 p = 0; p < pool.length; p++) {
            uint256[] memory inbox = core.getInboxBeats(pool[p]);
            for (uint256 a = 0; a < inbox.length; a++) {
                for (uint256 b = a + 1; b < inbox.length; b++) {
                    assertTrue(inbox[a] != inbox[b], "recipient index contains a duplicate id");
                }
            }
        }
    }

    /// A current recipient of a beat is always discoverable via its inbox index
    /// (the index may carry stale removed recipients, but never misses a live one).
    function invariant_recipientIndexNoMiss() public view {
        uint256 n = handler.idsLength();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.ids(i);
            (, address[] memory recips, , , , , , , ) = core.getHeartbeat(id);
            for (uint256 j = 0; j < recips.length; j++) {
                assertTrue(_inboxContains(recips[j], id), "current recipient missing from discovery index");
            }
        }
    }

    function _inboxContains(address r, uint256 id) internal view returns (bool) {
        uint256[] memory inbox = core.getInboxBeats(r);
        for (uint256 k = 0; k < inbox.length; k++) {
            if (inbox[k] == id) return true;
        }
        return false;
    }
}
