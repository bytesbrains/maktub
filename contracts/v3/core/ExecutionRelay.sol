// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IMaktubCoreExecute
 * @notice Minimal interface this relay needs from the immutable MaktubCore.
 */
interface IMaktubCoreExecute {
    function execute(uint256 id) external;
}

/**
 * @title IExecutorRewardsStake
 * @notice Minimal interface this relay needs from ExecutorRewards, including
 *         the one-shot staking surface used by `initialStake()`.
 */
interface IExecutorRewardsStake {
    function distributeReward(address executor, uint256 heartbeatId) external;
    function isActiveExecutor(address account) external view returns (bool);
    function rewardsEarned(address account) external view returns (uint256);
    function stake(uint256 amount) external;
    function minimumStake() external view returns (uint256);
    function mktbToken() external view returns (IERC20);
}

/**
 * @title ExecutionRelay
 * @author Maktub Protocol
 * @notice Periphery contract that couples heartbeat execution to executor
 *         reward distribution, closing launch-blocker #3.
 *
 *         MaktubCore is intentionally immutable and does NOT call
 *         `ExecutorRewards.distributeReward()` itself. Without coupling,
 *         executors earn zero MKTB in practice. This relay is the
 *         minimum-surface fix that requires no change to MaktubCore.
 *
 *         Flow:
 *           operator (staked executor)
 *               -> ExecutionRelay.executeAndReward(id)
 *                   -> MaktubCore.execute(id)        (msg.sender = relay)
 *                   -> ExecutorRewards.distributeReward(operator, id)  (best-effort)
 *
 *         EXECUTION-FIRST, REWARD-BEST-EFFORT. If `execute()` reverts the
 *         whole call reverts. But if the reward leg reverts — heartbeat
 *         younger than MIN_HEARTBEAT_AGE, zero check-ins, rewards paused,
 *         pool exhausted — execution still lands and the reward is simply
 *         skipped (`RewardSkipped` is emitted, the call returns 0).
 *
 *         Rationale: delivery is the protocol's core promise. A heartbeat
 *         created today by someone who goes missing tomorrow has
 *         `checkInCount == 0` and is younger than MIN_HEARTBEAT_AGE — the
 *         anti-self-dealing gates in ExecutorRewards make it permanently
 *         reward-ineligible. Under the previous fully-atomic relay, such a
 *         heartbeat could never be executed through the relay at all: the
 *         exact first-interval scenario the safety-trigger use case exists
 *         for had no incentivized execution path. Reward eligibility must
 *         gate the *reward*, never the *delivery*.
 *
 * @dev IMPORTANT operational requirements (validated below by failing fast):
 *
 *      1. The relay itself must be a staked, active executor in
 *         ExecutorRewards. MaktubCore.execute() checks
 *         `executorRewards.isActiveExecutor(msg.sender)`, and `msg.sender`
 *         is this contract. The relay is staked once at deployment by
 *         the protocol; this is a one-time capital lockup, not per-call.
 *
 *      2. The human/bot operator that calls `executeAndReward` must ALSO
 *         be a staked active executor. The relay checks this explicitly
 *         up front (`NotExecutor`) so that an unstaked caller cannot use
 *         the relay's own stake as a free execution gateway.
 *
 *      3. The relay must be granted `CORE_ROLE` on ExecutorRewards.
 *
 *      Why not collapse into one stake? Because MaktubCore is immutable —
 *      we cannot add an `executeOnBehalfOf(operator, id)` call. The
 *      cleanest atomic coupling we can achieve without modifying
 *      MaktubCore is the dual-stake pattern above.
 *
 * @dev This contract mints NO tokens and has only ONE admin power: the
 *      one-shot `initialStake()` call, after which the admin has no further
 *      authority. The relay briefly holds MKTB between its funding transfer
 *      and the `initialStake()` call; once staked, the MKTB is locked in
 *      ExecutorRewards and the relay holds no further balance.
 *
 *      It is "upgradeable" only in the sense that a newer relay can be
 *      deployed and granted CORE_ROLE; this contract itself is
 *      non-upgradeable, by design, to preserve audit-ability.
 */
