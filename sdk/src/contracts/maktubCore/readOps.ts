/**
 * Read operations mixin for {@link MaktubCoreContract}.
 *
 * @module
 */

import type { HeartbeatInfo } from "../../types/index.js";
import type { MaktubCoreConstructor } from "./base.js";

export interface IMaktubCoreReadOps {
  getHeartbeat(id: bigint | number): Promise<HeartbeatInfo>;
  isExpired(id: bigint | number): Promise<boolean>;
  timeRemaining(id: bigint | number): Promise<bigint>;
  isExecutor(account: string): Promise<boolean>;
  heartbeatCount(): Promise<bigint>;
  ownerBeatCount(owner: string): Promise<bigint>;
  getOwnerBeats(owner: string): Promise<bigint[]>;
  getOwnerBeatsPaged(
    owner: string,
    start: bigint | number,
    count: bigint | number
  ): Promise<bigint[]>;
  inboxCount(recipient: string): Promise<bigint>;
  getInboxBeats(recipient: string): Promise<bigint[]>;
  getInboxBeatsPaged(
    recipient: string,
    start: bigint | number,
    count: bigint | number
  ): Promise<bigint[]>;
  creationFeeFor(recipientCount: number): Promise<bigint>;
  baseFee(): Promise<bigint>;
  perAdditionalFee(): Promise<bigint>;
  feeReceiver(): Promise<string>;
  minInterval(): Promise<bigint>;
  maxInterval(): Promise<bigint>;
  maxRecipients(): Promise<bigint>;
}

