// Maktub Protocol — Hardhat Ignition Deployment Module
// Deploys all 5 v3 contracts + OZ TimelockController with proper dependency ordering,
// role assignments, and initial token distribution (100M MKTB).
//
// Required module parameters (pass via --parameters or ignition config):
//   - feeReceiver:    address to receive protocol creation fees
//   - liquidityAddr:  address for 15M MKTB liquidity allocation
//   - teamAddr:       address for 12M MKTB team allocation
//   - grantsAddr:     address for 10M MKTB ecosystem grants allocation
//   - launchFundAddr: address for 3M MKTB launch fund allocation
//
// Optional:
//   - creationFee:    heartbeat creation fee in wei (default below)

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

// --- Token distribution constants (18 decimals) ---
const DECIMALS = 18n;
const toWei = (amount) => BigInt(amount) * 10n ** DECIMALS;

const EXECUTOR_REWARDS_AMOUNT = toWei(35_000_000); // 35M — executor reward pool
const TREASURY_AMOUNT = toWei(25_000_000);          // 25M — community treasury (DAO)
const LIQUIDITY_AMOUNT = toWei(15_000_000);          // 15M — liquidity
const TEAM_AMOUNT = toWei(12_000_000);               // 12M — team (4yr vest)
const GRANTS_AMOUNT = toWei(10_000_000);             // 10M — ecosystem grants
const LAUNCH_FUND_AMOUNT = toWei(3_000_000);         // 3M  — launch fund
// Total: 100M MKTB

// --- Timelock delay: 48 hours ---
const TIMELOCK_DELAY = 48n * 60n * 60n; // 172800 seconds

// --- Default creation fee: 0.000124 ETH ---
const DEFAULT_CREATION_FEE = 124000000000000n; // 0.000124 ETH in wei

// --- ExecutorRewards initial parameters ---
const INITIAL_MINIMUM_STAKE = toWei(1000);    // 1,000 MKTB minimum stake
const INITIAL_REWARD_PER_EXEC = toWei(100);   // 100 MKTB per execution (Year 1)

