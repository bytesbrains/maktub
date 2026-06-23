// src/monitor.js — Track active heartbeats and surface those with expired timers.
//
// State is derived from the chain:
//   1. On startup, scan past HeartbeatCreated events.
//   2. Every tick, poll new events in the block range since the last scan.
//   3. Remove heartbeats from the watchlist as they are executed or deactivated.
//   4. `expired()` compares cached timers against now; `executor.js` re-checks
//      on-chain with `isExpired()` before spending gas.
//
// We deliberately avoid ethers' event subscriptions (which use eth_newFilter);
// public Base RPCs drop those filters after a minute or two, producing noisy
// "filter not found" errors. Direct `queryFilter` over explicit block ranges
// is boring, reliable, and works against every RPC.

'use strict';

const { ethers } = require('ethers');
const { log, warn, err } = require('./log');

const CORE_ABI = [
  'function heartbeatCount() view returns (uint256)',
  'function getHeartbeat(uint256 id) view returns (address owner, address[] recipients, bytes payload, uint256 interval, uint256 lastCheckIn, uint256 createdAt, uint256 checkInCount, bool executed, bool deactivated)',
  'function isExpired(uint256 id) view returns (bool)',
  'function timeRemaining(uint256 id) view returns (uint256)',
  'event HeartbeatCreated(uint256 indexed id, address indexed owner, address[] recipients, uint256 interval)',
  'event HeartbeatCheckedIn(uint256 indexed id, uint256 timestamp)',
  'event HeartbeatExecuted(uint256 indexed id, address indexed executor, uint256 timestamp)',
  'event HeartbeatDeactivated(uint256 indexed id)',
];

// Max block span per eth_getLogs call. Base RPCs typically accept 10k+;
// we stay conservative so public RPCs don't throttle us.
const LOG_CHUNK = 5000n;

class Monitor {
  constructor(provider, wallet, cfg) {
    this.provider = provider;
    this.wallet = wallet;
    this.cfg = cfg;
    this.core = new ethers.Contract(cfg.contracts.MaktubCore, CORE_ABI, provider);
    /** @type {Map<string, { id: bigint, owner: string, lastCheckIn: bigint, interval: bigint }>} */
    this.active = new Map();
    this.lastScannedBlock = 0n;
  }

  // Scan all historical HeartbeatCreated events, plus any intervening
  // CheckedIn / Executed / Deactivated events to reconstruct current state.
  async bootstrap() {
    const latest = BigInt(await this.provider.getBlockNumber());
    let from = BigInt(this.cfg.deployBlock || 0);
    if (from === 0n) {
      // If we don't know the deploy block, walk back from latest in chunks
      // of LOG_CHUNK*20 blocks until we pick up the first event or run out.
      // In practice on Base Sepolia with a fresh deployment this is fast.
      from = latest > 500_000n ? latest - 500_000n : 0n;
    }

    log(`[monitor] Scanning HeartbeatCreated events from block ${from} to ${latest}…`);

    const createdFilter = this.core.filters.HeartbeatCreated();
    let totalCreated = 0;
    for (let start = from; start <= latest; start += LOG_CHUNK) {
      const end = start + LOG_CHUNK - 1n > latest ? latest : start + LOG_CHUNK - 1n;
      let events;
      try {
        events = await this.core.queryFilter(createdFilter, start, end);
      } catch (e) {
        warn(`[monitor] queryFilter failed ${start}-${end}: ${e.shortMessage || e.message}. Retrying with smaller chunk.`);
        // Fallback: try narrower chunks.
        events = [];
        const step = LOG_CHUNK / 5n;
        for (let s = start; s <= end; s += step) {
          const e2 = s + step - 1n > end ? end : s + step - 1n;
          try {
            const evs = await this.core.queryFilter(createdFilter, s, e2);
            events.push(...evs);
          } catch (e3) {
            err(`[monitor] narrow queryFilter also failed ${s}-${e2}: ${e3.shortMessage || e3.message}`);
          }
        }
      }
      for (const ev of events) {
        const id = ev.args.id;
        this.active.set(id.toString(), { id, owner: ev.args.owner });
        totalCreated++;
      }
    }

    log(`[monitor] Found ${totalCreated} historical heartbeats.`);

    // Drop any that are already executed or deactivated, and hydrate timers.
    await this._refreshAll();
    this.lastScannedBlock = latest;
    log(`[monitor] Tracking ${this.active.size} active heartbeats.`);
  }

