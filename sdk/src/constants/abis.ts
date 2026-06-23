/**
 * Human-readable ABIs for Maktub Protocol v3 contracts.
 *
 * Using ethers v6 human-readable ABI format for clarity and smaller bundle size.
 * These are derived from the compiled Hardhat artifacts in artifacts/contracts/v3/.
 *
 * This module is a thin barrel — each ABI lives in its own file under `./abis/`.
 *
 * @module
 */

export { MAKTUB_CORE_ABI } from "./abis/maktubCore.js";
export { RECIPIENT_REGISTRY_ABI } from "./abis/recipientRegistry.js";
export { MKTB_TOKEN_ABI } from "./abis/mktbToken.js";
export { EXECUTOR_REWARDS_ABI } from "./abis/executorRewards.js";
export { MKTB_GOVERNANCE_ABI } from "./abis/mktbGovernance.js";
export { RECIPIENT_REGISTRY_V2_ABI } from "./abis/recipientRegistryV2.js";
export { MAKTUB_FLASH_ABI } from "./abis/maktubFlash.js";
