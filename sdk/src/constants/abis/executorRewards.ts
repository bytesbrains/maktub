/** ABI for the ExecutorRewards contract — staking and MKTB emission distribution. */
export const EXECUTOR_REWARDS_ABI = [
  // Errors
  "error ZeroAmount()",
  "error InsufficientStake()",
  "error ExecutorNotActive()",
  "error RewardPoolExhausted()",
  "error ContractPaused()",
  "error NotPaused()",
  "error InsufficientStakeBalance()",
  "error HeartbeatTooYoung()",
  "error InsufficientCheckIns()",
  "error HeartbeatNotExecuted()",
  "error RewardExceedsMax()",
  "error AdminAlreadyRenounced()",
  "error MaktubCoreAlreadySet()",
  "error MaktubCoreNotSet()",

  // Events
  "event ExecutorStaked(address indexed executor, uint256 amount, uint256 totalStake)",
  "event ExecutorUnstaked(address indexed executor, uint256 amount, uint256 totalStake)",
  "event RewardDistributed(address indexed executor, uint256 amount)",
  "event ExecutorSlashed(address indexed executor, uint256 amount, string reason)",
  "event MinimumStakeUpdated(uint256 oldMinimum, uint256 newMinimum)",
  "event RewardPerExecutionUpdated(uint256 oldReward, uint256 newReward)",
  "event Paused(address indexed account)",
  "event Unpaused(address indexed account)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",

  // Staking
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",

  // View functions
  "function stakes(address executor) view returns (uint256)",
  "function isActiveExecutor(address account) view returns (bool)",
  "function rewardsEarned(address executor) view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "function totalDistributed() view returns (uint256)",
  "function minimumStake() view returns (uint256)",
  "function rewardPerExecution() view returns (uint256)",
  "function maxRewardPerExecution() view returns (uint256)",
  "function paused() view returns (bool)",
  "function emissionStart() view returns (uint256)",
  "function mktbToken() view returns (address)",
  "function maktubCore() view returns (address)",
  "function currentRewardAmount() view returns (uint256)",
  "function currentYear() view returns (uint256)",
  "function yearlyEmission(uint256 year) view returns (uint256)",
  "function remainingRewardPool() view returns (uint256)",

  // Constants
  "function TOTAL_REWARD_POOL() view returns (uint256)",
  "function HALVING_PERIOD() view returns (uint256)",
  "function TOTAL_PERIODS() view returns (uint256)",
  "function YEAR_ONE_EMISSION() view returns (uint256)",
  "function MIN_HEARTBEAT_AGE() view returns (uint256)",
  "function MIN_CHECKINS_FOR_REWARD() view returns (uint256)",
  "function GOVERNANCE_ROLE() view returns (bytes32)",
  "function CORE_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",

  // AccessControl
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function renounceRole(bytes32 role, address callerConfirmation)",

  // Admin/Governance
  "function setMaktubCore(address _maktubCore)",
  "function setMinimumStake(uint256 newMinimum)",
  "function setRewardPerExecution(uint256 newReward)",
  "function slash(address executor, uint256 amount, string reason)",
  "function distributeReward(address executor, uint256 heartbeatId)",
  "function pause()",
  "function unpause()",
  "function renounceAdmin()",
] as const;
