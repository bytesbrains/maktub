/**
 * Custom error classes for the Maktub Protocol SDK.
 *
 * @module
 */

/** Base error class for all Maktub SDK errors. */
export class MaktubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaktubError";
  }
}

/** Thrown when a signer is required but not provided. */
export class SignerRequiredError extends MaktubError {
  constructor(method: string) {
    super(
      `A signer is required to call ${method}(). Pass a signer in MaktubClientConfig.`
    );
    this.name = "SignerRequiredError";
  }
}

/** Thrown when contract addresses cannot be resolved for the connected network. */
export class UnsupportedNetworkError extends MaktubError {
  /** The chain ID that is not supported. */
  public readonly chainId: number;

  constructor(chainId: number) {
    super(
      `No contract addresses configured for chain ID ${chainId}. ` +
        `Provide addresses in MaktubClientConfig or use a supported network (Base: 8453, Base Sepolia: 84532, Localhost: 31337).`
    );
    this.name = "UnsupportedNetworkError";
    this.chainId = chainId;
  }
}

/** Thrown when a heartbeat ID does not exist on-chain. */
export class HeartbeatNotFoundError extends MaktubError {
  /** The heartbeat ID that was not found. */
  public readonly heartbeatId: bigint;

  constructor(heartbeatId: bigint) {
    super(`Heartbeat #${heartbeatId} does not exist.`);
    this.name = "HeartbeatNotFoundError";
    this.heartbeatId = heartbeatId;
  }
}

/** Thrown when a contract call reverts with a known error. */
export class ContractRevertError extends MaktubError {
  /** The Solidity error name (e.g. "InsufficientFee", "NotOwner"). */
  public readonly errorName: string;

  constructor(errorName: string, message?: string) {
    super(message ?? `Contract reverted with: ${errorName}`);
    this.name = "ContractRevertError";
    this.errorName = errorName;
  }
}

/** Thrown when the provider network cannot be determined. */
export class NetworkDetectionError extends MaktubError {
  constructor() {
    super("Failed to detect network from provider. Ensure the provider is connected.");
    this.name = "NetworkDetectionError";
  }
}

/** Thrown when a Flash operation is attempted on a network with no Flash deployment. */
export class FlashNotAvailableError extends MaktubError {
  constructor(contract: string) {
    super(
      `The connected network has no ${contract} address configured. ` +
        `Maktub Flash requires a network where MaktubFlash and RecipientRegistryV2 are deployed ` +
        `(Base Sepolia today), or explicit addresses in MaktubClientConfig.`
    );
    this.name = "FlashNotAvailableError";
  }
}
