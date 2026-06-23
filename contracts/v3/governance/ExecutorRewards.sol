// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMaktubCore} from "./IMaktubCore.sol";

/**
 * @title ExecutorRewards
 * @author Maktub Protocol
 * @notice Executor staking and MKTB emission distribution contract.
 *
 *         Executors stake MKTB to participate in heartbeat execution. When an
 *         executor successfully executes a heartbeat, they earn MKTB emissions
 *         from a 35M reward pool distributed over a 10-year halving schedule:
 *
 *         Year 1: ~7M MKTB, Year 2: ~3.5M, Year 3: ~1.75M, ... total ~35M.
 *
 * @dev This contract IS upgradeable via governance (AccessControl roles).
 *      The GOVERNANCE_ROLE can:
 *        - Slash malicious executors (confiscate their stake)
 *        - Update the minimum stake requirement
 *        - Pause/unpause reward distribution
 *
 *      The CORE_ROLE is granted to MaktubCore (or a relay) so that reward
 *      distribution can be triggered on execution.
 *
 *      Emission math uses a per-execution reward derived from the current
 *      halving year's annual allocation divided by an expected execution count.
 *      Governance can tune the per-execution reward within the year's remaining
 *      budget to adapt to actual execution volume.
 */
contract ExecutorRewards is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    /// @notice Role for governance actions (slash, parameter updates).
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    /// @notice Role for MaktubCore or authorized callers to trigger reward distribution.
    bytes32 public constant CORE_ROLE = keccak256("CORE_ROLE");

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Total MKTB allocated to executor rewards (35% of 100M supply).
    uint256 public constant TOTAL_REWARD_POOL = 35_000_000 * 1e18;

    /// @notice Duration of one halving period (365.25 days).
    uint256 public constant HALVING_PERIOD = 365.25 days;

    /// @notice Number of halving periods (10 years).
    uint256 public constant TOTAL_PERIODS = 10;

    /// @notice Year-1 emission allocation (~7M MKTB).
    /// @dev Halving schedule: Y1=7M, Y2=3.5M, Y3=1.75M, ... Y10=~13.6K.
    ///      The halving series sums to ~14M over 10 years. The remaining ~21M
    ///      of the 35M pool is held in reserve and distributed by governance
    ///      via `setRewardPerExecution()` to sustain emissions beyond the
    ///      base halving curve as executor demand scales.
    uint256 public constant YEAR_ONE_EMISSION = 7_000_000 * 1e18;

    /// @notice Minimum heartbeat age (in seconds) before execution earns rewards.
    /// @dev Prevents self-dealing: an attacker cannot create a heartbeat, wait the
    ///      minimum interval, execute it, and earn rewards profitably.
    uint256 public constant MIN_HEARTBEAT_AGE = 7 days;

    /// @notice Minimum number of check-ins a heartbeat must have before execution
    ///         earns rewards. Prevents reward farming with never-used heartbeats.
    uint256 public constant MIN_CHECKINS_FOR_REWARD = 1;

    // ──────────────────────────────────────────────
    //  Immutables
    // ──────────────────────────────────────────────

    /// @notice The MKTB token contract.
    IERC20 public immutable mktbToken;

    /// @notice The MaktubCore contract (for heartbeat validation in reward distribution).
    /// @dev Set after deployment via setMaktubCore() since there is a circular
    ///      dependency: MaktubCore needs ExecutorRewards address, ExecutorRewards needs
    ///      MaktubCore address. ExecutorRewards is deployed first, then MaktubCore,
    ///      then setMaktubCore() is called. UPDATABLE by governance — a one-shot
    ///      setter permanently trapped MaktubCore migration (issue #3): rewards
    ///      validate against `maktubCore.getHeartbeat(id)`, so a redeployed core
    ///      could never be wired in and its executions could never earn.
    IMaktubCore public maktubCore;

    /// @notice Maximum allowed reward per execution (prevents governance drain attacks).
    /// @dev Set to 10x the initial rewardPerExecution at deployment.
    uint256 public immutable maxRewardPerExecution;

    /// @notice Timestamp when emissions begin (contract deployment).
    uint256 public immutable emissionStart;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Minimum MKTB stake required to be an active executor.
    uint256 public minimumStake;

    /// @notice Per-execution reward amount (governance-tunable within year budget).
    uint256 public rewardPerExecution;

    /// @notice Total MKTB distributed to executors so far.
    uint256 public totalDistributed;

    /// @notice Whether reward distribution is paused.
    bool public paused;

    /// @notice Total MKTB currently staked across all executors.
    uint256 public totalStaked;

    /// @notice Executor stake balances.
    mapping(address => uint256) public stakes;

    /// @notice Whether an executor is actively staked (meets minimum).
    mapping(address => bool) public isActiveExecutor;

    /// @notice Total rewards earned by each executor.
    mapping(address => uint256) public rewardsEarned;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event MaktubCoreUpdated(address indexed oldCore, address indexed newCore);
    event ExecutorStaked(address indexed executor, uint256 amount, uint256 totalStake);
    event ExecutorUnstaked(address indexed executor, uint256 amount, uint256 totalStake);
    event RewardDistributed(address indexed executor, uint256 amount);
    event ExecutorSlashed(address indexed executor, uint256 amount, string reason);
    event MinimumStakeUpdated(uint256 oldMinimum, uint256 newMinimum);
    event RewardPerExecutionUpdated(uint256 oldReward, uint256 newReward);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error ZeroAmount();
    error InsufficientStake();
    error ExecutorNotActive();
    error RewardPoolExhausted();
    error ContractPaused();
    error NotPaused();
    error InsufficientStakeBalance();
    error HeartbeatTooYoung();
    error InsufficientCheckIns();
    error HeartbeatNotExecuted();
    error RewardExceedsMax();
    error AdminAlreadyRenounced();
    error MaktubCoreNotSet();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @notice Deploys the ExecutorRewards contract.
     * @param _mktbToken     The MKTB token address.
     * @param _minimumStake  Initial minimum stake required (in MKTB wei).
     * @param _rewardPerExecution Initial reward per execution (in MKTB wei).
     * @param _admin         The address that receives DEFAULT_ADMIN_ROLE.
     * @param _governance    The address that receives GOVERNANCE_ROLE (timelock).
     */
    constructor(
        IERC20 _mktbToken,
        uint256 _minimumStake,
        uint256 _rewardPerExecution,
        address _admin,
        address _governance
    ) {
        require(address(_mktbToken) != address(0), "Token cannot be zero");
        require(_admin != address(0), "Admin cannot be zero");
        require(_governance != address(0), "Governance cannot be zero");

        mktbToken = _mktbToken;
        minimumStake = _minimumStake;
        rewardPerExecution = _rewardPerExecution;
        maxRewardPerExecution = _rewardPerExecution * 10;
        emissionStart = block.timestamp;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(GOVERNANCE_ROLE, _governance);
    }

    /**
     * @notice Set or update the MaktubCore contract address.
     * @dev Callable by DEFAULT_ADMIN_ROLE (initial wiring, before admin is
     *      renounced) or GOVERNANCE_ROLE (later updates via the timelock).
     *      The initial call resolves the circular dependency: ExecutorRewards
     *      is deployed first, then MaktubCore (which references
     *      ExecutorRewards), then this function links back.
     *
     *      Deliberately NOT one-shot (fixes issue #3): MaktubCore ships bug
     *      fixes as new immutable deployments (D-025), and rewards validate
     *      heartbeats against `maktubCore.getHeartbeat(id)` — a frozen
     *      pointer would permanently strand executor rewards on the old
     *      core. Note: heartbeat IDs restart at 0 on a new core, so any
     *      repointing must accompany a full clean-stack migration, never a
     *      mid-flight swap.
     *
     *      MIGRATION CHECKLIST (this function only moves the pointer):
     *      existing CORE_ROLE holders — the old stack's ExecutionRelay in
     *      particular — are NOT automatically revoked, and a stale relay
     *      could keep triggering reward distribution validated against
     *      whatever core this points to. A migration must therefore, in the
     *      same governance batch:
     *        1. revokeRole(CORE_ROLE, <old relay and any old callers>)
     *        2. setMaktubCore(<new core>)
     *        3. grantRole(CORE_ROLE, <new relay>)
     * @param _maktubCore The deployed MaktubCore contract address.
     */
    function setMaktubCore(IMaktubCore _maktubCore) external {
        if (
            !hasRole(DEFAULT_ADMIN_ROLE, msg.sender) &&
            !hasRole(GOVERNANCE_ROLE, msg.sender)
        ) {
            revert AccessControlUnauthorizedAccount(msg.sender, GOVERNANCE_ROLE);
        }
        require(address(_maktubCore) != address(0), "MaktubCore cannot be zero");
        address oldCore = address(maktubCore);
        maktubCore = _maktubCore;
        emit MaktubCoreUpdated(oldCore, address(_maktubCore));
    }

    // ──────────────────────────────────────────────
    //  Executor Staking
    // ──────────────────────────────────────────────

    /**
     * @notice Stake MKTB tokens to become an active executor.
     * @dev Caller must have approved this contract to transfer `amount` MKTB.
     *      Once the stake meets or exceeds `minimumStake`, the executor becomes active.
     * @param amount The amount of MKTB to stake (in wei).
     */
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        mktbToken.safeTransferFrom(msg.sender, address(this), amount);

        stakes[msg.sender] += amount;
        totalStaked += amount;

        if (stakes[msg.sender] >= minimumStake) {
            isActiveExecutor[msg.sender] = true;
        }

        emit ExecutorStaked(msg.sender, amount, stakes[msg.sender]);
    }

    /**
     * @notice Unstake MKTB tokens. If the remaining stake drops below the minimum,
     *         the executor becomes inactive and can no longer earn rewards.
     * @param amount The amount of MKTB to withdraw (in wei).
     */
    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (stakes[msg.sender] < amount) revert InsufficientStakeBalance();

        stakes[msg.sender] -= amount;
        totalStaked -= amount;

        if (stakes[msg.sender] < minimumStake) {
            isActiveExecutor[msg.sender] = false;
        }

        mktbToken.safeTransfer(msg.sender, amount);

        emit ExecutorUnstaked(msg.sender, amount, stakes[msg.sender]);
    }

    // ──────────────────────────────────────────────
    //  Reward Distribution
    // ──────────────────────────────────────────────

    /**
     * @notice Distribute execution reward to an executor.
     * @dev Called by CORE_ROLE (relay) when a heartbeat is executed.
     *      The reward comes from MKTB tokens held by this contract (pre-funded
     *      by the protocol at launch).
     *
     *      Anti-self-dealing: the heartbeat must be at least MIN_HEARTBEAT_AGE
     *      old AND must have at least MIN_CHECKINS_FOR_REWARD check-ins before
     *      execution earns rewards. This prevents the attack where someone
     *      creates a minimal heartbeat, waits the minimum interval, and
     *      executes it themselves to farm rewards.
     *
     *      Emission is bounded by:
     *      1. The total reward pool cap (35M, hard)
     *      2. The contract's actual MKTB balance, excluding staked tokens
     *      3. The 10-year emission window (no rewards after TOTAL_PERIODS)
     *
     *      NOTE: the halving curve (`yearlyEmission`) is NOT enforced
     *      per-year on-chain. It is the budgeting reference that governance
     *      follows when tuning `setRewardPerExecution` (which is itself
     *      hard-capped at `maxRewardPerExecution`). This is deliberate: the
     *      halving series sums to ~14M, and the remaining ~21M of the pool
     *      is reserved for governance to sustain emissions beyond the base
     *      curve as executor demand scales.
     *
     * @param executor    The executor address to reward.
     * @param heartbeatId The heartbeat ID that was executed (for validation).
     */
    function distributeReward(address executor, uint256 heartbeatId) external onlyRole(CORE_ROLE) nonReentrant {
        if (paused) revert ContractPaused();
        if (address(maktubCore) == address(0)) revert MaktubCoreNotSet();
        if (!isActiveExecutor[executor]) revert ExecutorNotActive();

        // Validate heartbeat eligibility for rewards (anti-self-dealing)
        (
            ,           // owner
            ,           // recipients
            ,           // payload
            ,           // interval
            ,           // lastCheckIn
            uint256 createdAt,
            uint256 checkInCount,
            bool executed,
            // deactivated
        ) = maktubCore.getHeartbeat(heartbeatId);

        if (!executed) revert HeartbeatNotExecuted();
        if (block.timestamp - createdAt < MIN_HEARTBEAT_AGE) revert HeartbeatTooYoung();
        if (checkInCount < MIN_CHECKINS_FOR_REWARD) revert InsufficientCheckIns();

        uint256 reward = currentRewardAmount();
        if (reward == 0) revert RewardPoolExhausted();

        // Cap by remaining pool
        uint256 remaining = TOTAL_REWARD_POOL - totalDistributed;
        if (reward > remaining) {
            reward = remaining;
        }

        // Cap by actual balance (exclude staked tokens)
        uint256 balance = mktbToken.balanceOf(address(this)) - totalStaked;
        if (reward > balance) {
            reward = balance;
        }

        if (reward == 0) revert RewardPoolExhausted();

        totalDistributed += reward;
        rewardsEarned[executor] += reward;

        mktbToken.safeTransfer(executor, reward);

        emit RewardDistributed(executor, reward);
    }

    /**
     * @notice The current per-execution reward.
     * @dev Returns the governance-set `rewardPerExecution`, or 0 if the 35M
     *      pool is exhausted or the 10-year emission window has closed. The
     *      halving schedule (`yearlyEmission`) is a budgeting reference for
     *      governance, not an on-chain cap — see `distributeReward`.
     * @return The reward amount in MKTB wei.
     */
    function currentRewardAmount() public view returns (uint256) {
        if (totalDistributed >= TOTAL_REWARD_POOL) return 0;

        uint256 elapsed = block.timestamp - emissionStart;
        uint256 yearIndex = elapsed / HALVING_PERIOD;

        // After 10 years, no more emissions
        if (yearIndex >= TOTAL_PERIODS) return 0;

        // Use the governance-configured reward amount
        return rewardPerExecution;
    }

    /**
     * @notice Get the emission allocation for a given halving year.
     * @dev Year 0 = 7M, Year 1 = 3.5M, Year 2 = 1.75M, etc.
     * @param year The year index (0-based).
     * @return The total emission for that year in MKTB wei.
     */
    function yearlyEmission(uint256 year) public pure returns (uint256) {
        if (year >= TOTAL_PERIODS) return 0;
        return YEAR_ONE_EMISSION >> year; // divide by 2^year
    }

    /**
     * @notice Get the current halving year (0-based).
     * @return The current year index.
     */
    function currentYear() external view returns (uint256) {
        uint256 elapsed = block.timestamp - emissionStart;
        uint256 year = elapsed / HALVING_PERIOD;
        return year >= TOTAL_PERIODS ? TOTAL_PERIODS : year;
    }

    // ──────────────────────────────────────────────
    //  Governance Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Slash a malicious executor's stake.
     * @dev Slashed tokens are sent to the governance address (timelock).
     *      The executor is deactivated regardless of remaining stake.
     * @param executor The executor to slash.
     * @param amount   The amount to confiscate.
     * @param reason   Human-readable reason for the slash (emitted in event).
     */
    function slash(
        address executor,
        uint256 amount,
        string calldata reason
    ) external onlyRole(GOVERNANCE_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (stakes[executor] < amount) revert InsufficientStakeBalance();

        stakes[executor] -= amount;
        totalStaked -= amount;
        isActiveExecutor[executor] = false;

        // Send slashed tokens to governance (msg.sender = timelock)
        mktbToken.safeTransfer(msg.sender, amount);

        emit ExecutorSlashed(executor, amount, reason);
    }

    /**
     * @notice Update the minimum stake requirement.
     * @param newMinimum The new minimum stake in MKTB wei.
     */
    function setMinimumStake(uint256 newMinimum) external onlyRole(GOVERNANCE_ROLE) {
        uint256 oldMinimum = minimumStake;
        minimumStake = newMinimum;
        emit MinimumStakeUpdated(oldMinimum, newMinimum);
    }

    /**
     * @notice Update the per-execution reward amount.
     * @dev Governance should set this based on expected execution volume to stay
     *      within the yearly emission budget. Capped at maxRewardPerExecution
     *      (10x the initial value) to prevent governance drain attacks.
     * @param newReward The new reward per execution in MKTB wei.
     */
    function setRewardPerExecution(uint256 newReward) external onlyRole(GOVERNANCE_ROLE) {
        if (newReward > maxRewardPerExecution) revert RewardExceedsMax();
        uint256 oldReward = rewardPerExecution;
        rewardPerExecution = newReward;
        emit RewardPerExecutionUpdated(oldReward, newReward);
    }

    /**
     * @notice Pause reward distribution (emergency).
     */
    function pause() external onlyRole(GOVERNANCE_ROLE) {
        if (paused) revert ContractPaused();
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpause reward distribution.
     */
    function unpause() external onlyRole(GOVERNANCE_ROLE) {
        if (!paused) revert NotPaused();
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice Renounce DEFAULT_ADMIN_ROLE after initial setup is complete.
     * @dev Should be called after CORE_ROLE has been granted to the relay
     *      contract. After this, no new roles can be granted or revoked
     *      except through governance proposals (if GOVERNANCE_ROLE is held
     *      by the timelock). This eliminates the superuser risk of CR-24.
     */
    function renounceAdmin() external onlyRole(DEFAULT_ADMIN_ROLE) {
        renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Get the remaining reward pool balance.
     * @return The remaining MKTB that can be distributed.
     */
    function remainingRewardPool() external view returns (uint256) {
        if (totalDistributed >= TOTAL_REWARD_POOL) return 0;
        return TOTAL_REWARD_POOL - totalDistributed;
    }

}
