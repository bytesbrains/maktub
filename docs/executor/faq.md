# Executor FAQ

Common operator questions. If yours isn't here, read [Running an Executor Node](./running-a-node.md) and [Executor Economics](./economics.md) first.

---

### Do I need permission to run an executor?

No. The executor role is permissionless. Stake the minimum MKTB and you are an active executor — no application, no approval, no whitelist.

### How much MKTB do I need to stake?

Currently 1,000 MKTB on Sepolia. Check `ExecutorRewards.minimumStake()` on the target network for the live value. Governance can change this via proposal.

### Can I run more than one executor from the same machine?

Yes, but use different wallets for each. Two processes signing from the same wallet will collide.

In practice there is no advantage to running multiple executors on one machine with different wallets — you just split your rewards across wallets and pay more gas. If you want to scale, run on separate machines across regions for resilience.

### Can I run the executor behind NAT / at home?

Yes. The executor is an outbound-only process. It does not need inbound ports. Any residential or cloud connection with stable outbound HTTPS is enough. A dropout of a few minutes is tolerable.

### How does slashing work?

Governance (via the timelock) can slash an executor's stake for demonstrated misbehavior. There is no automatic slashing condition; slashing requires an on-chain proposal, a 7-day vote, and a timelock delay. Honest operators will never be slashed.

### What does "active executor" mean?

You have `stakes[you] >= minimumStake` in `ExecutorRewards`. That is the only condition. Check with `isActiveExecutor(address)`.

### What happens if I unstake below the minimum?

You become inactive. Any `execute` call from your wallet will revert with `NotExecutor`. Re-stake to reactivate. Your remaining stake is still yours; you can unstake it fully at any time.

### Can I withdraw rewards while still active?

Yes. Rewards are paid out to your wallet as MKTB on each successful execution. They are separate from your staked principal. Transfer them freely.

### Can I compound rewards back into my stake?

Yes. Set `AUTO_RESTAKE=true` in the executor config. The node will periodically approve and stake earned MKTB back into `ExecutorRewards`, increasing your stake.

### How fast do I need to be?

In a first-come-first-served system, faster is better. In practice, the difference between a good RPC provider and a bad one is tens to hundreds of milliseconds, which matters when multiple executors see the same expiry simultaneously.

Typical successful executors on mainnet will run paid RPC providers or self-hosted Base nodes, keep poll intervals short (10-30 seconds), and submit transactions through the fastest path they can arrange.

### Can I use a free public RPC?

For Sepolia testing: yes, the public endpoint works fine. For mainnet production: no, public RPCs rate-limit and will cost you executions. Use a paid provider.

### How do I know if I'm earning?

`ExecutorRewards.rewardsEarned(yourAddress)` returns cumulative MKTB earned. `MktbToken.balanceOf(yourAddress)` returns your liquid balance. The `npm run status` command prints both plus your stake.

### Will the executor automatically restart if it crashes?

The bundled `start.sh` is a minimal restart-on-crash loop. For production, use systemd, PM2, Docker with `--restart unless-stopped`, or whatever your ops stack provides.

### What if my node is offline when a heartbeat expires?

Another executor will catch it. You lose that reward. If your node is offline long enough, multiple rewards. Aim for high uptime.

### Should I run multiple executors with different keys to capture more rewards?

No. You can, but you split your share — two of your executors competing with each other doesn't give you more of the pie, it gives you two slices of the same slice. It is better to run one well-tuned executor than three sloppy ones.

### What if there are more executors than the network needs?

Some executors will earn less per unit of stake, and marginal operators will drop out until equilibrium returns. The protocol does not cap the number of executors.

### Can I run an executor on my laptop?

Technically yes for testing or personal use. Practically no for anything serious — your laptop's uptime is not enough for competitive execution, and you will lose rewards every time you close it.

### How do I receive support?

The Maktub community runs an executor channel in the project Discord / forum (see the project README). For bugs in the executor software, open a GitHub issue on the main repo.

### What if the protocol fails to distribute a reward?

The `HeartbeatExecuted` event still fires; the heartbeat is delivered. Only the reward pay-out to you is affected. Most reward failures are transient — retried on the next relay cycle. If you see persistent failures, check `paused` on `ExecutorRewards` (reward pause is a governance emergency action) and `remainingRewardPool()`.

### Can governance change the rules on me?

Parameters (minimumStake, rewardPerExecution, pause, slashing) yes — through the full on-chain governance process with a 7-day vote and 2-day timelock. You will see proposals before they pass and have time to react.

Constants burned into the contract (MIN_HEARTBEAT_AGE, MIN_CHECKINS_FOR_REWARD, MAX_SUPPLY, maxRewardPerExecution cap) no — these are immutable.

### What happens when the 35M pool is exhausted?

New executions earn zero rewards. Existing distributed rewards remain yours. In practice, the pool is designed to last at least 10 years under halving plus reserve, and governance can propose additional incentive mechanisms (e.g., a small executor service fee) before that point.

At exhaustion, the protocol still works — executions still fire, payloads still deliver — just without on-chain rewards. Whether executors continue running at that point depends on whether secondary economics have emerged.

### Is this a mining operation? Will regulators care?

Executor rewards are for performing a technical service (triggering execution of pre-agreed on-chain logic). They are token emissions, not payments for securities or investment services. Compare to Ethereum validators or Bitcoin miners: compensation for securing a public protocol.

That said, regulations vary by jurisdiction. If you run an executor at scale in a country with strict crypto regulations, consult local counsel. The team provides information, not legal advice.

### Can I run the executor as a service for other people?

Yes. Several plausible business models:

- Enterprise executor-as-a-service: one operator runs nodes on behalf of users who don't want to self-operate.
- Shared executor pools: multiple parties pool stake and share proportional rewards.
- Redundancy agreements: outlets that rely on Maktub for source protection fund executors to guarantee liveness.

Any of these are permitted. None require permission from the protocol. Compete honestly.

---

## Related reading

- [Running an Executor Node](./running-a-node.md)
- [Executor Economics](./economics.md)
- [Protocol Specification](../developer/protocol-spec.md)

