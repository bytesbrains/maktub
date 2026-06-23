#!/usr/bin/env node
/**
 * test-contracts.js
 * On-chain production verification against Base Sepolia.
 *
 * Checks:
 *   - Every deployed contract address has non-empty bytecode
 *   - Cross-references between contracts (MaktubCore <-> RecipientRegistry,
 *     ExecutorRewards <-> MktbToken, etc.) line up
 *   - MktbToken metadata + distribution
 *   - MaktubCore fee curve (baseFee/perAdditionalFee/creationFeeFor) matches
 *     deployments/base-sepolia.json `feeCurve`
 *   - MaktubFlash linear fee + RecipientRegistryV2 link (Flash citizen)
 *   - RecipientRegistryV2 v1 fall-through + deployer key slots
 *   - Heartbeat #0 exists and is in a sensible state
 *   - Deployer is still a registered + active executor
 *
 * Uses ethers v6 (shipped via hardhat-toolbox). Same RPC the app hard-codes
 * (CHAIN_RPC in app/src/constants/addresses.js = https://sepolia.base.org).
 *
 * Run:   node test/production/test-contracts.js
 */

const path = require('node:path');
const fs = require('node:fs');
const { ethers } = require(path.join(__dirname, '..', '..', 'node_modules', 'ethers'));

const DEPLOYMENT = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'deployments', 'base-sepolia.json'), 'utf8')
);

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

const results = [];
function record(name, status, detail = '', severity = '') {
  results.push({ name, status, detail, severity });
  const icon = status === 'PASS' ? '[PASS]' : status === 'FAIL' ? '[FAIL]' : '[WARN]';
  const sev = severity ? ` (${severity})` : '';
  console.log(`${icon} ${name}${sev}${detail ? ' — ' + detail : ''}`);
}

// Minimal ABIs for view calls
const MAKTUB_CORE_ABI = [
  'function baseFee() view returns (uint256)',
  'function perAdditionalFee() view returns (uint256)',
  'function creationFeeFor(uint256) view returns (uint256)',
  'function feeReceiver() view returns (address)',
  'function recipientRegistry() view returns (address)',
  'function executorRewards() view returns (address)',
  'function heartbeatCount() view returns (uint256)',
  'function MIN_INTERVAL() view returns (uint256)',
  'function MAX_INTERVAL() view returns (uint256)',
  'function MAX_RECIPIENTS() view returns (uint256)',
  'function isExecutor(address) view returns (bool)',
  'function isExpired(uint256) view returns (bool)',
  'function timeRemaining(uint256) view returns (uint256)',
  'function getHeartbeat(uint256) view returns (address owner, address[] recipients, bytes payload, uint256 interval, uint256 lastCheckIn, uint256 createdAt, uint256 checkInCount, bool executed, bool deactivated)',
];

const RECIPIENT_REGISTRY_ABI = [
  'function isRegistered(address) view returns (bool)',
  'function getPrePublicKey(address) view returns (bytes)',
];

const MAKTUB_FLASH_ABI = [
  'function flashCount() view returns (uint256)',
  'function perRecipientFee() view returns (uint256)',
  'function flashFeeFor(uint256) view returns (uint256)',
  'function feeReceiver() view returns (address)',
  'function recipientRegistry() view returns (address)',
  'function MAX_RECIPIENTS() view returns (uint256)',
];

const REGISTRY_V2_ABI = [
  'function v1() view returns (address)',
  'function isRegistered(address) view returns (bool)',
  'function isFlashEligible(address) view returns (bool)',
  'function getEncPubKey(address) view returns (bytes)',
];

const EXECUTOR_REWARDS_ABI = [
  'function mktbToken() view returns (address)',
  'function maxRewardPerExecution() view returns (uint256)',
  'function emissionStart() view returns (uint256)',
  'function stakes(address) view returns (uint256)',
  'function isActiveExecutor(address) view returns (bool)',
  'function rewardsEarned(address) view returns (uint256)',
  'function currentRewardAmount() view returns (uint256)',
  'function remainingRewardPool() view returns (uint256)',
  'function TOTAL_REWARD_POOL() view returns (uint256)',
];

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

const GOVERNOR_ABI = [
  'function name() view returns (string)',
  'function votingDelay() view returns (uint256)',
  'function votingPeriod() view returns (uint256)',
  'function proposalThreshold() view returns (uint256)',
  'function token() view returns (address)',
  'function timelock() view returns (address)',
];