contract ExecutionRelay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  Immutables
    // ──────────────────────────────────────────────

    /// @notice The immutable MaktubCore contract this relay drives.
    IMaktubCoreExecute public immutable maktubCore;

    /// @notice The ExecutorRewards contract this relay credits.
    IExecutorRewardsStake public immutable executorRewards;

    /// @notice The deployer/admin allowed to call `initialStake()` exactly once.
    ///         After the one-shot stake, this address has no further authority
    ///         over the contract — the relay remains keyless for all other
    ///         operations.
    address public immutable admin;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Tracks whether `initialStake()` has already been called. Set
    ///         true on first successful invocation; subsequent calls revert.
    bool public staked;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /**
     * @notice Emitted when an execution completes (with or without a reward).
     * @param heartbeatId  The heartbeat that was executed.
     * @param executor     The operator credited with the reward (msg.sender).
     * @param rewardAmount The amount of MKTB credited (delta of rewardsEarned).
     *                     Zero when the reward leg was skipped — see RewardSkipped.
     */
    event ExecutionCompleted(
        uint256 indexed heartbeatId,
        address indexed executor,
        uint256 rewardAmount
    );

    /**
     * @notice Emitted when execution landed but the reward leg reverted.
     * @param heartbeatId The heartbeat that was executed without a reward.
     * @param executor    The operator whose reward was skipped (msg.sender).
     * @param reason      The raw revert data from distributeReward (custom
     *                    error selector + args), for off-chain diagnostics.
     */
    event RewardSkipped(
        uint256 indexed heartbeatId,
        address indexed executor,
        bytes reason
    );

    /**
     * @notice Emitted when the relay's one-shot self-stake completes.
     * @param amount The MKTB amount staked into ExecutorRewards.
     */
    event InitialStakeCompleted(uint256 amount);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when a constructor argument is the zero address.
    error ZeroAddress();

    /// @notice Thrown when a non-admin calls an admin-gated function.
    error NotAdmin();

    /// @notice Thrown when `initialStake()` is called a second time.
    error AlreadyStaked();

    /// @notice Thrown when the relay does not hold enough MKTB to stake.
    error InsufficientBalance();

    /// @notice Thrown when the calling operator is not an active staked executor.
    /// @dev Checked up front so an unstaked caller cannot use the relay's own
    ///      stake as a free execution gateway, and so the failure is explicit
    ///      rather than a skipped reward.
    error NotExecutor();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @notice Wires the relay to the immutable MaktubCore and ExecutorRewards
     *         and records the one-shot admin.
     * @param _maktubCore       The deployed MaktubCore contract.
     * @param _executorRewards  The deployed ExecutorRewards contract.
     * @param _admin            The address allowed to call `initialStake()`
     *                          exactly once. After that single call, the
     *                          admin has no further authority.
     */
    constructor(
        IMaktubCoreExecute _maktubCore,
        IExecutorRewardsStake _executorRewards,
        address _admin
    ) {
        if (address(_maktubCore) == address(0)) revert ZeroAddress();
        if (address(_executorRewards) == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        maktubCore = _maktubCore;
        executorRewards = _executorRewards;
        admin = _admin;
    }

    // ──────────────────────────────────────────────
    //  One-Shot Staking
    // ──────────────────────────────────────────────

    /**
     * @notice One-shot function that approves ExecutorRewards to pull MKTB
     *         from this contract and then stakes `amount` MKTB on the
     *         relay's own behalf. This is the only path by which the relay
     *         becomes an active executor, which is required for
     *         `MaktubCore.execute()` to accept calls from the relay.
     *
     * @dev Requirements:
     *        - caller is `admin` (set once at construction);
     *        - this function has not been called before (`!staked`);
     *        - the relay's MKTB balance is at least `amount`;
     *        - `amount >= executorRewards.minimumStake()` so that the
     *          relay is flipped to `isActiveExecutor = true`.
     *
     *      Once called, `staked` is set to true and all future calls revert.
     *      The admin retains no authority over staked funds — the MKTB is
     *      now locked in ExecutorRewards and can only be released via
     *      governance action (slash) or by this contract calling `unstake`,
     *      which is intentionally not exposed. This is a one-way capital
     *      lockup by design.
     *
     * @param amount The MKTB amount to stake (must be >= minimumStake).
     */
    function initialStake(uint256 amount) external nonReentrant {
        if (msg.sender != admin) revert NotAdmin();
        if (staked) revert AlreadyStaked();

        IERC20 token = executorRewards.mktbToken();
        uint256 balance = token.balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance();

        staked = true;

        // Use forceApprove for robustness against non-standard ERC20s that
        // require allowance to be set to zero before a new non-zero value.
        token.forceApprove(address(executorRewards), amount);
        executorRewards.stake(amount);

        emit InitialStakeCompleted(amount);
    }

    // ──────────────────────────────────────────────
    //  Public Entry Point
    // ──────────────────────────────────────────────

    /**
     * @notice Execute a heartbeat and credit the caller's reward (best-effort).
     * @dev Reverts if the caller is not an active staked executor or if
     *      MaktubCore.execute(id) reverts (timer not expired, already
     *      executed, deactivated, relay not staked, etc.).
     *
     *      Does NOT revert if ExecutorRewards.distributeReward reverts —
     *      heartbeat younger than MIN_HEARTBEAT_AGE, zero check-ins,
     *      rewards paused, pool exhausted. In that case the execution
     *      stands, `RewardSkipped` is emitted, and 0 is returned. Delivery
     *      is the protocol's promise; the reward is an incentive on top.
     *
     *      The CORE_ROLE held by this relay is never used for anything
     *      other than `distributeReward`. The relay holds no MKTB.
     *
     *      Reentrancy: protected by `nonReentrant`. MaktubCore and
     *      ExecutorRewards both have their own `nonReentrant` on the
     *      relevant entry points; this guard is defense in depth in case
     *      a future ExecutorRewards mod (e.g. ERC-777-style hooks during
     *      `safeTransfer`) creates a callback path back into the relay.
     *
     * @param heartbeatId The heartbeat ID to execute and be rewarded for.
     * @return rewardAmount The MKTB amount credited to msg.sender (0 if the
     *                      reward leg was skipped).
     */
    function executeAndReward(uint256 heartbeatId)
        external
        nonReentrant
        returns (uint256 rewardAmount)
    {
        // 0. The operator must be a staked active executor in their own
        //    right. Without this check, an unstaked caller could ride the
        //    relay's stake to execute heartbeats (the reward leg would be
        //    skipped rather than reverting, so it would no longer act as
        //    the access gate the original atomic design relied on).
        if (!executorRewards.isActiveExecutor(msg.sender)) revert NotExecutor();

        // 1. Execute the heartbeat FIRST. msg.sender (here) is the relay.
        //    MaktubCore checks isActiveExecutor(relay) — must be staked.
        //
        //    MaktubCore.execute() is fail-fast on `AlreadyExecuted`, so a
        //    race-loss (another executor already landed) reverts cheaply.
        maktubCore.execute(heartbeatId);

        // 2. Snapshot rewards-earned AFTER a successful execute(), so that
        //    a race-loss never pays for this read. Between here and
        //    `distributeReward` below, `rewardsEarned[msg.sender]` can only
        //    change via `distributeReward`, so the delta is correct.
        uint256 beforeEarned = executorRewards.rewardsEarned(msg.sender);

        // 3. Credit the rewards to the actual operator (msg.sender of THIS
        //    call) — best-effort. Reward-ineligibility must never undo the
        //    execution that already landed in step 1.
        try executorRewards.distributeReward(msg.sender, heartbeatId) {
            rewardAmount = executorRewards.rewardsEarned(msg.sender) - beforeEarned;
        } catch (bytes memory reason) {
            rewardAmount = 0;
            emit RewardSkipped(heartbeatId, msg.sender, reason);
        }

        emit ExecutionCompleted(heartbeatId, msg.sender, rewardAmount);
    }
}