module.exports = buildModule("Maktub", (m) => {
  // ─────────────────────────────────────────────
  //  Module Parameters
  // ─────────────────────────────────────────────

  const deployer = m.getAccount(0);

  const feeReceiver = m.getParameter("feeReceiver", deployer);
  const liquidityAddr = m.getParameter("liquidityAddr");
  const teamAddr = m.getParameter("teamAddr");
  const grantsAddr = m.getParameter("grantsAddr");
  const launchFundAddr = m.getParameter("launchFundAddr");
  const creationFee = m.getParameter("creationFee", DEFAULT_CREATION_FEE);

  // ─────────────────────────────────────────────
  //  1. RecipientRegistry (no dependencies)
  // ─────────────────────────────────────────────

  const recipientRegistry = m.contract("RecipientRegistry", [], {
    id: "RecipientRegistry",
  });

  // ─────────────────────────────────────────────
  //  2. MktbToken (needs initialOwner = deployer)
  // ─────────────────────────────────────────────

  const mktbToken = m.contract("MktbToken", [deployer], {
    id: "MktbToken",
  });

  // ─────────────────────────────────────────────
  //  3. TimelockController (OZ, 48h delay)
  //     proposers + executors set to empty initially;
  //     governance contract will be added as proposer after deploy.
  //     admin = deployer (to configure roles, then renounce).
  // ─────────────────────────────────────────────

  const timelock = m.contract(
    "TimelockController",
    [
      TIMELOCK_DELAY,   // minDelay: 48 hours
      [],               // proposers: empty (governor added post-deploy)
      [],               // executors: empty (governor added post-deploy)
      deployer,         // admin: deployer (will renounce after setup)
    ],
    {
      id: "TimelockController",
    }
  );

  // ─────────────────────────────────────────────
  //  4. MktbGovernance (needs MktbToken + TimelockController)
  // ─────────────────────────────────────────────

  const governance = m.contract("MktbGovernance", [mktbToken, timelock], {
    id: "MktbGovernance",
    after: [mktbToken, timelock],
  });

  // ─────────────────────────────────────────────
  //  5. ExecutorRewards (needs MktbToken, roles)
  // ─────────────────────────────────────────────

  const executorRewards = m.contract(
    "ExecutorRewards",
    [
      mktbToken,                 // _mktbToken
      INITIAL_MINIMUM_STAKE,     // _minimumStake: 1,000 MKTB
      INITIAL_REWARD_PER_EXEC,   // _rewardPerExecution: 100 MKTB
      deployer,                  // _admin: deployer (DEFAULT_ADMIN_ROLE)
      timelock,                  // _governance: timelock (GOVERNANCE_ROLE)
    ],
    {
      id: "ExecutorRewards",
      after: [mktbToken, timelock],
    }
  );

  // ─────────────────────────────────────────────
  //  6. MaktubCore (needs creationFee, feeReceiver, RecipientRegistry)
  // ─────────────────────────────────────────────

  const maktubCore = m.contract(
    "MaktubCore",
    [creationFee, feeReceiver, recipientRegistry, executorRewards],
    {
      id: "MaktubCore",
      after: [recipientRegistry, executorRewards],
    }
  );

  // ─────────────────────────────────────────────
  //  Role Assignments
  // ─────────────────────────────────────────────

  // Read role constants from deployed contracts (avoids hardcoding keccak hashes).
  const CORE_ROLE = m.staticCall(executorRewards, "CORE_ROLE", [], 0, {
    id: "ReadCoreRole",
  });

  const PROPOSER_ROLE = m.staticCall(timelock, "PROPOSER_ROLE", [], 0, {
    id: "ReadProposerRole",
  });

  const EXECUTOR_ROLE = m.staticCall(timelock, "EXECUTOR_ROLE", [], 0, {
    id: "ReadExecutorRole",
  });

  const CANCELLER_ROLE = m.staticCall(timelock, "CANCELLER_ROLE", [], 0, {
    id: "ReadCancellerRole",
  });

  // Set MaktubCore address on ExecutorRewards (resolves circular dependency).
  // ExecutorRewards needs to know MaktubCore to validate heartbeats on reward claims.
  m.call(executorRewards, "setMaktubCore", [maktubCore], {
    id: "SetMaktubCoreOnRewards",
    after: [executorRewards, maktubCore],
  });

  // Grant CORE_ROLE on ExecutorRewards to MaktubCore
  // so MaktubCore can trigger reward distribution on execution.
  m.call(executorRewards, "grantRole", [CORE_ROLE, maktubCore], {
    id: "GrantCoreRoleToMaktubCore",
    after: [executorRewards, maktubCore],
  });

  // Grant PROPOSER_ROLE on TimelockController to Governance
  // so the governor contract can queue proposals.
  m.call(timelock, "grantRole", [PROPOSER_ROLE, governance], {
    id: "GrantProposerRoleToGovernance",
    after: [timelock, governance],
  });

  // Grant EXECUTOR_ROLE on TimelockController to Governance
  // so the governor contract can execute proposals.
  m.call(timelock, "grantRole", [EXECUTOR_ROLE, governance], {
    id: "GrantExecutorRoleToGovernance",
    after: [timelock, governance],
  });

  // Grant CANCELLER_ROLE on TimelockController to Governance
  // so the governor contract can cancel proposals.
  m.call(timelock, "grantRole", [CANCELLER_ROLE, governance], {
    id: "GrantCancellerRoleToGovernance",
    after: [timelock, governance],
  });

  // ─────────────────────────────────────────────
  //  Token Distribution (100M MKTB)
  // ─────────────────────────────────────────────

  // 35M to ExecutorRewards (executor reward pool)
  m.call(mktbToken, "mint", [executorRewards, EXECUTOR_REWARDS_AMOUNT], {
    id: "MintExecutorRewards",
    after: [mktbToken, executorRewards],
  });

  // 25M to TimelockController (community treasury, governed by DAO)
  m.call(mktbToken, "mint", [timelock, TREASURY_AMOUNT], {
    id: "MintTreasury",
    after: [mktbToken, timelock],
  });

  // 15M to liquidity address
  m.call(mktbToken, "mint", [liquidityAddr, LIQUIDITY_AMOUNT], {
    id: "MintLiquidity",
    after: [mktbToken],
  });

  // 12M to team address
  m.call(mktbToken, "mint", [teamAddr, TEAM_AMOUNT], {
    id: "MintTeam",
    after: [mktbToken],
  });

  // 10M to grants address
  m.call(mktbToken, "mint", [grantsAddr, GRANTS_AMOUNT], {
    id: "MintGrants",
    after: [mktbToken],
  });

  // 3M to launch fund address
  m.call(mktbToken, "mint", [launchFundAddr, LAUNCH_FUND_AMOUNT], {
    id: "MintLaunchFund",
    after: [mktbToken],
  });

  // ─────────────────────────────────────────────
  //  Return all deployed contracts
  // ─────────────────────────────────────────────

  return {
    recipientRegistry,
    mktbToken,
    timelock,
    governance,
    executorRewards,
    maktubCore,
  };
});
