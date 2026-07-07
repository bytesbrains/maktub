// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MktbToken} from "../../contracts/v3/token/MktbToken.sol";

/// @dev Owns the token and forwards fuzzed mints. The fuzzer drives this, not
///      the token directly, so every mint goes through the real `onlyOwner`
///      path. A mint that would exceed the cap reverts (ExceedsMaxSupply) —
///      with invariant.fail_on_revert=false that call is simply skipped, which
///      is exactly the behaviour under test: the cap can never be crossed.
contract MktbTokenMintHandler {
    MktbToken public immutable token;

    constructor(MktbToken _token) {
        token = _token;
    }

    function mint(address to, uint256 amount) external {
        if (to == address(0)) to = address(0xBEEF);
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