const TIMELOCK_ABI = [
  'function getMinDelay() view returns (uint256)',
];

async function main() {
  console.log('\n=== Maktub On-Chain Production Tests ===\n');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Deployment: ${DEPLOYMENT.network} (chainId ${DEPLOYMENT.chainId})`);
  console.log(`Deployer: ${DEPLOYMENT.deployer}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  const provider = new ethers.JsonRpcProvider(RPC_URL, DEPLOYMENT.chainId, {
    staticNetwork: ethers.Network.from(DEPLOYMENT.chainId),
  });

  // --- 1. Chain + RPC sanity ---
  console.log('--- 1. Chain / RPC sanity ---');
  try {
    const net = await provider.getNetwork();
    if (Number(net.chainId) === DEPLOYMENT.chainId) {
      record(`RPC returns chainId ${DEPLOYMENT.chainId}`, 'PASS');
    } else {
      record(`RPC returns chainId ${DEPLOYMENT.chainId}`, 'FAIL', `got ${net.chainId}`, 'CRITICAL');
      return;
    }
    const block = await provider.getBlockNumber();
    record(`RPC current block`, 'PASS', `#${block}`);
  } catch (err) {
    record('RPC connectivity', 'FAIL', err.message, 'CRITICAL');
    return;
  }

  // --- 2. Bytecode present on all 6 contracts ---
  console.log('\n--- 2. Bytecode present ---');
  for (const [name, addr] of Object.entries(DEPLOYMENT.contracts)) {
    try {
      const code = await provider.getCode(addr);
      if (code && code !== '0x' && code.length > 2) {
        record(`${name} has bytecode`, 'PASS', `${addr} (${(code.length - 2) / 2}B)`);
      } else {
        record(`${name} has bytecode`, 'FAIL', `empty code at ${addr}`, 'CRITICAL');
      }
    } catch (err) {
      record(`${name} getCode`, 'FAIL', err.message, 'CRITICAL');
    }
  }

  // --- 3. MaktubCore state ---
  console.log('\n--- 3. MaktubCore state ---');
  const core = new ethers.Contract(DEPLOYMENT.contracts.MaktubCore, MAKTUB_CORE_ABI, provider);
  try {
    // D-022/D-023 fee curve: creationFee = baseFee + (n - 1) * perAdditionalFee
    const [baseFee, perAdd] = await Promise.all([core.baseFee(), core.perAdditionalFee()]);
    if (baseFee.toString() === DEPLOYMENT.feeCurve.baseFee) {
      record('MaktubCore.baseFee matches deployment feeCurve', 'PASS', `${ethers.formatEther(baseFee)} ETH`);
    } else {
      record('MaktubCore.baseFee matches deployment feeCurve', 'FAIL', `on-chain=${baseFee} expected=${DEPLOYMENT.feeCurve.baseFee}`, 'HIGH');
    }
    if (perAdd.toString() === DEPLOYMENT.feeCurve.perAdditionalFee) {
      record('MaktubCore.perAdditionalFee matches deployment feeCurve', 'PASS', `${ethers.formatEther(perAdd)} ETH`);
    } else {
      record('MaktubCore.perAdditionalFee matches deployment feeCurve', 'FAIL', `on-chain=${perAdd} expected=${DEPLOYMENT.feeCurve.perAdditionalFee}`, 'HIGH');
    }
    const [feeFor1, feeFor3] = await Promise.all([core.creationFeeFor(1), core.creationFeeFor(3)]);
    if (feeFor1 === baseFee && feeFor3 === baseFee + 2n * perAdd) {
      record('MaktubCore.creationFeeFor follows the formula', 'PASS', `feeFor(1)=${feeFor1} feeFor(3)=${feeFor3}`);
    } else {
      record('MaktubCore.creationFeeFor follows the formula', 'FAIL', `feeFor(1)=${feeFor1} feeFor(3)=${feeFor3} base=${baseFee} perAdd=${perAdd}`, 'HIGH');
    }

    const rr = await core.recipientRegistry();
    if (rr.toLowerCase() === DEPLOYMENT.contracts.RecipientRegistry.toLowerCase()) {
      record('MaktubCore.recipientRegistry linked correctly', 'PASS');
    } else {
      record('MaktubCore.recipientRegistry linked correctly', 'FAIL', `got ${rr}`, 'CRITICAL');
    }

    const er = await core.executorRewards();
    if (er.toLowerCase() === DEPLOYMENT.contracts.ExecutorRewards.toLowerCase()) {
      record('MaktubCore.executorRewards linked correctly', 'PASS');
    } else {
      record('MaktubCore.executorRewards linked correctly', 'FAIL', `got ${er}`, 'CRITICAL');
    }

    const fr = await core.feeReceiver();
    record('MaktubCore.feeReceiver', 'PASS', fr);

    const [min, max, maxR] = await Promise.all([core.MIN_INTERVAL(), core.MAX_INTERVAL(), core.MAX_RECIPIENTS()]);
    record('MaktubCore intervals / limits',
      (min === 3600n && max === 31_536_000n && maxR === 100n) ? 'PASS' : 'WARN',
      `MIN_INTERVAL=${min}s MAX_INTERVAL=${max}s MAX_RECIPIENTS=${maxR}`);
  } catch (err) {
    record('MaktubCore view calls', 'FAIL', err.message, 'CRITICAL');
  }

  // heartbeatCount gates section 4 — read it independently so a failure in
  // the batch above can't masquerade as "no heartbeats created yet".
  let heartbeatCount = 0n;
  try {
    heartbeatCount = await core.heartbeatCount();
    record('MaktubCore.heartbeatCount', 'PASS', `${heartbeatCount}`);
  } catch (err) {
    record('MaktubCore.heartbeatCount', 'FAIL', err.message, 'CRITICAL');
  }

  // --- 4. Heartbeat #0 ---
  console.log('\n--- 4. Heartbeat #0 ---');
  if (heartbeatCount >= 1n) {
    try {
      const hb = await core.getHeartbeat(0);
      const [owner, recipients, payload, interval, lastCheckIn, createdAt, checkInCount, executed, deactivated] = hb;
      record('Heartbeat #0 exists / readable', 'PASS',
        `owner=${owner} recipients=${recipients.length} interval=${interval}s checkInCount=${checkInCount} executed=${executed} deactivated=${deactivated}`);

      if (ethers.isAddress(owner) && owner !== ethers.ZeroAddress) {
        record('Heartbeat #0 owner is non-zero', 'PASS', owner);
      } else {
        record('Heartbeat #0 owner is non-zero', 'FAIL', `owner=${owner}`, 'HIGH');
      }
      if (recipients.length > 0) {
        record('Heartbeat #0 has >=1 recipient', 'PASS', `${recipients.length} recipient(s): ${recipients.join(', ')}`);
      } else {
        record('Heartbeat #0 has >=1 recipient', 'FAIL', 'empty recipients array', 'HIGH');
      }
      if (payload && payload.length > 2) {
        record('Heartbeat #0 payload CID', 'PASS', `${(payload.length - 2) / 2} bytes`);
      } else {
        record('Heartbeat #0 payload CID', 'WARN', 'empty payload', 'MEDIUM');
      }
      if (interval >= 3600n && interval <= 31_536_000n) {
        record('Heartbeat #0 interval within MIN/MAX', 'PASS', `${interval}s (${Number(interval) / 3600}h)`);
      } else {
        record('Heartbeat #0 interval within MIN/MAX', 'FAIL', `${interval}s`, 'HIGH');
      }
      if (!executed && !deactivated) {
        record('Heartbeat #0 still active', 'PASS', 'executed=false deactivated=false');
      } else {
        record('Heartbeat #0 still active', 'WARN', `executed=${executed} deactivated=${deactivated}`, 'LOW');
      }

      // time math
      const expired = await core.isExpired(0);
      const remaining = await core.timeRemaining(0);
      record('Heartbeat #0 isExpired()', 'PASS', `${expired} (timeRemaining=${remaining}s = ${(Number(remaining)/3600).toFixed(2)}h)`);

      const now = BigInt(Math.floor(Date.now() / 1000));
      const expectedRemaining = lastCheckIn + interval > now ? lastCheckIn + interval - now : 0n;
      const drift = remaining > expectedRemaining ? remaining - expectedRemaining : expectedRemaining - remaining;
      if (drift < 120n) {
        record('Heartbeat #0 time math consistent with wall clock', 'PASS', `drift=${drift}s`);
      } else {
        record('Heartbeat #0 time math consistent with wall clock', 'WARN', `drift=${drift}s`, 'LOW');
      }
    } catch (err) {
      record('Heartbeat #0 read', 'FAIL', err.message, 'HIGH');
    }
  } else {
    record('Heartbeat #0 exists', 'WARN', 'heartbeatCount=0, no heartbeats created yet', 'MEDIUM');
  }

  // --- 5. RecipientRegistry ---
  console.log('\n--- 5. RecipientRegistry ---');
  const rr = new ethers.Contract(DEPLOYMENT.contracts.RecipientRegistry, RECIPIENT_REGISTRY_ABI, provider);
  try {
    const regDeployer = await rr.isRegistered(DEPLOYMENT.deployer);
    record(`RecipientRegistry.isRegistered(deployer)`, 'PASS', `${regDeployer}`);
    // Random unregistered address should be false
    const random = '0x' + '11'.repeat(20);
    const regRandom = await rr.isRegistered(random);
    if (!regRandom) record(`RecipientRegistry.isRegistered(random) is false`, 'PASS');
    else record(`RecipientRegistry.isRegistered(random) is false`, 'FAIL', 'returned true unexpectedly', 'MEDIUM');
    if (regDeployer) {
      const key = await rr.getPrePublicKey(DEPLOYMENT.deployer);
      if (key && key.length > 2) record('Deployer PRE public key stored', 'PASS', `${(key.length-2)/2}B`);
      else record('Deployer PRE public key stored', 'WARN', 'empty', 'MEDIUM');
    }
  } catch (err) {
    record('RecipientRegistry view calls', 'FAIL', err.message, 'HIGH');
  }

  // --- 6. RecipientRegistryV2 (Flash substrate) ---
  console.log('\n--- 6. RecipientRegistryV2 ---');
  const rrV2 = new ethers.Contract(DEPLOYMENT.contracts.RecipientRegistryV2, REGISTRY_V2_ABI, provider);
  try {
    const v1Addr = await rrV2.v1();
    if (v1Addr.toLowerCase() === DEPLOYMENT.contracts.RecipientRegistry.toLowerCase()) {
      record('RecipientRegistryV2.v1 -> RecipientRegistry', 'PASS');
    } else {
      record('RecipientRegistryV2.v1 -> RecipientRegistry', 'FAIL', `got ${v1Addr}`, 'CRITICAL');
    }
    const v2RegDeployer = await rrV2.isRegistered(DEPLOYMENT.deployer);
    if (v2RegDeployer) {
      record('RegistryV2.isRegistered(deployer) — v1 fall-through works', 'PASS');
    } else {
      record('RegistryV2.isRegistered(deployer) — v1 fall-through works', 'FAIL', 'deployer registered in v1 but V2 says false', 'HIGH');
    }
    const encKey = await rrV2.getEncPubKey(DEPLOYMENT.deployer);
    const encLen = (encKey.length - 2) / 2;
    if (encLen === 33 || encLen === 65) {
      record('RegistryV2.getEncPubKey(deployer) — valid key length', 'PASS', `${encLen}B`);
    } else {
      record('RegistryV2.getEncPubKey(deployer) — valid key length', 'WARN', `${encLen}B (expected 33 or 65)`, 'MEDIUM');
    }
    // Eligibility is a user opt-in (ratchet slot), not an invariant — report only.
    const eligible = await rrV2.isFlashEligible(DEPLOYMENT.deployer);
    record('RegistryV2.isFlashEligible(deployer)', 'PASS', `${eligible}`);
  } catch (err) {
    record('RecipientRegistryV2 view calls', 'FAIL', err.message, 'HIGH');
  }

  // --- 7. MaktubFlash (instant citizen) ---
  console.log('\n--- 7. MaktubFlash ---');
  const flash = new ethers.Contract(DEPLOYMENT.contracts.MaktubFlash, MAKTUB_FLASH_ABI, provider);
  try {
    const perFee = await flash.perRecipientFee();
    if (perFee.toString() === DEPLOYMENT.flashPerRecipientFee) {
      record('MaktubFlash.perRecipientFee matches deployment', 'PASS', `${ethers.formatEther(perFee)} ETH`);
    } else {
      record('MaktubFlash.perRecipientFee matches deployment', 'FAIL', `on-chain=${perFee} expected=${DEPLOYMENT.flashPerRecipientFee}`, 'HIGH');
    }
    const [feeFor1, feeFor5] = await Promise.all([flash.flashFeeFor(1), flash.flashFeeFor(5)]);
    if (feeFor1 === perFee && feeFor5 === 5n * perFee) {
      record('MaktubFlash.flashFeeFor is pure linear', 'PASS', `feeFor(1)=${feeFor1} feeFor(5)=${feeFor5}`);
    } else {
      record('MaktubFlash.flashFeeFor is pure linear', 'FAIL', `feeFor(1)=${feeFor1} feeFor(5)=${feeFor5} per=${perFee}`, 'HIGH');
    }
    const flashReg = await flash.recipientRegistry();
    if (flashReg.toLowerCase() === DEPLOYMENT.contracts.RecipientRegistryV2.toLowerCase()) {
      record('MaktubFlash.recipientRegistry -> RecipientRegistryV2', 'PASS');
    } else {
      record('MaktubFlash.recipientRegistry -> RecipientRegistryV2', 'FAIL', `got ${flashReg}`, 'CRITICAL');
    }
    const flashFeeReceiver = await flash.feeReceiver();
    record('MaktubFlash.feeReceiver', 'PASS', flashFeeReceiver);
    const maxR = await flash.MAX_RECIPIENTS();
    record('MaktubFlash.MAX_RECIPIENTS', maxR === 25n ? 'PASS' : 'WARN', `${maxR}`);
    const fc = await flash.flashCount();
    record('MaktubFlash.flashCount', 'PASS', `${fc}`);
  } catch (err) {
    record('MaktubFlash view calls', 'FAIL', err.message, 'CRITICAL');
  }

  // --- 8. ExecutorRewards ---
  console.log('\n--- 8. ExecutorRewards ---');
  const exec = new ethers.Contract(DEPLOYMENT.contracts.ExecutorRewards, EXECUTOR_REWARDS_ABI, provider);
  let remainingPool = null; // reused by the token-balance solvency check below
  try {
    const tokenAddr = await exec.mktbToken();
    if (tokenAddr.toLowerCase() === DEPLOYMENT.contracts.MktbToken.toLowerCase()) {
      record('ExecutorRewards.mktbToken linked correctly', 'PASS');
    } else {
      record('ExecutorRewards.mktbToken linked correctly', 'FAIL', `got ${tokenAddr}`, 'CRITICAL');
    }
    const activeDeployer = await exec.isActiveExecutor(DEPLOYMENT.deployer);
    if (activeDeployer) record('Deployer is active executor', 'PASS');
    else record('Deployer is active executor', 'WARN', 'isActiveExecutor=false', 'MEDIUM');

    const stake = await exec.stakes(DEPLOYMENT.deployer);
    record('Deployer stake in ExecutorRewards', 'PASS', `${ethers.formatEther(stake)} MKTB`);

    const pool = await exec.remainingRewardPool();
    remainingPool = pool;
    const totalPool = await exec.TOTAL_REWARD_POOL();
    record('ExecutorRewards remaining pool', 'PASS',
      `${ethers.formatEther(pool)} / ${ethers.formatEther(totalPool)} MKTB (${((Number(pool)/Number(totalPool))*100).toFixed(2)}%)`);

    const reward = await exec.currentRewardAmount();
    record('Current reward per execution', 'PASS', `${ethers.formatEther(reward)} MKTB`);

    const emStart = await exec.emissionStart();
    record('Emission start timestamp', 'PASS', `${emStart} (${new Date(Number(emStart)*1000).toISOString()})`);

    // cross-check: MaktubCore.isExecutor(deployer) should equal ExecutorRewards.isActiveExecutor(deployer)
    const coreIsExec = await core.isExecutor(DEPLOYMENT.deployer);
    if (coreIsExec === activeDeployer) record('MaktubCore.isExecutor == ExecutorRewards.isActiveExecutor (deployer)', 'PASS');
    else record('Executor status cross-check', 'FAIL', `core=${coreIsExec} rewards=${activeDeployer}`, 'HIGH');
  } catch (err) {
    record('ExecutorRewards view calls', 'FAIL', err.message, 'HIGH');
  }

  // --- 9. MktbToken ---
  console.log('\n--- 9. MktbToken ---');
  const token = new ethers.Contract(DEPLOYMENT.contracts.MktbToken, ERC20_ABI, provider);
  try {
    const [name, symbol, decimals, supply] = await Promise.all([
      token.name(), token.symbol(), token.decimals(), token.totalSupply(),
    ]);
    record('MktbToken.name', 'PASS', name);
    record('MktbToken.symbol', 'PASS', symbol);
    record('MktbToken.decimals', decimals === 18n ? 'PASS' : 'WARN', `${decimals}`);
    const expectedTotal = BigInt(DEPLOYMENT.tokenDistribution.total) * 10n ** 18n;
    if (supply === expectedTotal) {
      record('MktbToken.totalSupply matches tokenDistribution.total', 'PASS', `${ethers.formatEther(supply)} ${symbol}`);
    } else {
      record('MktbToken.totalSupply', 'FAIL', `got=${supply} expected=${expectedTotal}`, 'HIGH');
    }
    // distribution balances
    const [balExec, balDeployer] = await Promise.all([
      token.balanceOf(DEPLOYMENT.contracts.ExecutorRewards),
      token.balanceOf(DEPLOYMENT.deployer),
    ]);
    // The contract holds the reward pool PLUS executor stakes and any
    // earned-but-unclaimed rewards, so equality with the funded 35M is
    // wrong on both sides. The real invariant is solvency: balance must
    // cover the remaining pool. The surplus is stakes + unclaimed rewards.
    if (remainingPool !== null && balExec >= remainingPool) {
      const surplus = balExec - remainingPool;
      record('ExecutorRewards balance covers remaining pool', 'PASS',
        `${ethers.formatEther(balExec)} MKTB (pool=${ethers.formatEther(remainingPool)} + ${ethers.formatEther(surplus)} stakes/unclaimed)`);
    } else if (remainingPool !== null) {
      record('ExecutorRewards balance covers remaining pool', 'FAIL',
        `balance=${ethers.formatEther(balExec)} < remaining pool=${ethers.formatEther(remainingPool)}`, 'CRITICAL');
    } else {
      record('ExecutorRewards balance covers remaining pool', 'WARN',
        `pool unreadable; balance=${ethers.formatEther(balExec)} MKTB`, 'MEDIUM');
    }
    record('Deployer MKTB balance', 'PASS', `${ethers.formatEther(balDeployer)} MKTB`);
  } catch (err) {
    record('MktbToken view calls', 'FAIL', err.message, 'HIGH');
  }

  // --- 10. Governance + Timelock ---
  console.log('\n--- 10. Governance / Timelock ---');
  const gov = new ethers.Contract(DEPLOYMENT.contracts.MktbGovernance, GOVERNOR_ABI, provider);
  try {
    const [gname, vdelay, vperiod, thresh, gtoken, gtimelock] = await Promise.all([
      gov.name(), gov.votingDelay(), gov.votingPeriod(), gov.proposalThreshold(), gov.token(), gov.timelock(),
    ]);
    record('MktbGovernance.name', 'PASS', gname);
    record('MktbGovernance voting config', 'PASS', `delay=${vdelay} period=${vperiod} threshold=${ethers.formatEther(thresh)}`);
    if (gtoken.toLowerCase() === DEPLOYMENT.contracts.MktbToken.toLowerCase())
      record('Governor.token -> MktbToken', 'PASS');
    else record('Governor.token -> MktbToken', 'FAIL', `got ${gtoken}`, 'HIGH');
    if (gtimelock.toLowerCase() === DEPLOYMENT.contracts.TimelockController.toLowerCase())
      record('Governor.timelock -> TimelockController', 'PASS');
    else record('Governor.timelock -> TimelockController', 'FAIL', `got ${gtimelock}`, 'HIGH');
  } catch (err) {
    record('MktbGovernance view calls', 'FAIL', err.message, 'HIGH');
  }
  try {
    const tl = new ethers.Contract(DEPLOYMENT.contracts.TimelockController, TIMELOCK_ABI, provider);
    const delay = await tl.getMinDelay();
    record('TimelockController.getMinDelay', 'PASS', `${delay}s (${Number(delay)/3600}h)`);
  } catch (err) {
    record('TimelockController view calls', 'FAIL', err.message, 'HIGH');
  }

  // --- Summary ---
  console.log('\n=== Summary ===');
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  console.log(`PASS: ${pass}   FAIL: ${fail}   WARN: ${warn}   TOTAL: ${results.length}`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`  [${r.severity || '?'}] ${r.name} — ${r.detail}`);
    }
  }
  if (warn > 0) {
    console.log('\nWarnings:');
    for (const r of results.filter((x) => x.status === 'WARN')) {
      console.log(`  [${r.severity || '?'}] ${r.name} — ${r.detail}`);
    }
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(2);
});
