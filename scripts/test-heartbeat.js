const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  console.log("========================================");
  console.log("MAKTUB PROTOCOL — FIRST HEARTBEAT TEST");
  console.log("========================================");
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("ETH Balance:", ethers.formatEther(balance), "ETH");

  // Contract addresses from deployment
  const addresses = {
    RecipientRegistry: "0xfF66eEbFCf0C27f682B84500731752AaCAc7BBc9",
    MktbToken: "0x068d9176514C868d8fB43CE84A775b63cf223C5D",
    ExecutorRewards: "0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba",
    MaktubCore: "0x46f491eD5A82dA53Eb077aE35C4C5ed328864331",
  };

  // Attach to contracts
  const registry = await ethers.getContractAt("RecipientRegistry", addresses.RecipientRegistry);
  const token = await ethers.getContractAt("MktbToken", addresses.MktbToken);
  const rewards = await ethers.getContractAt("ExecutorRewards", addresses.ExecutorRewards);
  const core = await ethers.getContractAt("MaktubCore", addresses.MaktubCore);

  // Check MKTB balance
  const mktbBalance = await token.balanceOf(deployer.address);
  console.log("MKTB Balance:", ethers.formatEther(mktbBalance), "MKTB");

  // ============================================
  // Step 1: Register as recipient
  // ============================================
  console.log("\n--- STEP 1: Register as Recipient ---");

  const isRegistered = await registry.isRegistered(deployer.address);
  if (isRegistered) {
    console.log("Already registered as recipient. Skipping.");
  } else {
    // Dummy PRE public key (64 bytes, simulating a real key)
    const dummyPreKey = ethers.hexlify(ethers.randomBytes(64));
    console.log("Registering with PRE public key:", dummyPreKey.slice(0, 20) + "...");
    const tx1 = await registry.register(dummyPreKey);
    const receipt1 = await tx1.wait(1);
    console.log("Registered! TX:", receipt1.hash);
    console.log("Block:", receipt1.blockNumber, "Gas:", receipt1.gasUsed.toString());
    await wait(4000);
  }

  // ============================================
  // Step 2: Stake MKTB to become an executor
  // ============================================
  console.log("\n--- STEP 2: Stake MKTB as Executor ---");

  const isExecutor = await rewards.isActiveExecutor(deployer.address);
  if (isExecutor) {
    console.log("Already an active executor. Skipping.");
  } else {
    const minimumStake = await rewards.minimumStake();
    console.log("Minimum stake required:", ethers.formatEther(minimumStake), "MKTB");

    // Approve ExecutorRewards to spend MKTB
    console.log("Approving MKTB transfer...");
    const tx2a = await token.approve(addresses.ExecutorRewards, minimumStake);
    const receipt2a = await tx2a.wait(1);
    console.log("Approved! TX:", receipt2a.hash);
    await wait(4000);

    // Stake
    console.log("Staking", ethers.formatEther(minimumStake), "MKTB...");
    const tx2b = await rewards.stake(minimumStake);
    const receipt2b = await tx2b.wait(1);
    console.log("Staked! TX:", receipt2b.hash);
    console.log("Block:", receipt2b.blockNumber, "Gas:", receipt2b.gasUsed.toString());
    await wait(4000);

    // Verify
    const isNowExecutor = await rewards.isActiveExecutor(deployer.address);
    console.log("Is active executor:", isNowExecutor);
  }

  // ============================================
  // Step 3: Create the first heartbeat
  // ============================================
  console.log("\n--- STEP 3: Create the First Heartbeat ---");

  const heartbeatCountBefore = await core.heartbeatCount();
  console.log("Current heartbeat count:", heartbeatCountBefore.toString());

  const recipients = [deployer.address];
  const payload = ethers.toUtf8Bytes("It is written. The first heartbeat of Maktub Protocol.");
  const interval = 3600n; // 1 hour (minimum)
  const creationFee = 124000000000000n; // 0.000124 ETH

  console.log("Recipients:", recipients);
  console.log("Payload:", ethers.toUtf8String(payload));
  console.log("Interval: 3600 seconds (1 hour)");
  console.log("Creation fee:", ethers.formatEther(creationFee), "ETH");

  const salt = ethers.hexlify(ethers.randomBytes(32));
  console.log("Salt:", salt);
  const tx3 = await core.createHeartbeat(salt, recipients, payload, interval, {
    value: creationFee,
  });
  const receipt3 = await tx3.wait(1);
  console.log("\nHeartbeat created! TX:", receipt3.hash);
  console.log("Block:", receipt3.blockNumber, "Gas:", receipt3.gasUsed.toString());

  // Parse the HeartbeatCreated event
  const heartbeatCreatedEvent = receipt3.logs.find(log => {
    try {
      return core.interface.parseLog(log)?.name === "HeartbeatCreated";
    } catch { return false; }
  });
  const parsedEvent = core.interface.parseLog(heartbeatCreatedEvent);
  const heartbeatId = parsedEvent.args[0];
  console.log("Heartbeat ID:", heartbeatId.toString());

  await wait(4000);

  // ============================================
  // Step 4: Read back the heartbeat
  // ============================================
  console.log("\n--- STEP 4: Read Back the Heartbeat ---");

  const hb = await core.getHeartbeat(heartbeatId);
  console.log("Owner:", hb.owner);
  console.log("Recipients:", hb.recipients);
  console.log("Payload (hex):", ethers.hexlify(hb.payload));
  console.log("Payload (text):", ethers.toUtf8String(hb.payload));
  console.log("Interval:", hb.interval.toString(), "seconds");
  console.log("Last Check-In:", new Date(Number(hb.lastCheckIn) * 1000).toISOString());
  console.log("Created At:", new Date(Number(hb.createdAt) * 1000).toISOString());
  console.log("Check-In Count:", hb.checkInCount.toString());
  console.log("Executed:", hb.executed);
  console.log("Deactivated:", hb.deactivated);

  // ============================================
  // Step 5: Check in (reset the timer)
  // ============================================
  console.log("\n--- STEP 5: Check In (Reset Timer) ---");

  const tx5 = await core.checkIn(heartbeatId);
  const receipt5 = await tx5.wait(1);
  console.log("Checked in! TX:", receipt5.hash);
  console.log("Block:", receipt5.blockNumber, "Gas:", receipt5.gasUsed.toString());
  await wait(4000);

  // ============================================
  // Step 6: Display time remaining
  // ============================================
  console.log("\n--- STEP 6: Time Remaining ---");

  const remaining = await core.timeRemaining(heartbeatId);
  const minutes = Number(remaining) / 60;
  console.log("Time remaining:", remaining.toString(), "seconds");
  console.log("Time remaining:", minutes.toFixed(1), "minutes");

  const isExpired = await core.isExpired(heartbeatId);
  console.log("Is expired:", isExpired);

  const isExec = await core.isExecutor(deployer.address);
  console.log("Deployer is executor:", isExec);

  const newCheckInCount = (await core.getHeartbeat(heartbeatId)).checkInCount;
  console.log("Check-in count after check-in:", newCheckInCount.toString());

  // ============================================
  // Summary
  // ============================================
  console.log("\n========================================");
  console.log("THE FIRST HEARTBEAT OF MAKTUB PROTOCOL");
  console.log("========================================");
  console.log("Heartbeat ID:", heartbeatId.toString());
  console.log("Network: Base Sepolia (chainId 84532)");
  console.log("Message:", ethers.toUtf8String(hb.payload));
  console.log("Status: ACTIVE");
  console.log("Timer: ~" + minutes.toFixed(0) + " minutes remaining");
  console.log("========================================");
  console.log("It is written.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
