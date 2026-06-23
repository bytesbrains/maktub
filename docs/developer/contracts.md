# Contract Reference

Complete reference for the five deployed v3 contracts. For each contract, this document lists every external/public function, event, error, constant, and state variable, with argument semantics and a note on when to call it.

The contracts compile against **Solidity 0.8.28** and use **OpenZeppelin Contracts v5**. All bytecode is verifiable on Basescan after deployment.

---

## Table of contents

- [MaktubCore](#maktubcore)
- [RecipientRegistry](#recipientregistry)
- [MktbToken](#mktbtoken)
- [ExecutorRewards](#executorrewards)
- [MktbGovernance](#mktbgovernance)
- [Interfaces](#interfaces)
- [Deployed addresses](#deployed-addresses)

---

## MaktubCore

**File:** `contracts/v3/core/MaktubCore.sol`
**Upgradeable:** No. Immutable bytecode, no admin, no pause, no owner.
**Inherits:** `ReentrancyGuard`

Implements the heartbeat primitive: create, check-in, update, execute, deactivate.

### Constants

| Name | Type | Value | Meaning |
|---|---|---|---|
| `MIN_INTERVAL` | `uint256` | `1 hours` | Minimum heartbeat interval |
| `MAX_INTERVAL` | `uint256` | `365 days` | Maximum heartbeat interval |
| `MAX_RECIPIENTS` | `uint256` | `50` | Maximum recipients per heartbeat |

### Immutables

| Name | Type | Set at deploy | Meaning |
|---|---|---|---|
| `creationFee` | `uint256` | Yes | Creation fee in wei, fixed at deploy |
| `feeReceiver` | `address payable` | Yes | Fee recipient (receive-only, no admin) |
| `recipientRegistry` | `RecipientRegistry` | Yes | Linked registry contract |
| `executorRewards` | `IExecutorRewards` | Yes | Linked executor rewards contract |

### Public state

| Name | Type | Meaning |
|---|---|---|
| `heartbeatCount` | `uint256` | Total heartbeats ever created; also the next id |

### External functions — write

#### `createHeartbeat`

```solidity
function createHeartbeat(
    address[] calldata recipients,
    bytes calldata payload,
    uint256 interval
) external payable nonReentrant returns (uint256 id);
```

Creates a new heartbeat.

- **Reverts with** `InsufficientFee` if `msg.value < creationFee`.
- **Reverts with** `IntervalTooShort` if `interval < MIN_INTERVAL`.
- **Reverts with** `IntervalTooLong` if `interval > MAX_INTERVAL`.
- **Reverts with** `NoRecipients` if `recipients.length == 0`.
- **Reverts with** `TooManyRecipients` if `recipients.length > MAX_RECIPIENTS`.
- **Reverts with** `EmptyPayload` if `payload.length == 0`.
- **Reverts with** `RecipientNotRegistered(address)` if any recipient is not registered.
- **Emits** `HeartbeatCreated(id, owner, recipients, interval)`.
- **Returns** the new heartbeat id.
- Transfers `creationFee` to `feeReceiver`; refunds `msg.value - creationFee` to the caller.

#### `checkIn`

```solidity
function checkIn(uint256 id) external;
```

Resets the heartbeat's timer.

- **Reverts with** `HeartbeatNotFound` if `id >= heartbeatCount`.
- **Reverts with** `NotOwner` if `msg.sender != heartbeat.owner`.
- **Reverts with** `AlreadyExecuted` if the heartbeat has been executed.
- **Reverts with** `HeartbeatIsDeactivated` if the heartbeat has been deactivated.
- **Emits** `HeartbeatCheckedIn(id, block.timestamp)`.
- Sets `lastCheckIn = block.timestamp` and increments `checkInCount`.

#### `execute`

```solidity
function execute(uint256 id) external nonReentrant;
```

Triggers delivery after the timer has expired.

- **Reverts with** `HeartbeatNotFound` if `id >= heartbeatCount`.
- **Reverts with** `AlreadyExecuted` if the heartbeat has been executed.
- **Reverts with** `HeartbeatIsDeactivated` if the heartbeat has been deactivated.
- **Reverts with** `NotExecutor` if the caller is not an active executor.
- **Reverts with** `TimerNotExpired` if `block.timestamp <= lastCheckIn + interval`.
- **Emits** `HeartbeatExecuted(id, executor, block.timestamp)`.
- Sets `executed = true` (one-shot, irreversible).

#### `updateRecipients`

```solidity
function updateRecipients(
    uint256 id,
    address[] calldata newRecipients
) external nonReentrant;
```

Replaces the recipient list. Resets the timer.

- Same precondition checks as `checkIn` plus: `NoRecipients`, `TooManyRecipients`, `RecipientNotRegistered`.
- **Emits** `RecipientsUpdated(id, newRecipients)`.
- Sets `lastCheckIn = block.timestamp`.

#### `updateInterval`

```solidity
function updateInterval(uint256 id, uint256 newInterval) external;
```

Changes the interval. **Does not** reset the timer.

- Same precondition checks as `checkIn` plus: `IntervalTooShort`, `IntervalTooLong`.
- **Emits** `IntervalUpdated(id, newInterval)`.

#### `deactivate`

```solidity
function deactivate(uint256 id) external;
```

Permanently deactivates the heartbeat. Irreversible.

- Same precondition checks as `checkIn`.
- **Emits** `HeartbeatDeactivated(id)`.
- Sets `deactivated = true`.

### External functions — view

#### `getHeartbeat`

```solidity
function getHeartbeat(uint256 id) external view returns (
    address owner,
    address[] memory recipients,
    bytes memory payload,
    uint256 interval,
    uint256 lastCheckIn,
    uint256 createdAt,
    uint256 checkInCount,
    bool executed,
    bool deactivated
);
```

Returns the full heartbeat record.

#### `isExpired`

```solidity
function isExpired(uint256 id) external view returns (bool);
```

True if `block.timestamp > lastCheckIn + interval`.

#### `timeRemaining`

```solidity
function timeRemaining(uint256 id) external view returns (uint256);
```

Seconds remaining before the timer expires. Returns 0 if already expired.

#### `isExecutor`

```solidity
function isExecutor(address account) external view returns (bool);
```

Delegates to `executorRewards.isActiveExecutor(account)`.

### Events

```solidity
event HeartbeatCreated(uint256 indexed id, address indexed owner, address[] recipients, uint256 interval);
event HeartbeatCheckedIn(uint256 indexed id, uint256 timestamp);
event HeartbeatExecuted(uint256 indexed id, address indexed executor, uint256 timestamp);
event RecipientsUpdated(uint256 indexed id, address[] newRecipients);
event IntervalUpdated(uint256 indexed id, uint256 newInterval);
event HeartbeatDeactivated(uint256 indexed id);
```

### Errors

```solidity
error InsufficientFee();
error IntervalTooShort();
error IntervalTooLong();
error NoRecipients();
error TooManyRecipients();
error RecipientNotRegistered(address recipient);
error NotOwner();
error AlreadyExecuted();
error HeartbeatIsDeactivated();
error TimerNotExpired();
error NotExecutor();
error HeartbeatNotFound();
error EmptyPayload();
```

---

## RecipientRegistry

**File:** `contracts/v3/core/RecipientRegistry.sol`
**Upgradeable:** No. Immutable.

Stores recipient → ECIES secp256k1 public key mappings. An address must be registered here before it can be named as a recipient on a heartbeat. (The on-chain functions and field below are named `prePublicKey` for historical reasons — the original design considered Proxy Re-Encryption — but the value stored is an ECIES public key. The identifiers are immutable on-chain and kept exactly as deployed.)

### External functions — write

#### `register`

```solidity
function register(bytes calldata prePublicKey) external;
```

Registers the caller with an ECIES secp256k1 public key (the `prePublicKey` parameter is named for legacy reasons).

- **Reverts with** `AlreadyRegistered` if the caller has already registered.
- **Reverts with** `EmptyPublicKey` if `prePublicKey.length == 0`.
- **Emits** `RecipientRegistered(msg.sender, prePublicKey)`.

#### `updatePrePublicKey`

```solidity
function updatePrePublicKey(bytes calldata newPrePublicKey) external;
```

Rotates the caller's ECIES public key (e.g., after a compromise).

- **Reverts with** `NotRegistered` if caller has not previously registered.
- **Reverts with** `EmptyPublicKey` if `newPrePublicKey.length == 0`.
- **Emits** `PrePublicKeyUpdated(msg.sender, newPrePublicKey)`.

### External functions — view

```solidity
function isRegistered(address account) external view returns (bool);
function getPrePublicKey(address account) external view returns (bytes memory);
```

### Events

```solidity
event RecipientRegistered(address indexed recipient, bytes prePublicKey);
event PrePublicKeyUpdated(address indexed recipient, bytes newPrePublicKey);
```

### Errors

```solidity
error AlreadyRegistered();
error EmptyPublicKey();
error NotRegistered();
```

---

## MktbToken

**File:** `contracts/v3/token/MktbToken.sol`
**Upgradeable:** No. Admin can be renounced for permanent mint-disable.
**Inherits:** `ERC20`, `ERC20Burnable`, `ERC20Permit`, `ERC20Votes`, `Ownable`

The MKTB governance token. ERC-20 with burn, permit, and voting extensions.

### Constants

| Name | Type | Value |
|---|---|---|
| `MAX_SUPPLY` | `uint256` | `100_000_000 * 1e18` (100M MKTB) |

### Constructor

```solidity
constructor(address initialOwner)
    ERC20("Maktub", "MKTB")
    ERC20Permit("Maktub")
    Ownable(initialOwner);
```

### Owner-only functions

#### `mint`

```solidity
function mint(address to, uint256 amount) external onlyOwner;
```

Mints new MKTB up to `MAX_SUPPLY`.

- **Reverts with** `ExceedsMaxSupply(uint256 requested, uint256 available)` if minting would exceed the cap.
- Standard `ERC20.Transfer(address(0), to, amount)` event.

#### `renounceOwnership`

Inherited from `Ownable`. Once called, minting is permanently disabled.

### Standard ERC-20 / Permit / Votes API

Inherited from OpenZeppelin. Most relevant for integrators:

- `balanceOf`, `totalSupply`, `approve`, `transfer`, `transferFrom`
- `permit` (gasless approvals)
- `delegate`, `delegates`, `getVotes`, `getPastVotes`, `getPastTotalSupply`, `numCheckpoints`

### Errors

```solidity
error ExceedsMaxSupply(uint256 requested, uint256 available);
```

Plus OpenZeppelin standard errors (`ERC20InsufficientBalance`, `ERC20InsufficientAllowance`, etc.).

---

## ExecutorRewards

**File:** `contracts/v3/governance/ExecutorRewards.sol`
**Upgradeable:** Yes, via `AccessControl` roles (governance).
**Inherits:** `AccessControl`, `ReentrancyGuard`

Handles executor staking, MKTB emission distribution, slashing, and pause.

### Roles

| Role | Grantee | Purpose |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Deployer → renounced after setup | Initial role management |
| `GOVERNANCE_ROLE` | Timelock controller | Parameter changes, slashing, pause |
| `CORE_ROLE` | MaktubCore or relay | Reward distribution |

### Constants

| Name | Value |
|---|---|
| `TOTAL_REWARD_POOL` | `35_000_000 * 1e18` (35M MKTB) |
| `HALVING_PERIOD` | `365.25 days` |
| `TOTAL_PERIODS` | `10` |
| `YEAR_ONE_EMISSION` | `7_000_000 * 1e18` |
| `MIN_HEARTBEAT_AGE` | `7 days` (for reward eligibility) |
| `MIN_CHECKINS_FOR_REWARD` | `1` |

### Immutables

| Name | Meaning |
|---|---|
| `mktbToken` | The MKTB token address |
| `maxRewardPerExecution` | 10× the initial reward per execution (drain-attack cap) |
| `emissionStart` | Timestamp when emissions began (deploy time) |

### Public state

| Name | Meaning |
|---|---|
| `maktubCore` | MaktubCore address (set once via `setMaktubCore`) |
| `minimumStake` | Minimum MKTB stake for active executor status |
| `rewardPerExecution` | Current governance-set reward per execution |
| `totalDistributed` | Cumulative MKTB distributed |
| `paused` | Whether reward distribution is paused |
| `totalStaked` | Total MKTB staked across all executors |
| `stakes(address)` | Stake balance per executor |
| `isActiveExecutor(address)` | Whether the address meets the minimum stake |
| `rewardsEarned(address)` | Cumulative rewards per executor |

### External functions — write

#### `stake`

```solidity
function stake(uint256 amount) external nonReentrant;
```

Stake MKTB to become (or remain) an active executor.

- Caller must have approved this contract for `amount` MKTB.
- **Reverts with** `ZeroAmount` if `amount == 0`.
- **Emits** `ExecutorStaked(executor, amount, totalStake)`.
- Sets `isActiveExecutor[msg.sender] = true` if `stakes[msg.sender] >= minimumStake`.

#### `unstake`

```solidity
function unstake(uint256 amount) external nonReentrant;
```

Withdraw staked MKTB. Deactivates the executor if remaining stake falls below minimum.

- **Reverts with** `ZeroAmount` if `amount == 0`.
- **Reverts with** `InsufficientStakeBalance` if caller's stake < amount.
- **Emits** `ExecutorUnstaked(executor, amount, totalStake)`.

#### `distributeReward` (CORE_ROLE)

```solidity
function distributeReward(address executor, uint256 heartbeatId) external onlyRole(CORE_ROLE) nonReentrant;
```

Pays the per-execution reward to `executor` for `heartbeatId`.

- **Reverts with** `ContractPaused` if paused.
- **Reverts with** `MaktubCoreNotSet` if `maktubCore` has not been linked.
- **Reverts with** `ExecutorNotActive` if executor is not active.
- **Reverts with** `HeartbeatNotExecuted` if the heartbeat has not been executed.
- **Reverts with** `HeartbeatTooYoung` if `block.timestamp - createdAt < 7 days`.
- **Reverts with** `InsufficientCheckIns` if `checkInCount < 1`.
- **Reverts with** `RewardPoolExhausted` if no reward remains to distribute.
- Caps payout at remaining pool and actual contract balance (excluding staked tokens).
- **Emits** `RewardDistributed(executor, amount)`.

#### `slash` (GOVERNANCE_ROLE)

```solidity
function slash(address executor, uint256 amount, string calldata reason)
    external onlyRole(GOVERNANCE_ROLE) nonReentrant;
```

Confiscate a portion of an executor's stake and deactivate them.

- Slashed tokens flow to `msg.sender` (i.e., the governance timelock).
- **Emits** `ExecutorSlashed(executor, amount, reason)`.

#### `setMinimumStake` (GOVERNANCE_ROLE)

```solidity
function setMinimumStake(uint256 newMinimum) external onlyRole(GOVERNANCE_ROLE);
```

**Emits** `MinimumStakeUpdated(oldMinimum, newMinimum)`.

#### `setRewardPerExecution` (GOVERNANCE_ROLE)

```solidity
function setRewardPerExecution(uint256 newReward) external onlyRole(GOVERNANCE_ROLE);
```

- **Reverts with** `RewardExceedsMax` if `newReward > maxRewardPerExecution`.
- **Emits** `RewardPerExecutionUpdated(oldReward, newReward)`.

#### `pause` / `unpause` (GOVERNANCE_ROLE)

```solidity
function pause() external onlyRole(GOVERNANCE_ROLE);
function unpause() external onlyRole(GOVERNANCE_ROLE);
```

Pauses or unpauses `distributeReward`.

#### `setMaktubCore` (DEFAULT_ADMIN_ROLE)

```solidity
function setMaktubCore(IMaktubCore _maktubCore) external onlyRole(DEFAULT_ADMIN_ROLE);
```

Called once after MaktubCore is deployed to resolve the circular dependency.

- **Reverts with** `MaktubCoreAlreadySet` if previously called.

#### `renounceAdmin` (DEFAULT_ADMIN_ROLE)

```solidity
function renounceAdmin() external onlyRole(DEFAULT_ADMIN_ROLE);
```

Removes `DEFAULT_ADMIN_ROLE` permanently.

### External functions — view

```solidity
function currentRewardAmount() external view returns (uint256);
function yearlyEmission(uint256 year) external pure returns (uint256);
function currentYear() external view returns (uint256);
function remainingRewardPool() external view returns (uint256);
```

### Events

```solidity
event ExecutorStaked(address indexed executor, uint256 amount, uint256 totalStake);
event ExecutorUnstaked(address indexed executor, uint256 amount, uint256 totalStake);
event RewardDistributed(address indexed executor, uint256 amount);
event ExecutorSlashed(address indexed executor, uint256 amount, string reason);
event MinimumStakeUpdated(uint256 oldMinimum, uint256 newMinimum);
event RewardPerExecutionUpdated(uint256 oldReward, uint256 newReward);
event Paused(address indexed account);
event Unpaused(address indexed account);
```

### Errors

```solidity
error ZeroAmount();
error InsufficientStake();
error ExecutorNotActive();
error RewardPoolExhausted();
error ContractPaused();
error NotPaused();
error InsufficientStakeBalance();
error HeartbeatTooYoung();
error InsufficientCheckIns();
error HeartbeatNotExecuted();
error RewardExceedsMax();
error AdminAlreadyRenounced();
error MaktubCoreAlreadySet();
error MaktubCoreNotSet();
```

---

## MktbGovernance

**File:** `contracts/v3/governance/MktbGovernance.sol`
**Upgradeable:** Parameters updatable via governance proposals.
**Inherits:** `Governor`, `GovernorCountingSimple`, `GovernorSettings`, `GovernorVotes`, `GovernorVotesQuorumFraction`, `GovernorTimelockControl`

Standard OpenZeppelin Governor connected to the MKTB token (as `IVotes`) and a `TimelockController`.

### Constructor defaults

| Parameter | Value |
|---|---|
| Voting delay | 43,200 blocks (~1 day on Base at ~2s/block) |
| Voting period | 302,400 blocks (~7 days on Base at ~2s/block) |
| Proposal threshold | 100,000 MKTB |
| Quorum | 4% of total MKTB supply |

**Note:** These block counts are calibrated for Base L2 (~2s blocks). On a chain with different block timing they would produce different wall-clock durations and must be re-tuned at deploy or via governance. An earlier Base Sepolia deploy shipped with Ethereum-mainnet (12s) values, producing 1/6 the intended duration; that contract has been redeployed. See [Governance Parameters](../governance/parameters.md) for the deployed live values.

### Standard OpenZeppelin Governor API

Relevant for integrators:

- `propose(targets, values, calldatas, description)` — create a proposal (caller must have >= `proposalThreshold` voting power)
- `castVote(proposalId, support)` — vote (0=Against, 1=For, 2=Abstain)
- `castVoteWithReason(proposalId, support, reason)` — same with on-chain reason string
- `castVoteBySig(...)` — gasless voting via EIP-712 signature
- `queue(targets, values, calldatas, descriptionHash)` — queue successful proposal in timelock
- `execute(targets, values, calldatas, descriptionHash)` — execute after timelock delay
- `state(proposalId)` — returns `ProposalState` (see SDK docs)
- `proposalVotes(proposalId)` — returns `(againstVotes, forVotes, abstainVotes)`
- `hashProposal(targets, values, calldatas, descriptionHash)` — compute proposal id

Refer to OpenZeppelin Governor v5 documentation for full API.

---

## Interfaces

### `IExecutorRewards`

**File:** `contracts/v3/core/IExecutorRewards.sol`

Minimum surface needed by `MaktubCore` to validate executors.

```solidity
interface IExecutorRewards {
    function isActiveExecutor(address account) external view returns (bool);
}
```

### `IMaktubCore`

**File:** `contracts/v3/governance/IMaktubCore.sol`

Minimum surface needed by `ExecutorRewards` for reward eligibility checks.

```solidity
interface IMaktubCore {
    function getHeartbeat(uint256 id) external view returns (
        address owner,
        address[] memory recipients,
        bytes memory payload,
        uint256 interval,
        uint256 lastCheckIn,
        uint256 createdAt,
        uint256 checkInCount,
        bool executed,
        bool deactivated
    );
}
```

---

## Deployed addresses

### Base Sepolia (testnet)

| Contract | Address |
|---|---|
| MaktubCore | `0x46f491eD5A82dA53Eb077aE35C4C5ed328864331` |
| ExecutorRewards | `0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba` |
| MktbToken | `0x068d9176514C868d8fB43CE84A775b63cf223C5D` |
| RecipientRegistry | `0xfF66eEbFCf0C27f682B84500731752AaCAc7BBc9` |
| MktbGovernance | *(TBD — pending deployment)* |

All verified on [sepolia.basescan.org](https://sepolia.basescan.org).

### Base Mainnet

Pending audit completion and mainnet deployment. Addresses will be published here and in the SDK constants.

---

## Related reading

- [Protocol Specification](./protocol-spec.md)
- [SDK Reference](./sdk.md)
- [Code Examples](./examples.md)
- [Governance Parameters](../governance/parameters.md)