export function MaktubCoreReadOps<TBase extends MaktubCoreConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IMaktubCoreReadOps) {
  return class extends Base implements IMaktubCoreReadOps {
    // ──────────────────────────────────────────────
    //  Read Functions
    // ──────────────────────────────────────────────

    /**
     * Retrieve the full heartbeat data for a given ID.
     *
     * @param id - The heartbeat ID.
     * @returns The heartbeat information.
     */
    async getHeartbeat(id: bigint | number): Promise<HeartbeatInfo> {
      const result = await this.contract.getFunction("getHeartbeat")(id);
      return {
        owner: result[0] as string,
        recipients: result[1] as string[],
        payload: result[2] as string,
        interval: result[3] as bigint,
        lastCheckIn: result[4] as bigint,
        createdAt: result[5] as bigint,
        checkInCount: result[6] as bigint,
        executed: result[7] as boolean,
        deactivated: result[8] as boolean,
      };
    }

    /**
     * Check whether a heartbeat's timer has expired.
     *
     * @param id - The heartbeat ID.
     * @returns True if the heartbeat is expired.
     */
    async isExpired(id: bigint | number): Promise<boolean> {
      return this.contract.getFunction("isExpired")(id) as Promise<boolean>;
    }

    /**
     * Get the number of seconds remaining before a heartbeat expires.
     * Returns 0 if already expired.
     *
     * @param id - The heartbeat ID.
     * @returns Seconds remaining.
     */
    async timeRemaining(id: bigint | number): Promise<bigint> {
      return this.contract.getFunction("timeRemaining")(id) as Promise<bigint>;
    }

    /**
     * Check whether an address is an eligible executor.
     *
     * @param account - The address to check.
     * @returns True if the address is an active executor.
     */
    async isExecutor(account: string): Promise<boolean> {
      return this.contract.getFunction("isExecutor")(account) as Promise<boolean>;
    }

    /**
     * Get the total number of heartbeats ever created (a protocol stat — NOT an
     * ID source and NOT enumerable; IDs are content-addressed per D-038).
     *
     * @returns The heartbeat count.
     */
    async heartbeatCount(): Promise<bigint> {
      return this.contract.getFunction("heartbeatCount")() as Promise<bigint>;
    }

    /**
     * Number of heartbeats created by `owner`.
     *
     * @param owner - The owner address.
     */
    async ownerBeatCount(owner: string): Promise<bigint> {
      return this.contract.getFunction("ownerBeatCount")(owner) as Promise<bigint>;
    }

    /**
     * All heartbeat IDs created by `owner` (exact; creation order, newest last).
     * Includes executed/deactivated beats — filter via {@link getHeartbeat}.
     *
     * @param owner - The owner address.
     */
    async getOwnerBeats(owner: string): Promise<bigint[]> {
      const ids = await this.contract.getFunction("getOwnerBeats")(owner);
      return (ids as bigint[]).map((id) => BigInt(id));
    }

    /**
     * A page `[start, start+count)` of `owner`'s heartbeat IDs.
     *
     * @param owner - The owner address.
     * @param start - The start index.
     * @param count - The page size.
     */
    async getOwnerBeatsPaged(
      owner: string,
      start: bigint | number,
      count: bigint | number
    ): Promise<bigint[]> {
      const ids = await this.contract.getFunction("getOwnerBeatsPaged")(owner, start, count);
      return (ids as bigint[]).map((id) => BigInt(id));
    }

    /**
     * Number of discovery hints recorded for `recipient` (may include stale entries).
     *
     * @param recipient - The recipient address.
     */
    async inboxCount(recipient: string): Promise<bigint> {
      return this.contract.getFunction("inboxCount")(recipient) as Promise<bigint>;
    }

    /**
     * Discovery hints — heartbeat IDs where `recipient` is (or was) a recipient.
     * SOFT index: de-duplicated, never misses a current recipient, but may
     * contain STALE IDs. Callers MUST confirm membership via {@link getHeartbeat}.
     *
     * @param recipient - The recipient address.
     */
    async getInboxBeats(recipient: string): Promise<bigint[]> {
      const ids = await this.contract.getFunction("getInboxBeats")(recipient);
      return (ids as bigint[]).map((id) => BigInt(id));
    }

    /**
     * A page `[start, start+count)` of `recipient`'s discovery hints.
     *
     * @param recipient - The recipient address.
     * @param start - The start index.
     * @param count - The page size.
     */
    async getInboxBeatsPaged(
      recipient: string,
      start: bigint | number,
      count: bigint | number
    ): Promise<bigint[]> {
      const ids = await this.contract.getFunction("getInboxBeatsPaged")(recipient, start, count);
      return (ids as bigint[]).map((id) => BigInt(id));
    }

    /**
     * Get the protocol fee required to create a heartbeat with the given
     * recipient count (D-022 curve: `baseFee + (N-1) * perAdditionalFee`).
     *
     * @param recipientCount - The number of recipients (must be >= 1).
     * @returns The creation fee in wei.
     */
    async creationFeeFor(recipientCount: number): Promise<bigint> {
      return this.contract.getFunction("creationFeeFor")(recipientCount) as Promise<bigint>;
    }

    /**
     * Get the base creation fee (single-recipient heartbeat).
     *
     * @returns The base fee in wei.
     */
    async baseFee(): Promise<bigint> {
      return this.contract.getFunction("baseFee")() as Promise<bigint>;
    }

    /**
     * Get the per-additional-recipient fee.
     *
     * @returns The per-additional fee in wei.
     */
    async perAdditionalFee(): Promise<bigint> {
      return this.contract.getFunction("perAdditionalFee")() as Promise<bigint>;
    }

    /**
     * Get the fee receiver address.
     *
     * @returns The fee receiver address.
     */
    async feeReceiver(): Promise<string> {
      return this.contract.getFunction("feeReceiver")() as Promise<string>;
    }

    /**
     * Get the minimum allowed interval (1 hour in seconds).
     *
     * @returns The minimum interval.
     */
    async minInterval(): Promise<bigint> {
      return this.contract.getFunction("MIN_INTERVAL")() as Promise<bigint>;
    }

    /**
     * Get the maximum allowed interval (365 days in seconds).
     *
     * @returns The maximum interval.
     */
    async maxInterval(): Promise<bigint> {
      return this.contract.getFunction("MAX_INTERVAL")() as Promise<bigint>;
    }

    /**
     * Get the maximum number of recipients per heartbeat.
     *
     * @returns The maximum recipients count.
     */
    async maxRecipients(): Promise<bigint> {
      return this.contract.getFunction("MAX_RECIPIENTS")() as Promise<bigint>;
    }
  };
}
