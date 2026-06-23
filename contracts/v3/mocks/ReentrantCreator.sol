// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MaktubCore} from "../core/MaktubCore.sol";

/**
 * @title ReentrantCreator
 * @notice TEST-ONLY adversary. NOT part of the protocol and never deployed by
 *         any production script — it exists solely so the test suite can prove
 *         that `MaktubCore.createHeartbeat` cannot be re-entered.
 *
 *         `attack()` calls createHeartbeat with excess ETH; the excess refund
 *         lands in `receive()`, from which this contract tries to re-enter
 *         createHeartbeat. MaktubCore's `nonReentrant` guard (plus its
 *         checks-effects-interactions ordering — all state is written before any
 *         external call) must block the nested call, so exactly one heartbeat is
 *         ever created.
 */
contract ReentrantCreator {
    MaktubCore public immutable core;

    bytes32 private _salt;
    address[] private _recipients;
    bytes private _payload;
    uint256 private _interval;

    /// @notice True once the re-entrant call has been attempted from receive().
    bool public reenteredAttempted;

    constructor(MaktubCore _core) {
        core = _core;
    }

    function arm(
        bytes32 salt,
        address[] calldata recipients,
        bytes calldata payload,
        uint256 interval
    ) external {
        _salt = salt;
        _recipients = recipients;
        _payload = payload;
        _interval = interval;
    }

    function attack() external payable {
        core.createHeartbeat{value: msg.value}(_salt, _recipients, _payload, _interval);
    }

    receive() external payable {
        if (!reenteredAttempted) {
            reenteredAttempted = true;
            // Re-enter on the refund with a DISTINCT salt — so if the guard FAILED to
            // block this, it would create a *second* heartbeat (detectable), rather than
            // being masked by the duplicate-ID check. The guard MUST block it first
            // (nonReentrant runs before the body); we swallow the expected revert so the
            // outer call completes and the test can assert exactly one heartbeat exists.
            try
                core.createHeartbeat{value: 0}(
                    keccak256(abi.encode(_salt)),
                    _recipients,
                    _payload,
                    _interval
                )
            {
                // unreachable if the guard works
            } catch {
                // expected: ReentrancyGuardReentrantCall
            }
        }
    }
}
