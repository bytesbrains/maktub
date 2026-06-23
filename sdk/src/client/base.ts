/**
 * Mixin base for {@link MaktubClient}.
 *
 * Holds the shared state (provider, signer, contract wrappers), the
 * constructor, initialization, and the protected guards that the per-concern
 * mixins build on. See `src/MaktubClient.ts` for the public composition.
 *
 * @module
 */

import type { Provider, Signer } from "ethers";
import type {
  MaktubClientConfig,
  ContractAddresses,
} from "../types/index.js";
import { MaktubCoreContract } from "../contracts/MaktubCore.js";
import { RecipientRegistryContract } from "../contracts/RecipientRegistry.js";
import { RecipientRegistryV2Contract } from "../contracts/RecipientRegistryV2.js";
import { MaktubFlashContract } from "../contracts/MaktubFlash.js";
import { MktbTokenContract } from "../contracts/MktbToken.js";
import { ExecutorRewardsContract } from "../contracts/ExecutorRewards.js";
import { MktbGovernanceContract } from "../contracts/MktbGovernance.js";
import { getNetworkConfig } from "../constants/addresses.js";
import {
  UnsupportedNetworkError,
  NetworkDetectionError,
  FlashNotAvailableError,
} from "../errors/index.js";

export class MaktubClientBase {
  /** The ethers Provider used for read calls. */
  public readonly provider: Provider;

  /** The ethers Signer used for write transactions (undefined for read-only). */
  public readonly signer: Signer | undefined;

  /** Direct access to the MaktubCore contract wrapper. */
  public core!: MaktubCoreContract;

  /** Direct access to the RecipientRegistry contract wrapper. */
  public registry!: RecipientRegistryContract;

  /** Direct access to the MktbToken contract wrapper. */
  public token!: MktbTokenContract;

  /** Direct access to the ExecutorRewards contract wrapper. */
  public rewards!: ExecutorRewardsContract;

  /** Direct access to the MktbGovernance contract wrapper. */
  public governance!: MktbGovernanceContract;

  /** RecipientRegistryV2 wrapper (undefined on networks without a Flash deployment). */
  public registryV2: RecipientRegistryV2Contract | undefined;

  /** MaktubFlash wrapper (undefined on networks without a Flash deployment). */
  public flashContract: MaktubFlashContract | undefined;

  private _addresses: ContractAddresses | undefined;
  private _initialized = false;
  private _initPromise: Promise<void> | null = null;

  /**
   * Create a new MaktubClient.
   *
   * If `addresses` is not provided, the client will auto-detect the network
   * from the provider and resolve addresses from the built-in registry.
   * Call {@link init} before making any contract calls if not providing addresses.
   *
   * @param config - The client configuration with provider, optional signer, and optional addresses.
   */
  constructor(config: MaktubClientConfig) {
    this.provider = config.provider;
    this.signer = config.signer;
    this._addresses = config.addresses;

    if (this._addresses) {
      this._initContracts(this._addresses);
    }
  }

  /**
   * Initialize the client by detecting the network and resolving contract addresses.
   *
   * This is called automatically on the first contract call if addresses
   * were not provided in the constructor. You can call it explicitly to
   * handle initialization errors upfront.
   *
   * Concurrent calls share a single in-flight initialization (the network is
   * detected only once); the cached promise is cleared on failure so a later
   * call can retry.
   *
   * @throws {NetworkDetectionError} If the provider's network cannot be determined.
   * @throws {UnsupportedNetworkError} If no addresses are configured for the detected chain.
   */
  async init(): Promise<void> {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      if (!this._addresses) {
        const network = await this.provider.getNetwork();
        if (!network) {
          throw new NetworkDetectionError();
        }

        const chainId = Number(network.chainId);
        const config = getNetworkConfig(chainId);
        if (!config) {
          throw new UnsupportedNetworkError(chainId);
        }

        this._addresses = config.contracts;
      }

      this._initContracts(this._addresses);
    })();

    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  /**
   * Ensure the client is initialized before making contract calls.
   * Auto-initializes on first call if addresses were not provided.
   */
  protected async _ensureInit(): Promise<void> {
    if (!this._initialized) {
      await this.init();
    }
  }

  /**
   * Initialize all contract wrappers with the resolved addresses.
   */
  private _initContracts(addresses: ContractAddresses): void {
    this.core = new MaktubCoreContract(
      addresses.maktubCore,
      this.provider,
      this.signer
    );
    this.registry = new RecipientRegistryContract(
      addresses.recipientRegistry,
      this.provider,
      this.signer
    );
    this.token = new MktbTokenContract(
      addresses.mktbToken,
      this.provider,
      this.signer
    );
    this.rewards = new ExecutorRewardsContract(
      addresses.executorRewards,
      this.provider,
      this.signer
    );
    this.governance = new MktbGovernanceContract(
      addresses.mktbGovernance,
      this.provider,
      this.signer
    );
    if (addresses.recipientRegistryV2) {
      this.registryV2 = new RecipientRegistryV2Contract(
        addresses.recipientRegistryV2,
        this.provider,
        this.signer
      );
    }
    if (addresses.maktubFlash) {
      this.flashContract = new MaktubFlashContract(
        addresses.maktubFlash,
        this.provider,
        this.signer
      );
    }
    this._initialized = true;
  }

  /** Access the Flash contract wrapper, throwing if unavailable on this network. */
  protected _requireFlash(): MaktubFlashContract {
    if (!this.flashContract) {
      throw new FlashNotAvailableError("maktubFlash");
    }
    return this.flashContract;
  }

  /** Access the V2 registry wrapper, throwing if unavailable on this network. */
  protected _requireRegistryV2(): RecipientRegistryV2Contract {
    if (!this.registryV2) {
      throw new FlashNotAvailableError("recipientRegistryV2");
    }
    return this.registryV2;
  }
}

export type MaktubClientConstructor = new (
  ...args: any[]
) => MaktubClientBase;
