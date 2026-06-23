/**
 * Write operations mixin for {@link MaktubCoreContract}.
 *
 * @module
 */

import {
  AbiCoder,
  getBytes,
  hexlify,
  keccak256,
  randomBytes,
  type ContractTransactionResponse,
} from "ethers";
import type {
  CreateHeartbeatParams,
  CreateHeartbeatResult,
} from "../../types/index.js";
import type { MaktubCoreConstructor } from "./base.js";

/**
 * Derive the deterministic beat ID for a given sender + salt, matching the
 * contract exactly: `id = keccak256(abi.encode(sender, salt))` (D-038).
 *
 * @param sender - The creator address (`msg.sender` at create time).
 * @param salt - The 32-byte salt (hex string or Uint8Array).
 * @returns The heartbeat ID as a bigint.
 */
export function beatId(sender: string, salt: string | Uint8Array): bigint {
  const saltHex = hexlify(salt);
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32"],
    [sender, saltHex]
  );
  return BigInt(keccak256(encoded));
}

/** Normalize a caller-provided salt (or generate a random one) to 32-byte hex. */
function normalizeSalt(salt?: string | Uint8Array): string {
  if (salt === undefined) {
    return hexlify(randomBytes(32));
  }
  const bytes = getBytes(salt);
  if (bytes.length !== 32) {
    throw new Error(
      `salt must be exactly 32 bytes, received ${bytes.length} bytes.`
    );
  }
  return hexlify(bytes);
}

export interface IMaktubCoreWriteOps {
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
}

export function MaktubCoreWriteOps<TBase extends MaktubCoreConstructor>(
  Base: TBase
): TBase & (new (...args: any[]) => IMaktubCoreWriteOps) {
  return class extends Base implements IMaktubCoreWriteOps {
    // ──────────────────────────────────────────────
    //  Write Functions
    // ──────────────────────────────────────────────

    /**
     * Create a new heartbeat.
     *
     * The caller must send at least `creationFeeFor(recipients.length)` ETH —
     * the D-022 curve `baseFee + (N-1) * perAdditionalFee`. Excess is refunded.
     * All recipients must be registered in RecipientRegistry.
     *
     * The beat ID is deterministic (D-038): `keccak256(abi.encode(sender, salt))`.
     * Pass `params.salt` to choose it, or omit it for a random 32-byte salt.
     * Reusing a salt reverts `HeartbeatAlreadyExists`; duplicate recipients
     * revert `DuplicateRecipient`.
     *
     * @param params - The heartbeat creation parameters (optional `salt`).
     * @param feeOverride - Optional ETH value to send (defaults to the on-chain curve fee).
     * @returns The transaction response, the derived heartbeat ID, and the salt used.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async createHeartbeat(
      params: CreateHeartbeatParams,
      feeOverride?: bigint
    ): Promise<CreateHeartbeatResult> {
      this._requireSigner("createHeartbeat");

      const salt = normalizeSalt(params.salt);
      const fee = feeOverride ?? await (this as unknown as { creationFeeFor(c: number): Promise<bigint> }).creationFeeFor(params.recipients.length);
      const tx: ContractTransactionResponse = await this.contract.getFunction("createHeartbeat")(
        salt,
        params.recipients,
        params.payload,
        params.interval,
        { value: fee }
      );

      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction receipt is null — transaction may have been dropped.");
      }

      // Prefer the canonical HeartbeatCreated id; fall back to deriving it from
      // the salt + signer (the contract derives it identically — D-038).
      const createdEvent = receipt.logs
        .map((log) => {
          try {
            return this.contract.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            });
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "HeartbeatCreated");

      let heartbeatId = createdEvent?.args?.[0] as bigint | undefined;
      if (heartbeatId === undefined) {
        const from = receipt.from;
        if (!from) {
          throw new Error("Failed to derive heartbeat ID: no HeartbeatCreated event and no receipt.from.");
        }
        heartbeatId = beatId(from, salt);
      }

      return { tx, heartbeatId, salt };
    }

    /**
     * Check in on a heartbeat to reset its timer. Free (gas only).
     *
     * @param id - The heartbeat ID.
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async checkIn(id: bigint | number): Promise<ContractTransactionResponse> {
      this._requireSigner("checkIn");
      return this.contract.getFunction("checkIn")(id) as Promise<ContractTransactionResponse>;
    }

    /**
     * Execute an expired heartbeat. Caller must be an active executor
     * (staked in ExecutorRewards).
     *
     * @param id - The heartbeat ID.
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async execute(id: bigint | number): Promise<ContractTransactionResponse> {
      this._requireSigner("execute");
      return this.contract.getFunction("execute")(id) as Promise<ContractTransactionResponse>;
    }

    /**
     * Update the recipient list of a heartbeat. Resets the timer.
     *
     * @param id - The heartbeat ID.
     * @param newRecipients - The new array of recipient addresses.
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async updateRecipients(
      id: bigint | number,
      newRecipients: string[]
    ): Promise<ContractTransactionResponse> {
      this._requireSigner("updateRecipients");
      return this.contract.getFunction("updateRecipients")(id, newRecipients) as Promise<ContractTransactionResponse>;
    }

    /**
     * Update the check-in interval of a heartbeat. Does NOT reset the timer.
     *
     * @param id - The heartbeat ID.
     * @param newInterval - The new interval in seconds.
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async updateInterval(
      id: bigint | number,
      newInterval: bigint | number
    ): Promise<ContractTransactionResponse> {
      this._requireSigner("updateInterval");
      return this.contract.getFunction("updateInterval")(id, newInterval) as Promise<ContractTransactionResponse>;
    }

    /**
     * Permanently deactivate a heartbeat. Irreversible.
     *
     * @param id - The heartbeat ID.
     * @returns The transaction response.
     * @throws {SignerRequiredError} If no signer is configured.
     */
    async deactivate(id: bigint | number): Promise<ContractTransactionResponse> {
      this._requireSigner("deactivate");
      return this.contract.getFunction("deactivate")(id) as Promise<ContractTransactionResponse>;
    }
  };
}