  // Poll for new events since the last scan. Called from the main loop.
  // This avoids ethers' built-in eth_newFilter-based polling, which public
  // Base Sepolia RPCs drop aggressively ("filter not found").
  async pollEvents() {
    const latest = BigInt(await this.provider.getBlockNumber());
    if (latest <= this.lastScannedBlock) return;

    const from = this.lastScannedBlock + 1n;
    const to = latest;

    try {
      const [created, checked, executed, deactivated] = await Promise.all([
        this.core.queryFilter(this.core.filters.HeartbeatCreated(), from, to),
        this.core.queryFilter(this.core.filters.HeartbeatCheckedIn(), from, to),
        this.core.queryFilter(this.core.filters.HeartbeatExecuted(), from, to),
        this.core.queryFilter(this.core.filters.HeartbeatDeactivated(), from, to),
      ]);

      for (const ev of created) {
        log(`[monitor] HeartbeatCreated id=${ev.args.id} owner=${ev.args.owner}`);
        this.active.set(ev.args.id.toString(), { id: ev.args.id, owner: ev.args.owner });
        await this._hydrateOne(ev.args.id);
      }
      for (const ev of checked) {
        const key = ev.args.id.toString();
        const hb = this.active.get(key);
        if (hb) {
          hb.lastCheckIn = BigInt(ev.args.timestamp);
          log(`[monitor] HeartbeatCheckedIn id=${ev.args.id}`);
        }
      }
      for (const ev of executed) {
        log(`[monitor] HeartbeatExecuted id=${ev.args.id} executor=${ev.args.executor}`);
        this.active.delete(ev.args.id.toString());
      }
      for (const ev of deactivated) {
        log(`[monitor] HeartbeatDeactivated id=${ev.args.id}`);
        this.active.delete(ev.args.id.toString());
      }

      this.lastScannedBlock = latest;
    } catch (e) {
      warn(`[monitor] pollEvents ${from}-${to} failed: ${e.shortMessage || e.message}`);
      // Don't advance lastScannedBlock — we'll retry the same range.
    }
  }

  async unsubscribe() {
    // No-op: we no longer hold filter subscriptions. Kept for API symmetry.
  }

  // Fetch on-chain state for every tracked heartbeat and prune terminal ones.
  async _refreshAll() {
    const ids = [...this.active.values()].map(v => v.id);
    for (const id of ids) {
      await this._hydrateOne(id);
    }
  }

  async _hydrateOne(id) {
    try {
      const hb = await this.core.getHeartbeat(id);
      const [owner, , , interval, lastCheckIn, , , executed, deactivated] = hb;
      if (executed || deactivated) {
        this.active.delete(id.toString());
        return null;
      }
      const entry = {
        id,
        owner,
        interval: BigInt(interval),
        lastCheckIn: BigInt(lastCheckIn),
      };
      this.active.set(id.toString(), entry);
      return entry;
    } catch (e) {
      warn(`[monitor] hydrate id=${id} failed: ${e.shortMessage || e.message}`);
      return null;
    }
  }

  // Return the list of heartbeats whose timer has expired as of `nowSec`.
  // Purely local check using cached state — call _hydrateOne if state is stale.
  expired(nowSec) {
    const out = [];
    for (const hb of this.active.values()) {
      if (!hb.interval || !hb.lastCheckIn) continue;
      if (nowSec > hb.lastCheckIn + hb.interval) {
        out.push(hb);
      }
    }
    return out;
  }

  // Ask the chain directly — authoritative, used right before executing.
  async isExpiredOnChain(id) {
    try {
      return await this.core.isExpired(id);
    } catch (e) {
      warn(`[monitor] isExpired id=${id} failed: ${e.shortMessage || e.message}`);
      return false;
    }
  }

  size() {
    return this.active.size;
  }

  // For status reporting.
  summarize(nowSec) {
    const total = this.active.size;
    let expired = 0;
    let nearest = null;
    for (const hb of this.active.values()) {
      if (!hb.interval || !hb.lastCheckIn) continue;
      const expiresAt = hb.lastCheckIn + hb.interval;
      if (nowSec > expiresAt) {
        expired++;
      } else {
        const remaining = expiresAt - nowSec;
        if (nearest === null || remaining < nearest) nearest = remaining;
      }
    }
    return { total, expired, nearestRemainingSec: nearest };
  }
}

module.exports = { Monitor };
