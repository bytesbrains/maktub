// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MktbToken} from "../../contracts/v3/token/MktbToken.sol";

/// @dev Owns the token and forwards fuzzed mints. The fuzzer drives this, not
///      the token directly, so every mint goes through the real `onlyOwner`
///      path. `amount` is bounded to `[1, 1.25*available]` where `available =
///      MAX_SUPPLY - totalSupply`: most mints therefore LAND (walking supply up
///      toward the cap, so the boundary is actually explored), while the top
///      ~20% of the range still exceeds `available` and REVERTS (ExceedsMaxSupply,
///      skipped under fail_on_revert=false) — so the contract's own cap guard is
///      exercised too. If a bad mint ever slipped past the cap, the top-level
///      `assertLe(totalSupply, MAX_SUPPLY)` would catch it after the call.
contract MktbTokenMintHandler {
    MktbToken public immutable token;

    constructor(MktbToken _token) {
        token = _token;
    }

    function mint(address to, uint256 amount) external {
        if (to == address(0)) to = address(0xBEEF);
        uint256 available = token.MAX_SUPPLY() - token.totalSupply();
        if (available == 0) return; // at the cap — nothing left to explore
        amount = 1 + (amount % (available + (available / 4) + 1));
        token.mint(to, amount);
    }
}

/// @notice Invariant: MKTB total supply can NEVER exceed the 100M hard cap,
///         under any sequence of mints. This is the "no infinite mint"
///         guarantee the token model rests on.
contract MktbTokenInvariant is StdInvariant, Test {
    MktbToken internal token;
    MktbTokenMintHandler internal handler;

    function setUp() public {
        token = new MktbToken(address(this)); // test is initial owner
        handler = new MktbTokenMintHandler(token);
        token.transferOwnership(address(handler)); // handler can now mint
        targetContract(address(handler));
    }

    function invariant_supplyNeverExceedsCap() public view {
        assertLe(token.totalSupply(), token.MAX_SUPPLY());
    }
}
