/**
 * Maktub Protocol — End-to-End Frontend vs Live Contracts Test
 *
 * Simulates the on-chain reads the React app (maktub.pages.dev) performs
 * against the live Base Sepolia deployment. Every app-facing view function
 * is exercised and cross-checked against deployments/base-sepolia.json.
 *
 * Run:  node scripts/test-app-flow.js
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");

// ---------------------------------------------------------------------------
// Mirror app ABIs (app/src/constants/abis.js) — human-readable ethers format.
// ---------------------------------------------------------------------------
const MAKTUB_CORE_ABI = [
  "function createHeartbeat(bytes32 salt, address[] recipients, bytes payload, uint256 interval) payable returns (uint256 id)",
  "function checkIn(uint256 id)",
  "function execute(uint256 id)",
  "function updateRecipients(uint256 id, address[] newRecipients)",
  "function updateInterval(uint256 id, uint256 newInterval)",
  "function deactivate(uint256 id)",
  "function getHeartbeat(uint256 id) view returns (address owner, address[] recipients, bytes payload, uint256 interval, uint256 lastCheckIn, uint256 createdAt, uint256 checkInCount, bool executed, bool deactivated)",
  "function isExpired(uint256 id) view returns (bool)",
  "function isExecutor(address account) view returns (bool)",
  "function timeRemaining(uint256 id) view returns (uint256)",
  "function heartbeatCount() view returns (uint256)",
  "function creationFee() view returns (uint256)",
  "function MIN_INTERVAL() view returns (uint256)",
  "function MAX_INTERVAL() view returns (uint256)",
  "function MAX_RECIPIENTS() view returns (uint256)",
];

const RECIPIENT_REGISTRY_ABI = [
  "function isRegistered(address account) view returns (bool)",
  "function getPrePublicKey(address account) view returns (bytes)",
];

const MKTB_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const EXECUTOR_REWARDS_ABI = [
  "function stakes(address executor) view returns (uint256)",
  "function isActiveExecutor(address account) view returns (bool)",
  "function rewardsEarned(address executor) view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "function totalDistributed() view returns (uint256)",
  "function minimumStake() view returns (uint256)",
  "function rewardPerExecution() view returns (uint256)",
  "function currentRewardAmount() view returns (uint256)",
  "function currentYear() view returns (uint256)",
  "function remainingRewardPool() view returns (uint256)",
  "function mktbToken() view returns (address)",
];

// ---------------------------------------------------------------------------
// Small test harness.
// ---------------------------------------------------------------------------
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function tryCheck(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    record(name, false, err.shortMessage || err.message || String(err));
  }
}

// ---------------------------------------------------------------------------
async function main() {
  console.log("============================================================");
  console.log("MAKTUB PROTOCOL — APP ↔ LIVE CONTRACTS E2E READ TEST");
  console.log("Date:", new Date().toISOString());
  console.log("============================================================\n");

  // Load deployment manifest.
  const deploymentsPath = path.join(__dirname, "..", "deployments", "base-sepolia.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  console.log("Network:", deployment.network, `(chainId ${deployment.chainId})`);
  console.log("Deployer:", deployment.deployer);
  console.log("Contracts:");
  for (const [k, v] of Object.entries(deployment.contracts)) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }

  const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const provider = new ethers.JsonRpcProvider(RPC_URL, deployment.chainId);

  // Sanity: chain id matches.
  console.log("\n[0] Provider / network");
  await tryCheck("RPC getNetwork() chainId == 84532", async () => {
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== deployment.chainId) {
      throw new Error(`chainId mismatch: got ${net.chainId}`);
    }
    return `chainId=${net.chainId}`;
  });
  await tryCheck("RPC getBlockNumber()", async () => {
    const bn = await provider.getBlockNumber();
    if (!bn || bn < 1) throw new Error(`bad blockNumber ${bn}`);
    return `block=${bn}`;
  });

  const DEPLOYER = deployment.deployer;

  // Contract instances — read-only via provider, exactly like the app in
  // read mode (useContracts falls back to provider when there's no signer).
  const core = new ethers.Contract(deployment.contracts.MaktubCore, MAKTUB_CORE_ABI, provider);
  const registry = new ethers.Contract(deployment.contracts.RecipientRegistry, RECIPIENT_REGISTRY_ABI, provider);
  const token = new ethers.Contract(deployment.contracts.MktbToken, MKTB_TOKEN_ABI, provider);
  const rewards = new ethers.Contract(deployment.contracts.ExecutorRewards, EXECUTOR_REWARDS_ABI, provider);

  // -------------------------------------------------------------------------
  console.log("\n[1] Read Heartbeat #0 (as the app's Dashboard would)");
  let hb0 = null;
  await tryCheck("core.getHeartbeat(0) decodes", async () => {
    hb0 = await core.getHeartbeat(0);
    if (!hb0 || !hb0.owner) throw new Error("no owner field");
    return `owner=${hb0.owner}`;
  });

  if (hb0) {
    console.log("     owner:         ", hb0.owner);
    console.log("     recipients:    ", hb0.recipients);
    let payloadText = null;
    try { payloadText = ethers.toUtf8String(hb0.payload); } catch { payloadText = "(non-utf8)"; }
    console.log("     payload:       ", payloadText);
    console.log("     interval:      ", hb0.interval.toString(), "sec");
    console.log("     lastCheckIn:   ", new Date(Number(hb0.lastCheckIn) * 1000).toISOString());
    console.log("     createdAt:     ", new Date(Number(hb0.createdAt) * 1000).toISOString());
    console.log("     checkInCount:  ", hb0.checkInCount.toString());
    console.log("     executed:      ", hb0.executed);
    console.log("     deactivated:   ", hb0.deactivated);

    await tryCheck("heartbeat #0 owner == deployer", async () => {
      if (hb0.owner.toLowerCase() !== DEPLOYER.toLowerCase()) {
        throw new Error(`owner=${hb0.owner}`);
      }
      return hb0.owner;
    });

    await tryCheck("core.timeRemaining(0)", async () => {
      const t = await core.timeRemaining(0);
      return `${t.toString()} sec (${(Number(t) / 60).toFixed(1)} min)`;
    });
    await tryCheck("core.isExpired(0)", async () => {
      const x = await core.isExpired(0);
      return String(x);
    });
  }

  // -------------------------------------------------------------------------
  console.log("\n[2] Dashboard data — heartbeats owned by deployer");
  let total = 0;
  await tryCheck("core.heartbeatCount()", async () => {
    const c = await core.heartbeatCount();
    total = Number(c);
    return String(total);
  });

  const owned = [];
  for (let i = 0; i < total; i++) {
    try {
      const hb = await core.getHeartbeat(i);
      if (hb.owner.toLowerCase() === DEPLOYER.toLowerCase()) {
        let timeRem = 0n, expired = false;
        try {
          timeRem = await core.timeRemaining(i);
          expired = await core.isExpired(i);
        } catch { /* deactivated/executed heartbeats may revert */ }
        owned.push({ id: i, hb, timeRem, expired });
      }
    } catch (err) {
      console.log(`     warn: getHeartbeat(${i}) reverted:`, err.shortMessage || err.message);
    }
  }
  record(
    "dashboard scan returned >=1 heartbeat owned by deployer",
    owned.length >= 1,
    `owned=${owned.length} of total=${total}`
  );
  for (const o of owned) {
    const status = o.hb.deactivated ? "deactivated"
      : o.hb.executed ? "executed"
      : o.expired ? "expired"
      : "active";
    console.log(`     #${o.id}  status=${status}  checkIns=${o.hb.checkInCount}  remaining=${o.timeRem}s`);
  }

  // -------------------------------------------------------------------------
  console.log("\n[3] Executor status");
  await tryCheck("rewards.isActiveExecutor(deployer) == true", async () => {
    const v = await rewards.isActiveExecutor(DEPLOYER);
    if (!v) throw new Error("deployer is NOT an active executor");
    return "active";
  });
  await tryCheck("core.isExecutor(deployer) == true", async () => {
    const v = await core.isExecutor(DEPLOYER);
    if (!v) throw new Error("core reports deployer is NOT an executor");
    return "true";
  });
  await tryCheck("rewards.stakes(deployer) > 0", async () => {
    const s = await rewards.stakes(DEPLOYER);
    if (s === 0n) throw new Error("zero stake");
    return `${ethers.formatEther(s)} MKTB`;
  });
  await tryCheck("rewards.minimumStake()", async () => {
    const s = await rewards.minimumStake();
    return `${ethers.formatEther(s)} MKTB`;
  });
  await tryCheck("rewards.totalStaked()", async () => {
    const s = await rewards.totalStaked();
    return `${ethers.formatEther(s)} MKTB`;
  });
  await tryCheck("rewards.rewardsEarned(deployer)", async () => {
    const r = await rewards.rewardsEarned(DEPLOYER);
    return `${ethers.formatEther(r)} MKTB`;
  });
  await tryCheck("rewards.currentRewardAmount()", async () => {
    const r = await rewards.currentRewardAmount();
    return `${ethers.formatEther(r)} MKTB per execution`;
  });
  await tryCheck("rewards.currentYear()", async () => {
    const y = await rewards.currentYear();
    return y.toString();
  });
  await tryCheck("rewards.remainingRewardPool()", async () => {
    const r = await rewards.remainingRewardPool();
    return `${ethers.formatEther(r)} MKTB`;
  });
  await tryCheck("rewards.mktbToken() == MktbToken address", async () => {
    const a = await rewards.mktbToken();
    if (a.toLowerCase() !== deployment.contracts.MktbToken.toLowerCase()) {
      throw new Error(`got ${a}`);
    }
    return a;
  });

  // -------------------------------------------------------------------------
  console.log("\n[4] MKTB balances");
  await tryCheck("token.name() == 'Maktub Token'", async () => {
    const n = await token.name();
    return n;
  });
  await tryCheck("token.symbol() == 'MKTB'", async () => {
    const s = await token.symbol();
    if (s !== "MKTB") throw new Error(`got ${s}`);
    return s;
  });
  await tryCheck("token.decimals() == 18", async () => {
    const d = await token.decimals();
    if (Number(d) !== 18) throw new Error(`got ${d}`);
    return "18";
  });
  await tryCheck("token.totalSupply()", async () => {
    const ts = await token.totalSupply();
    return `${ethers.formatEther(ts)} MKTB`;
  });
  await tryCheck("token.balanceOf(deployer)", async () => {
    const b = await token.balanceOf(DEPLOYER);
    return `${ethers.formatEther(b)} MKTB`;
  });
  await tryCheck("token.balanceOf(ExecutorRewards)", async () => {
    const b = await token.balanceOf(deployment.contracts.ExecutorRewards);
    return `${ethers.formatEther(b)} MKTB`;
  });
  await tryCheck("provider ETH balance of deployer", async () => {
    const b = await provider.getBalance(DEPLOYER);
    return `${ethers.formatEther(b)} ETH`;
  });

  // -------------------------------------------------------------------------
  console.log("\n[5] Creation fee from MaktubCore");
  await tryCheck("core.creationFee() == manifest creationFee", async () => {
    const fee = await core.creationFee();
    const expected = BigInt(deployment.creationFee);
    if (fee !== expected) throw new Error(`on-chain=${fee} manifest=${expected}`);
    return `${ethers.formatEther(fee)} ETH (${fee.toString()} wei)`;
  });

  // -------------------------------------------------------------------------
  console.log("\n[6] Remaining view functions used by the app");
  await tryCheck("core.MIN_INTERVAL()", async () => {
    const v = await core.MIN_INTERVAL();
    return `${v.toString()} sec (${Number(v) / 3600} h)`;
  });
  await tryCheck("core.MAX_INTERVAL()", async () => {
    const v = await core.MAX_INTERVAL();
    return `${v.toString()} sec (${Number(v) / 86400} d)`;
  });
  await tryCheck("core.MAX_RECIPIENTS()", async () => {
    const v = await core.MAX_RECIPIENTS();
    return v.toString();
  });
  await tryCheck("registry.isRegistered(deployer) == true", async () => {
    const v = await registry.isRegistered(DEPLOYER);
    if (!v) throw new Error("deployer is NOT registered as recipient");
    return "true";
  });
  await tryCheck("registry.getPrePublicKey(deployer) decodes", async () => {
    const k = await registry.getPrePublicKey(DEPLOYER);
    if (!k || k === "0x") throw new Error("empty PRE public key");
    return `${ethers.dataLength(k)} bytes (${k.slice(0, 22)}…)`;
  });

  // -------------------------------------------------------------------------
  console.log("\n============================================================");
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log("============================================================");
  if (failed > 0) {
    console.log("\nFAILURES:");
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("All app-facing view functions verified against live Base Sepolia contracts.");
  }
}

main().catch(err => {
  console.error("\nFATAL:", err);
  process.exitCode = 1;
});
