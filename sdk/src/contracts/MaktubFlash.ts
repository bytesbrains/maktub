/**
 * Typed wrapper for the MaktubFlash contract — the instant-triggered citizen.
 *
 * A flash is fire-and-forget: the encrypted payload is committed and the
 * delivery events are emitted in the same transaction (~one Base block).
 * Nothing about a sent flash can ever be modified, recalled, or deactivated.
 *
 * Fee is pure linear (D-022): `recipients.length * perRecipientFee`, and the
 * contract requires `msg.value` to equal it EXACTLY — this wrapper computes
 * it on-chain before sending so callers never mis-pay.
 *
 * @module
 */

import {
  Contract,
  type ContractTransactionResponse,
  type Provider,
  type Signer,
  type BytesLike,
} from "ethers";
import { MAKTUB_FLASH_ABI } from "../constants/abis.js";
import { SignerRequiredError } from "../errors/index.js";
import type { FlashInfo, SendFlashResult } from "../types/index.js";

/**
 * Typed wrapper around the MaktubFlash smart contract.
 */
export class MaktubFlashContract {
  /** The underlying ethers Contract instance. */
  public readonly contract: Contract;

  private readonly _signer: Signer | undefined;

  /**
   * Create a new MaktubFlashContract wrapper.
   * @param address - The deployed MaktubFlash contract address.
   * @param provider - An ethers v6 Provider for read calls.
   * @param signer - An optional ethers v6 Signer for write transactions.
   */
  constructor(address: string, provider: Provider, signer?: Signer) {
    this._signer = signer;
    this.contract = new Contract(address, MAKTUB_FLASH_ABI, signer ?? provider);
  }

  // ──────────────────────────────────────────────
  //  Write Functions
  // ──────────────────────────────────────────────

  /**
   * Send a flash: instant delivery of an encrypted payload to the given
   * recipients (1 to MAX_RECIPIENTS, all of whom must be Flash-eligible on
   * RecipientRegistryV2). Fire-and-forget — cannot be unsent.
   *
   * The exact fee is read from the contract and attached as msg.value
   * (the contract rejects any other amount with `WrongFee`).
   *
   * @param recipients - Recipient addresses (1 to 25).
   * @param payload - The encrypted envelope bytes (or its CID as bytes).
   * @returns The transaction response and the assigned flash ID.
   * @throws {SignerRequiredError} If no signer is configured.
   */
  async flash(recipients: string[], payload: BytesLike): Promise<SendFlashResult> {
    this._requireSigner("flash");

    const fee = await this.flashFeeFor(recipients.length);
    const tx: ContractTransactionResponse = await this.contract.getFunction("flash")(
      recipients,
      payload,
      { value: fee }
    );

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction receipt is null — transaction may have been dropped.");
    }

    // Parse FlashSent to extract the assigned ID.
    let flashId = -1n;
    for (const log of receipt.logs) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed?.name === "FlashSent") {
          flashId = parsed.args.id as bigint;
          break;
        }
      } catch {
        // Not our event — skip.
      }
    }

    return { tx, receipt, flashId, feePaid: fee };
  }

  // ──────────────────────────────────────────────
  //  Read Functions
  // ──────────────────────────────────────────────

  /**
   * The exact fee in wei for a flash with the given recipient count
   * (pure linear: `recipientCount * perRecipientFee`).
   *
   * @param recipientCount - The number of recipients (must be >= 1).
   */
  async flashFeeFor(recipientCount: number): Promise<bigint> {
    return this.contract.getFunction("flashFeeFor")(recipientCount) as Promise<bigint>;
  }

  /** Total number of flashes ever sent (also the next flash ID). */
  async flashCount(): Promise<bigint> {
    return this.contract.getFunction("flashCount")() as Promise<bigint>;
  }

  /**
   * Retrieve the canonical on-chain record for a flash (D-039) — enables
   * trustless late-reader lookup without replaying events.
   *
   * @param id - The flash ID.
   * @returns The sender, recipients, payload, and send timestamp.
   */
  async getFlash(id: bigint | number): Promise<FlashInfo> {
    const result = await this.contract.getFunction("getFlash")(id);
    return {
      sender: result[0] as string,
      recipients: result[1] as string[],
      payload: result[2] as string,
      timestamp: result[3] as bigint,
    };
  }

  /** Number of flashes sent by `sender`. */
  async sentFlashCount(sender: string): Promise<bigint> {
    return this.contract.getFunction("sentFlashCount")(sender) as Promise<bigint>;
  }

  /** All flash IDs sent by `sender` (send order; newest last). */
  async getSentFlashes(sender: string): Promise<bigint[]> {
    const ids = await this.contract.getFunction("getSentFlashes")(sender);
    return (ids as bigint[]).map((id) => BigInt(id));
  }

  /** A page `[start, start+count)` of `sender`'s sent flash IDs. */
  async getSentFlashesPaged(
    sender: string,
    start: bigint | number,
    count: bigint | number
  ): Promise<bigint[]> {
    const ids = await this.contract.getFunction("getSentFlashesPaged")(sender, start, count);
    return (ids as bigint[]).map((id) => BigInt(id));
  }

  /** Number of flashes received by `recipient`. */
  async receivedFlashCount(recipient: string): Promise<bigint> {
    return this.contract.getFunction("receivedFlashCount")(recipient) as Promise<bigint>;
  }

  /** All flash IDs received by `recipient` (exact). */
  async getReceivedFlashes(recipient: string): Promise<bigint[]> {
    const ids = await this.contract.getFunction("getReceivedFlashes")(recipient);
    return (ids as bigint[]).map((id) => BigInt(id));
  }

  /** A page `[start, start+count)` of `recipient`'s received flash IDs. */
  async getReceivedFlashesPaged(
    recipient: string,
    start: bigint | number,
    count: bigint | number
  ): Promise<bigint[]> {
    const ids = await this.contract.getFunction("getReceivedFlashesPaged")(recipient, start, count);
    return (ids as bigint[]).map((id) => BigInt(id));
  }

  /** The immutable per-recipient fee in wei. */
  async perRecipientFee(): Promise<bigint> {
    return this.contract.getFunction("perRecipientFee")() as Promise<bigint>;
  }

  /** The maximum recipients per flash (25). */
  async maxRecipients(): Promise<bigint> {
    return this.contract.getFunction("MAX_RECIPIENTS")() as Promise<bigint>;
  }

  // ──────────────────────────────────────────────
  //  Internal Helpers
  // ──────────────────────────────────────────────

  /** Ensure a signer is available for write operations. */
  private _requireSigner(method: string): void {
    if (!this._signer) {
      throw new SignerRequiredError(method);
    }
  }
}
