/**
 * Heartbeat operations mixin (MaktubCore) for {@link MaktubClient}.
 *
 * @module
 */

import type { ContractTransactionResponse } from "ethers";
import type {
  HeartbeatInfo,
  CreateHeartbeatParams,
  CreateHeartbeatResult,
} from "../types/index.js";
import type { MaktubClientConstructor } from "./base.js";
import { beatId } from "../contracts/maktubCore/writeOps.js";

export interface IHeartbeatOps {
  createHeartbeat(
    params: CreateHeartbeatParams,
    feeOverride?: bigint
  ): Promise<CreateHeartbeatResult>;
  checkIn(id: bigint | number): Promise<ContractTransactionResponse>;
  execute(id: bigint | number): Promise<ContractTransactionResponse>;
  updateRecipients(
    id: bigint | number,
    newRecipients: string[]
  ): Promise<ContractTransactionResponse>;
  updateInterval(
    id: bigint | number,
    newInterval: bigint | number
  ): Promise<ContractTransactionResponse>;
  deactivate(id: bigint | number): Promise<ContractTransactionResponse>;
  getHeartbeat(id: bigint | number): Promise<HeartbeatInfo>;
  isExpired(id: bigint | number): Promise<boolean>;
  timeRemaining(id: bigint | number): Promise<bigint>;
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
  beatId(sender: string, salt: string | Uint8Array): bigint;
  creationFeeFor(recipientCount?: number): Promise<bigint>;
}

export function HeartbeatOps<TBase extends MaktubClientConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IHeartbeatOps) {
  return class extends Base {
    // ──────────────────────────────────────────────
    //  Heartbeat Operations (MaktubCore)
    // ──────────────────────────────────────────────

    /**
     * Create a new heartbeat.
     *
     * Sends `creationFeeFor(recipients.length)` ETH to the contract (D-022
     * curve: `baseFee + (N-1) * perAdditionalFee`). All recipients must be
     * registered in RecipientRegistry.
     *
     * The beat ID is deterministic (D-038): `keccak256(abi.encode(sender, salt))`.
     * Pass `params.salt` to choose it, or omit it for a random 32-byte salt.
     *
     * @param params - Heartbeat creation parameters (recipients, payload, interval, optional salt).
     * @param feeOverride - Optional ETH value override (defaults to the on-chain curve fee).
     * @returns The transaction, the derived heartbeat ID, and the salt used.
     */
    async createHeartbeat(
      params: CreateHeartbeatParams,
      feeOverride?: bigint
    ): Promise<CreateHeartbeatResult> {
      await this._ensureInit();
      return this.core.createHeartbeat(params, feeOverride);
    }

    /**
     * Check in on a heartbeat to reset its timer. Free (gas only).
     *
     * @param id - The heartbeat ID.
     * @returns The transaction response.
     */
    async checkIn(id: bigint | number): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.core.checkIn(id);
    }

    /**
     * Execute an expired heartbeat. Caller must be an active executor.
     *
     * @param id - The heartbeat ID.
     * @returns The transaction response.
     */
    async execute(id: bigint | number): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.core.execute(id);
    }

    /**
     * Update the recipient list of a heartbeat. Resets the timer.
     *
     * @param id - The heartbeat ID.
     * @param newRecipients - New array of recipient addresses.
     * @returns The transaction response.
     */
    async updateRecipients(
      id: bigint | number,
      newRecipients: string[]
    ): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.core.updateRecipients(id, newRecipients);
    }

    /**
     * Update the check-in interval. Does NOT reset the timer.
     *
     * @param id - The heartbeat ID.
     * @param newInterval - New interval in seconds.
     * @returns The transaction response.
     */
    async updateInterval(
      id: bigint | number,
      newInterval: bigint | number
    ): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.core.updateInterval(id, newInterval);
    }

    /**
     * Permanently deactivate a heartbeat. Irreversible.
     *
     * @param id - The heartbeat ID.
     * @returns The transaction response.
     */
    async deactivate(id: bigint | number): Promise<ContractTransactionResponse> {
      await this._ensureInit();
      return this.core.deactivate(id);
    }

    /**
     * Get the full heartbeat data for a given ID.
     *
     * @param id - The heartbeat ID.
     * @returns The heartbeat information.
     */
    async getHeartbeat(id: bigint | number): Promise<HeartbeatInfo> {
      await this._ensureInit();
      return this.core.getHeartbeat(id);
    }

    /**
     * Check whether a heartbeat's timer has expired.
     *
     * @param id - The heartbeat ID.
     * @returns True if expired.
     */
    async isExpired(id: bigint | number): Promise<boolean> {
      await this._ensureInit();
      return this.core.isExpired(id);
    }

    /**
     * Get seconds remaining before a heartbeat expires. Returns 0 if expired.
     *
     * @param id - The heartbeat ID.
     * @returns Seconds remaining.
     */
    async timeRemaining(id: bigint | number): Promise<bigint> {
      await this._ensureInit();
      return this.core.timeRemaining(id);
    }

    /**
     * Get the total number of heartbeats ever created.
     *
     * @returns The heartbeat count.
     */
    async heartbeatCount(): Promise<bigint> {
      await this._ensureInit();
      return this.core.heartbeatCount();
    }

    /**
     * Derive the deterministic beat ID for a sender + salt, matching the
     * contract: `id = keccak256(abi.encode(sender, salt))` (D-038). Pure — no
     * network call.
     *
     * @param sender - The creator address.
     * @param salt - The 32-byte salt (hex string or Uint8Array).
     * @returns The heartbeat ID.
     */
    beatId(sender: string, salt: string | Uint8Array): bigint {
      return beatId(sender, salt);
    }

    /**
     * Number of heartbeats created by `owner`.
     *
     * @param owner - The owner address.
     */
    async ownerBeatCount(owner: string): Promise<bigint> {
      await this._ensureInit();
      return this.core.ownerBeatCount(owner);
    }

    /**
     * All heartbeat IDs created by `owner` (exact; creation order, newest last).
     * Includes executed/deactivated beats — filter via {@link getHeartbeat}.
     *
     * @param owner - The owner address.
     */
    async getOwnerBeats(owner: string): Promise<bigint[]> {
      await this._ensureInit();
      return this.core.getOwnerBeats(owner);
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
      await this._ensureInit();
      return this.core.getOwnerBeatsPaged(owner, start, count);
    }

    /**
     * Number of discovery hints for `recipient` (may include stale entries).
     *
     * @param recipient - The recipient address.
     */
    async inboxCount(recipient: string): Promise<bigint> {
      await this._ensureInit();
      return this.core.inboxCount(recipient);
    }

    /**
     * Discovery hints — heartbeat IDs where `recipient` is (or was) a recipient.
     * SOFT index: may contain STALE IDs. Confirm membership via {@link getHeartbeat}.
     *
     * @param recipient - The recipient address.
     */
    async getInboxBeats(recipient: string): Promise<bigint[]> {
      await this._ensureInit();
      return this.core.getInboxBeats(recipient);
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
      await this._ensureInit();
      return this.core.getInboxBeatsPaged(recipient, start, count);
    }

    /**
     * Get the protocol creation fee for a heartbeat with the given recipient
     * count (D-022 curve: `baseFee + (N-1) * perAdditionalFee`).
     *
     * @param recipientCount - The number of recipients (defaults to 1).
     * @returns The fee in wei.
     */
    async creationFeeFor(recipientCount: number = 1): Promise<bigint> {
      await this._ensureInit();
      return this.core.creationFeeFor(recipientCount);
    }
  };
}
