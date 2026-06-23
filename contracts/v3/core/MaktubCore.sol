// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RecipientRegistry} from "./RecipientRegistry.sol";
import {IExecutorRewards} from "./IExecutorRewards.sol";

/**
 * @title MaktubCore
 * @author Maktub Protocol
 * @notice The immutable heartbeat engine of the Maktub Protocol.
 *
 *         A heartbeat is the protocol's single primitive:
 *         `Recipients + Payload + Timer = Heartbeat`
 *
 *         If the owner doesn't check in within the specified interval,
 *         any registered executor can trigger execution, signalling to
 *         the designated recipients that the encrypted payload (an ECIES
 *         envelope addressed to their registered keys) is now meant for
 *         them.
 *
 * @dev This contract is intentionally immutable: no owner, no pause,
 *      no proxy, no upgrade mechanism. Once deployed, the code never
 *      changes. Users trust math, not governance.
 *
 *      The contract does NOT custody, hold, or transfer any cryptocurrency
 *      or tokens. It stores metadata (IPFS CID hashes) pointing to
 *      encrypted payloads stored off-chain.
 */
contract MaktubCore is ReentrancyGuard {
    // ──────────────────────────────────────────────
    //  Constants & Immutables
    // ──────────────────────────────────────────────

    /// @notice Minimum allowed heartbeat interval (1 hour).
    uint256 public constant MIN_INTERVAL = 1 hours;

    /// @notice Maximum allowed heartbeat interval (365 days).
    /// @dev Prevents creation of heartbeats that effectively never expire.
    uint256 public constant MAX_INTERVAL = 365 days;

    /// @notice Grace window after expiry before execution becomes permissionless (#222).
    /// @dev Until `expiry + EXECUTION_GRACE`, only active staked executors may {execute} — the
    ///      rewarded fast path (driven by ExecutionRelay). After it, ANYONE — notably the
    ///      recipient, the most motivated party — may execute (unrewarded), so delivery
    ///      liveness never depends on the executor market or its admin (the lever discussed in
    ///      #51). This window IS the maximum time a colluding executor set or captured
    ///      ExecutorRewards admin could withhold a delivery before the recipient self-rescues,
    ///      so it is kept short for censorship-resistance (CISO, #222). 2 days: executors act
    ///      within minutes, so it is still an ample reward-exclusivity margin, while bounding
    ///      worst-case withholding to ~2 days. Immutable — chosen deliberately at the freeze.
    uint256 public constant EXECUTION_GRACE = 2 days;

    /// @notice Maximum number of recipients per heartbeat.
    /// @dev Safety limit, not a business rule (protocol-family.md §4 invariant 6).
    ///      Bound by per-recipient envelope-encryption work, executor processing
    ///      latency, and on-chain metadata footprint (the recipient list is public);
    ///      sits well below the 200-recipient security ceiling. Set to 25 (#139,
    ///      supersedes D-023's 100): the inline-payload model makes recipient count
    ///      the dominant size driver, and small trust sets are the intended pattern
    ///      for confidential delivery. Larger groups fan out at the app layer
    ///      (D-029/D-021). The originally deployed Beat keeps its own immutable 50.
    uint256 public constant MAX_RECIPIENTS = 25;

    /// @notice Maximum allowed `payload` length in bytes.
    /// @dev Sized for the inline-payload model (#139, supersedes D-030's 256-byte
    ///      "CID-only" cap): a normal encrypted text letter — including to a full
    ///      MAX_RECIPIENTS group — lives inline on-chain, so the cap must fit the
    ///      compact hybrid envelope (shared ephemeral + compressed keys: ~96 + 63·N
    ///      bytes of overhead) plus a useful message. 4096 holds ~400 words to 25
    ///      recipients while bounding worst-case create gas (~3.4M) and permanent
    ///      state per beat. External off-chain storage (CID) is reserved for payloads
    ///      that exceed this — i.e. big media only; the contract is agnostic to which
    ///      it receives. Safety limit, not a business rule (protocol-family.md §4
    ///      invariant 6). Mirrors the bounded-input MAX_RECIPIENTS pattern.
    uint256 public constant MAX_PAYLOAD_BYTES = 4096;

    /// @notice Base creation fee for a single-recipient heartbeat, set at deploy time.
    /// @dev Denominated in wei, immutable forever (D-022: fees are ETH-native;
    ///      D-027: no oracle, no fiat peg). Committed target: 124_000_000_000_000 wei.
    uint256 public immutable baseFee;

    /// @notice Additional fee per recipient beyond the first, set at deploy time.
    /// @dev Denominated in wei, immutable forever. Committed curve (D-022/D-023):
    ///      `creationFee = baseFee + (recipients.length - 1) * perAdditionalFee`.
    ///      Per-recipient pricing is the economic discipline against broadcast
    ///      abuse. Committed target: 40_000_000_000_000 wei (base/3 ratio).
    uint256 public immutable perAdditionalFee;

    /// @notice Address that receives collected protocol fees.
    /// @dev Set once at deploy time. Cannot be changed. This is NOT an admin key —
    ///      it can only receive ETH, it has zero control over the contract.
    address payable public immutable feeReceiver;

    /// @notice The RecipientRegistry contract that validates recipient registration.
    RecipientRegistry public immutable recipientRegistry;

    /// @notice The ExecutorRewards contract that validates executor eligibility.
    /// @dev Executors must be actively staked in ExecutorRewards to call execute().
    IExecutorRewards public immutable executorRewards;

    // ──────────────────────────────────────────────
    //  Data Structures
    // ──────────────────────────────────────────────

    /**
     * @notice The core data structure of the Maktub Protocol.
     * @param owner        The address that created and controls this heartbeat.
     * @param recipients   Addresses that will receive the payload upon execution.
     * @param payload      The encrypted envelope, inline (≤ MAX_PAYLOAD_BYTES), or a
     *                     CID pointing to it off-chain for oversize media (#139).
     * @param interval     Duration in seconds between required check-ins.
     * @param lastCheckIn  Timestamp of the most recent check-in (or creation).
     * @param checkInCount Number of times the owner has checked in (excludes creation).
     * @param executed     Whether execution has been triggered (one-shot, irreversible).
     * @param deactivated  Whether the owner has permanently deactivated this heartbeat.
     */
    struct Heartbeat {
        address owner;
        address[] recipients;
        bytes payload;
        uint256 interval;
        uint256 lastCheckIn;
        uint256 createdAt;
        uint256 checkInCount;
        bool executed;
        bool deactivated;
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @notice All heartbeats indexed by their deterministic ID.
    /// @dev `id = keccak256(abi.encode(creator, salt))` — see {createHeartbeat}.
    mapping(uint256 => Heartbeat) private _heartbeats;

    /// @notice Total number of heartbeats ever created.
    /// @dev Observability only — this is NOT the ID source. IDs are content-addressed
    ///      from `(creator, salt)` (D-038), so they are not enumerable 0..N; discovery
    ///      goes through the {getOwnerBeats}/{getInboxBeats} indexes below.
    uint256 public heartbeatCount;

    /// @notice IDs of every heartbeat an address has created (owner discovery).
    /// @dev Append-only and exact: the owner is set once and never changes, so this
    ///      holds no duplicates and no stale entries. Includes executed/deactivated
    ///      beats; filter via {getHeartbeat}.
    mapping(address => uint256[]) private _ownerBeats;

    /// @notice IDs of every heartbeat an address is (or was) a recipient of (recipient discovery).
    /// @dev A **soft** index, de-duplicated per `(id, recipient)` via {_recipientIndexed}: each
    ///      beat appears at most once per recipient. It can still carry STALE ids — a recipient
    ///      removed via {updateRecipients} keeps its entry (we cannot cheaply unset on removal) —
    ///      but never a duplicate, and never misses a *current* recipient. Readers MUST confirm
    ///      current membership against {getHeartbeat}; the index is a discovery hint, not
    ///      authority. Recipient lists are already public on-chain (D-031), so enumerability adds
    ///      no new metadata exposure.
    mapping(address => uint256[]) private _recipientBeats;

    /// @notice Whether `id` is already recorded in `_recipientBeats[recipient]`.
    /// @dev Bounds recipient-discovery griefing (CISO/CTO review #219): each `(id, recipient)`
    ///      indexes at most once, so re-adding a recipient via {updateRecipients} is a no-op
    ///      push. The only way to add an entry to a victim's index is a *distinct* beat — which
    ///      costs a creation fee — converting an unbounded free grief into a fee-metered one.
    mapping(uint256 => mapping(address => bool)) private _recipientIndexed;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a new heartbeat is created.
    event HeartbeatCreated(
        uint256 indexed id,
        address indexed owner,
        address[] recipients,
        uint256 interval
    );

    /// @notice Emitted when the heartbeat owner checks in, resetting the timer.
    event HeartbeatCheckedIn(uint256 indexed id, uint256 timestamp);

    /// @notice Emitted when a heartbeat is executed after the timer expires.
    event HeartbeatExecuted(
        uint256 indexed id,
        address indexed executor,
        uint256 timestamp
    );

    /// @notice Emitted when the owner updates a heartbeat's recipient list.
    event RecipientsUpdated(uint256 indexed id, address[] newRecipients);

    /// @notice Emitted when the owner updates a heartbeat's interval.
    event IntervalUpdated(uint256 indexed id, uint256 newInterval);

    /// @notice Emitted when the owner permanently deactivates a heartbeat.
    event HeartbeatDeactivated(uint256 indexed id);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when the ETH sent is less than the required creation fee.
    error InsufficientFee();

    /// @notice Thrown when the provided interval is below the minimum (1 hour).
    error IntervalTooShort();

    /// @notice Thrown when the provided interval exceeds the maximum (365 days).
    error IntervalTooLong();

    /// @notice Thrown when an empty recipients array is provided.
    error NoRecipients();

    /// @notice Thrown when the recipients array exceeds MAX_RECIPIENTS.
    error TooManyRecipients();

    /// @notice Thrown when one or more recipients are not registered in RecipientRegistry.
    error RecipientNotRegistered(address recipient);

    /// @notice Thrown when the same recipient address appears more than once in one call.
    error DuplicateRecipient(address recipient);

    /// @notice Thrown when the caller is not the heartbeat owner.
    error NotOwner();

    /// @notice Thrown when the heartbeat has already been executed.
    error AlreadyExecuted();

    /// @notice Thrown when the heartbeat has been deactivated.
    error HeartbeatIsDeactivated();

    /// @notice Thrown when the heartbeat timer has not yet expired.
    error TimerNotExpired();

    /// @notice Thrown when the caller is not a registered executor.
    error NotExecutor();

    /// @notice Thrown when the heartbeat ID does not exist.
    error HeartbeatNotFound();

    /// @notice Thrown when the derived ID already exists (the same creator reused a salt).
    error HeartbeatAlreadyExists();

    /// @notice Thrown when an empty payload is provided.
    error EmptyPayload();

    /// @notice Thrown when the payload exceeds MAX_PAYLOAD_BYTES.
    /// @dev The payload is the inline encrypted envelope or a CID for oversize media (#139).
    error PayloadTooLarge();

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    /// @dev Ensures the heartbeat exists. A heartbeat exists iff its owner is set —
    ///      `owner` is written on creation and can never be zero (msg.sender) or change.
    ///      (IDs are content-addressed, not 0..N, so an index-bound check no longer applies.)
    modifier heartbeatExists(uint256 id) {
        if (_heartbeats[id].owner == address(0)) revert HeartbeatNotFound();
        _;
    }

    /// @dev Ensures the caller is the heartbeat owner.
    modifier onlyOwnerOf(uint256 id) {
        if (_heartbeats[id].owner != msg.sender) revert NotOwner();
        _;
    }

    /// @dev Ensures the heartbeat is active (not executed and not deactivated).
    modifier isActive(uint256 id) {
        if (_heartbeats[id].executed) revert AlreadyExecuted();
        if (_heartbeats[id].deactivated) revert HeartbeatIsDeactivated();
        _;
    }

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @notice Deploys the MaktubCore contract with immutable configuration.
     * @param _baseFee      The fee in wei for a single-recipient heartbeat.
     * @param _perAdditionalFee The fee in wei per recipient beyond the first.
     * @param _feeReceiver  The address that will receive all collected fees.
     *                      Has zero control over the contract — receive-only.
     *                      Must be able to receive plain ETH transfers
     *                      unconditionally (EOA or guaranteed-receive contract);
     *                      a reverting receiver would permanently brick creation.
     * @param _recipientRegistry The address of the deployed RecipientRegistry contract.
     * @param _executorRewards The address of the deployed ExecutorRewards contract.
     *                         Executors must be actively staked there to call execute().
     */
    constructor(
        uint256 _baseFee,
        uint256 _perAdditionalFee,
        address payable _feeReceiver,
        RecipientRegistry _recipientRegistry,
        IExecutorRewards _executorRewards
    ) {
        require(_baseFee > 0, "Base fee must be > 0");
        require(_feeReceiver != address(0), "Fee receiver cannot be zero");
        require(
            address(_recipientRegistry) != address(0),
            "Registry cannot be zero"
        );
        require(
            address(_executorRewards) != address(0),
            "ExecutorRewards cannot be zero"
        );

        baseFee = _baseFee;
        perAdditionalFee = _perAdditionalFee;
        feeReceiver = _feeReceiver;
        recipientRegistry = _recipientRegistry;
        executorRewards = _executorRewards;
    }

    // ──────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Create a new heartbeat with a caller-chosen, content-addressed ID.
     * @dev Requires `msg.value >= creationFeeFor(recipients.length)`. Excess ETH
     *      is refunded. All recipients must be registered in RecipientRegistry.
     *      The timer starts at the moment of creation.
     *
     *      The ID is `keccak256(abi.encode(msg.sender, salt))` (D-038), so the creator
     *      knows it **before** the tx lands — which lets a Veil gate seal a payload to
     *      this beat's own execution condition and ship it inline in one call (no race
     *      against a global counter). Binding `msg.sender` makes IDs front-running-proof:
     *      no other account can occupy your ID space. `salt` MUST be unique per creator —
     *      reusing one (same derived ID) reverts with {HeartbeatAlreadyExists}; apps
     *      should draw a fresh random `salt` per beat.
     * @param salt       Caller-chosen 32-byte uniquifier; `id = keccak256(sender, salt)`.
     * @param recipients Array of recipient addresses (1 to MAX_RECIPIENTS).
     *                   All must be registered in RecipientRegistry.
     * @param payload    The encrypted envelope, inline (1 to MAX_PAYLOAD_BYTES), or a
     *                   CID pointing to it off-chain for oversize media (#139).
     * @param interval   The check-in interval in seconds (minimum 1 hour).
     * @return id The unique identifier of the created heartbeat.
     */
    function createHeartbeat(
        bytes32 salt,
        address[] calldata recipients,
        bytes calldata payload,
        uint256 interval
    ) external payable nonReentrant returns (uint256 id) {
        // --- Validation ---
        if (recipients.length == 0) revert NoRecipients();
        if (recipients.length > MAX_RECIPIENTS) revert TooManyRecipients();
        uint256 fee = creationFeeFor(recipients.length);
        if (msg.value < fee) revert InsufficientFee();
        if (interval < MIN_INTERVAL) revert IntervalTooShort();
        if (interval > MAX_INTERVAL) revert IntervalTooLong();
        if (payload.length == 0) revert EmptyPayload();
        if (payload.length > MAX_PAYLOAD_BYTES) revert PayloadTooLarge();

        _validateRecipients(recipients);

        // --- Derive the deterministic ID ---
        id = uint256(keccak256(abi.encode(msg.sender, salt)));
        if (_heartbeats[id].owner != address(0)) revert HeartbeatAlreadyExists();

        // --- State changes ---
        unchecked {
            heartbeatCount++; // observability stat only; not the ID source
        }

        Heartbeat storage hb = _heartbeats[id];
        hb.owner = msg.sender;
        hb.recipients = recipients;
        hb.payload = payload;
        hb.interval = interval;
        hb.lastCheckIn = block.timestamp;
        hb.createdAt = block.timestamp;
        // hb.checkInCount = 0;     (default)
        // hb.executed = false;     (default)
        // hb.deactivated = false;  (default)

        // --- Discovery indexes (written before any external call, with the rest of state) ---
        _ownerBeats[msg.sender].push(id);
        _indexRecipients(id, recipients);

        // --- Fee transfer ---
        (bool sent, ) = feeReceiver.call{value: fee}("");
        require(sent, "Fee transfer failed");

        // --- Refund excess ---
        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool refunded, ) = msg.sender.call{value: excess}("");
            require(refunded, "Refund failed");
        }

        emit HeartbeatCreated(id, msg.sender, recipients, interval);
    }

    /**
     * @notice Check in to reset the heartbeat timer. FREE (no protocol fee).
     * @dev Only callable by the heartbeat owner. Resets `lastCheckIn` to
     *      `block.timestamp`, giving the owner another full interval before
     *      execution becomes possible.
     * @param id The heartbeat ID to check in on.
     */
    function checkIn(
        uint256 id
    ) external heartbeatExists(id) onlyOwnerOf(id) isActive(id) {
        _heartbeats[id].lastCheckIn = block.timestamp;
        _heartbeats[id].checkInCount += 1;
        emit HeartbeatCheckedIn(id, block.timestamp);
    }

    /**
     * @notice Execute a heartbeat whose timer has expired.
     * @dev Marks the heartbeat as executed (one-shot, irreversible). Recipient apps and the
     *      SDK monitor the `HeartbeatExecuted` event to surface the payload to recipients.
     *
     *      Requirements:
     *      - Heartbeat must exist, not be executed, and not be deactivated.
     *      - `block.timestamp > lastCheckIn + interval` (timer expired).
     *      - Caller is an active staked executor, OR the timer has been expired for at least
     *        `EXECUTION_GRACE` (the permissionless delivery backstop, #222).
     *
     *      Active executors get an exclusive `EXECUTION_GRACE` window to execute (and earn,
     *      via ExecutionRelay). After it, anyone — notably the recipient — may execute
     *      (unrewarded), so delivery never depends on the executor market or its admin.
     *
     * @param id The heartbeat ID to execute.
     */
    function execute(
        uint256 id
    )
        external
        heartbeatExists(id)
        isActive(id)
        nonReentrant
    {
        // Guard ordering rationale (race-loss fail-fast):
        //   With N executors competing for the same heartbeat, only one tx lands. The other
        //   N-1 revert as cheaply as possible at the `isActive` modifier (`AlreadyExecuted`),
        //   BEFORE this body's SSTORE and before any external call — keeping a race-loss
        //   revert ~30k gas on Base L2.
        Heartbeat storage hb = _heartbeats[id];
        uint256 expiry = hb.lastCheckIn + hb.interval;
        if (block.timestamp <= expiry) revert TimerNotExpired();

        // Active staked executors execute immediately on expiry — the rewarded fast path
        // (driven by ExecutionRelay). After EXECUTION_GRACE, execution becomes PERMISSIONLESS
        // (#222): anyone — notably the recipient — may execute, unrewarded, so delivery
        // liveness never depends on the executor market or its admin. The backstop path mints
        // no reward; rewards flow only to staked executors via the relay. No new abuse surface:
        // execute is one-shot (the `isActive` guard) on an expired beat, so the caller set
        // widening after the grace cannot double-execute or spam.
        if (!executorRewards.isActiveExecutor(msg.sender)) {
            if (block.timestamp <= expiry + EXECUTION_GRACE) revert NotExecutor();
        }

        hb.executed = true;

        emit HeartbeatExecuted(id, msg.sender, block.timestamp);
    }

    /**
     * @notice Update the recipient list of a heartbeat.
     * @dev Only callable by the heartbeat owner. Resets the timer as a safety
     *      measure (changing recipients is a significant action). All new
     *      recipients must be registered in RecipientRegistry.
     * @param id The heartbeat ID to update.
     * @param newRecipients The new array of recipient addresses.
     */
    function updateRecipients(
        uint256 id,
        address[] calldata newRecipients
    )
        external
        nonReentrant
        heartbeatExists(id)
        onlyOwnerOf(id)
        isActive(id)
    {
        if (newRecipients.length == 0) revert NoRecipients();
        if (newRecipients.length > MAX_RECIPIENTS) revert TooManyRecipients();

        _validateRecipients(newRecipients);

        _heartbeats[id].recipients = newRecipients;
        _heartbeats[id].lastCheckIn = block.timestamp;

        // Record the new set in the soft recipient index so newly-added recipients can discover
        // this beat. De-duplicated per (id, recipient), so unchanged recipients are a no-op push;
        // removed recipients keep a stale entry (filtered by readers via {getHeartbeat}).
        // See {_recipientBeats}/{_recipientIndexed}. (Veil beats disable this path — issue #216.)
        _indexRecipients(id, newRecipients);

        emit RecipientsUpdated(id, newRecipients);
    }

    /**
     * @notice Update the check-in interval of a heartbeat.
     * @dev Only callable by the heartbeat owner. Does NOT reset the timer —
     *      the new interval takes effect from the last check-in time.
     * @param id The heartbeat ID to update.
     * @param newInterval The new interval in seconds (minimum 1 hour).
     */
    function updateInterval(
        uint256 id,
        uint256 newInterval
    ) external heartbeatExists(id) onlyOwnerOf(id) isActive(id) {
        if (newInterval < MIN_INTERVAL) revert IntervalTooShort();
        if (newInterval > MAX_INTERVAL) revert IntervalTooLong();

        _heartbeats[id].interval = newInterval;

        emit IntervalUpdated(id, newInterval);
    }

    /**
     * @notice Permanently deactivate a heartbeat. Irreversible.
     * @dev Only callable by the heartbeat owner. A deactivated heartbeat
     *      cannot be checked in on, executed, or modified. This is the
     *      owner's emergency stop — "I no longer need this heartbeat."
     * @param id The heartbeat ID to deactivate.
     */
    function deactivate(
        uint256 id
    ) external heartbeatExists(id) onlyOwnerOf(id) isActive(id) {
        _heartbeats[id].deactivated = true;

        emit HeartbeatDeactivated(id);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice The creation fee in wei for a heartbeat with the given recipient count.
     * @dev Committed curve (D-022/D-023):
     *      `fee = baseFee + (recipientCount - 1) * perAdditionalFee`.
     *      Both terms are immutable, so the fee for any recipient count is
     *      deterministic forever. Reverts for a zero recipient count.
     * @param recipientCount The number of recipients (1 to MAX_RECIPIENTS).
     * @return The total creation fee in wei.
     */
    function creationFeeFor(uint256 recipientCount) public view returns (uint256) {
        if (recipientCount == 0) revert NoRecipients();
        return baseFee + (recipientCount - 1) * perAdditionalFee;
    }

    /**
     * @notice Retrieve the full heartbeat data for a given ID.
     * @param id The heartbeat ID.
     * @return owner        The heartbeat owner address.
     * @return recipients   The array of recipient addresses.
     * @return payload      The IPFS CID hash (bytes).
     * @return interval     The check-in interval in seconds.
     * @return lastCheckIn  The timestamp of the last check-in.
     * @return createdAt    The timestamp when the heartbeat was created.
     * @return checkInCount The number of times the owner has checked in.
     * @return executed     Whether the heartbeat has been executed.
     * @return deactivated  Whether the heartbeat has been deactivated.
     */
    function getHeartbeat(
        uint256 id
    )
        external
        view
        heartbeatExists(id)
        returns (
            address owner,
            address[] memory recipients,
            bytes memory payload,
            uint256 interval,
            uint256 lastCheckIn,
            uint256 createdAt,
            uint256 checkInCount,
            bool executed,
            bool deactivated
        )
    {
        Heartbeat storage hb = _heartbeats[id];
        return (
            hb.owner,
            hb.recipients,
            hb.payload,
            hb.interval,
            hb.lastCheckIn,
            hb.createdAt,
            hb.checkInCount,
            hb.executed,
            hb.deactivated
        );
    }

    /**
     * @notice Check whether a heartbeat's timer has expired.
     * @param id The heartbeat ID.
     * @return True if `block.timestamp > lastCheckIn + interval`.
     */
    function isExpired(
        uint256 id
    ) external view heartbeatExists(id) returns (bool) {
        Heartbeat storage hb = _heartbeats[id];
        return block.timestamp > hb.lastCheckIn + hb.interval;
    }

    /**
     * @notice Check whether a heartbeat is currently eligible for execution:
     *         exists, is not yet executed, is not deactivated, and its timer
     *         has expired.
     * @dev This is a composite precheck for executor nodes. With multiple
     *      executors racing for the same heartbeat, only one `execute()` tx
     *      can land per heartbeat — the rest revert with `AlreadyExecuted`.
     *      An executor can call this view right before submitting to prune
     *      obvious race-losses without paying gas for a guaranteed-revert
     *      transaction. It is a strict superset of `isExpired` — it also
     *      enforces the "still active" invariant that `isExpired` does not.
     *
     *      This view is advisory only. On-chain `execute()` remains the
     *      source of truth; a `true` result from this view is a snapshot
     *      and can race with a peer's execution landing in the next block.
     *
     * @param id The heartbeat ID.
     * @return True iff the heartbeat is expired AND still active.
     */
    function isExpiredAndActive(
        uint256 id
    ) external view heartbeatExists(id) returns (bool) {
        Heartbeat storage hb = _heartbeats[id];
        if (hb.executed) return false;
        if (hb.deactivated) return false;
        return block.timestamp > hb.lastCheckIn + hb.interval;
    }

    /**
     * @notice Check whether an address is an eligible executor (actively staked
     *         in ExecutorRewards).
     * @param account The address to check.
     * @return True if the address is an active executor.
     */
    function isExecutor(address account) external view returns (bool) {
        return executorRewards.isActiveExecutor(account);
    }

    /**
     * @notice Get the number of seconds remaining before a heartbeat expires.
     * @dev Returns 0 if already expired.
     * @param id The heartbeat ID.
     * @return The number of seconds remaining, or 0 if expired.
     */
    function timeRemaining(
        uint256 id
    ) external view heartbeatExists(id) returns (uint256) {
        Heartbeat storage hb = _heartbeats[id];
        uint256 expiresAt = hb.lastCheckIn + hb.interval;
        if (block.timestamp >= expiresAt) return 0;
        return expiresAt - block.timestamp;
    }

    // ──────────────────────────────────────────────
    //  Discovery (D-038) — IDs are content-addressed, not 0..N enumerable
    // ──────────────────────────────────────────────

    /// @notice Number of heartbeats created by `owner`.
    function ownerBeatCount(address owner) external view returns (uint256) {
        return _ownerBeats[owner].length;
    }

    /// @notice All heartbeat IDs created by `owner` (creation order; newest last).
    /// @dev Exact (no stale/dupes). Includes executed/deactivated beats — filter via {getHeartbeat}.
    function getOwnerBeats(address owner) external view returns (uint256[] memory) {
        return _ownerBeats[owner];
    }

    /// @notice A page `[start, start+count)` of `owner`'s heartbeat IDs.
    function getOwnerBeatsPaged(
        address owner,
        uint256 start,
        uint256 count
    ) external view returns (uint256[] memory) {
        return _page(_ownerBeats[owner], start, count);
    }

    /// @notice Number of discovery hints recorded for recipient `recipient` (may include stale entries).
    function inboxCount(address recipient) external view returns (uint256) {
        return _recipientBeats[recipient].length;
    }

    /// @notice Discovery hints — heartbeat IDs where `recipient` is (or was) a recipient.
    /// @dev **Soft** index: de-duplicated per (id, recipient), but may contain STALE (removed)
    ///      IDs; never misses a current recipient. Callers MUST confirm current membership via
    ///      {getHeartbeat}. See {_recipientBeats}.
    function getInboxBeats(address recipient) external view returns (uint256[] memory) {
        return _recipientBeats[recipient];
    }

    /// @notice A page `[start, start+count)` of `recipient`'s discovery hints.
    function getInboxBeatsPaged(
        address recipient,
        uint256 start,
        uint256 count
    ) external view returns (uint256[] memory) {
        return _page(_recipientBeats[recipient], start, count);
    }

    // ──────────────────────────────────────────────
    //  Internal Functions
    // ──────────────────────────────────────────────

    /**
     * @dev Validates that every address is registered in RecipientRegistry and that the array
     *      contains no duplicates. Rejecting duplicates is hygiene (a beat addressed to the same
     *      person twice is nonsensical and double-charges the per-recipient fee) and a
     *      defence-in-depth layer under the {_recipientIndexed} griefing bound. O(n²) address
     *      comparisons are cheap for n ≤ MAX_RECIPIENTS (25); the registry call stays O(n).
     * @param recipients The array of recipient addresses to validate.
     */
    function _validateRecipients(
        address[] calldata recipients
    ) internal view {
        for (uint256 i = 0; i < recipients.length; ) {
            if (!recipientRegistry.isRegistered(recipients[i])) {
                revert RecipientNotRegistered(recipients[i]);
            }
            for (uint256 j = i + 1; j < recipients.length; ) {
                if (recipients[i] == recipients[j]) {
                    revert DuplicateRecipient(recipients[i]);
                }
                unchecked {
                    j++;
                }
            }
            unchecked {
                i++;
            }
        }
    }

    /**
     * @dev Records `id` in each recipient's soft discovery index ({_recipientBeats}),
     *      de-duplicated per `(id, recipient)` via {_recipientIndexed} so each beat appears at
     *      most once per recipient. Re-adding an already-indexed recipient (e.g. via repeated
     *      {updateRecipients}) is a no-op push — this is the bound that prevents a free,
     *      unbounded inbox-bloat grief (#219). Stale entries (a removed recipient) are not
     *      cleared here; readers verify current membership via {getHeartbeat}.
     * @param id         The heartbeat ID to record.
     * @param recipients The recipients to record it for.
     */
    function _indexRecipients(
        uint256 id,
        address[] calldata recipients
    ) internal {
        for (uint256 i = 0; i < recipients.length; ) {
            address r = recipients[i];
            if (!_recipientIndexed[id][r]) {
                _recipientIndexed[id][r] = true;
                _recipientBeats[r].push(id);
            }
            unchecked {
                i++;
            }
        }
    }

    /**
     * @dev Returns the slice `arr[start : min(start+count, arr.length)]`, or an empty
     *      array if `start` is past the end. Bounds-safe pagination for the discovery views.
     */
    function _page(
        uint256[] storage arr,
        uint256 start,
        uint256 count
    ) internal view returns (uint256[] memory page) {
        uint256 len = arr.length;
        if (start >= len) return new uint256[](0);
        uint256 end = start + count;
        if (end > len) end = len;
        page = new uint256[](end - start);
        for (uint256 i = start; i < end; ) {
            page[i - start] = arr[i];
            unchecked {
                i++;
            }
        }
    }
}
