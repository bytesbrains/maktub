// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RecipientRegistryV2} from "./RecipientRegistryV2.sol";

/**
 * @title MaktubFlash
 * @author Maktub Protocol
 * @notice The second citizen of the Maktub Protocol family: instant-triggered,
 *         fire-and-forget delivery of an encrypted payload to sender-chosen
 *         recipients (spec: docs/developer/protocol-family.md §2.2; decisions
 *         D-021/D-022/D-023).
 *
 *         Where Maktub Beat (MaktubCore) delivers when a timer expires, Flash
 *         delivers NOW: the payload CID is committed and the delivery events
 *         are emitted in the same transaction — roughly one Base block (~2s).
 *         There is no timer, no check-in, no executor in the delivery path,
 *         and no post-send mutability. Flash and Beat now share the same durable
 *         storage strategy — payload in canonical state — yet remain distinct
 *         citizens on trigger + lifecycle + fee curve (D-039 narrows the old
 *         "share substrate, not storage" line; see protocol-family.md §2.2).
 *
 * @dev This contract is intentionally immutable: no owner, no pause, no proxy,
 *      no governance, no upgrade mechanism, no `selfdestruct`. It does NOT
 *      custody, hold, or transfer any cryptocurrency or tokens beyond
 *      forwarding the creation fee. The payload is stored in **canonical state**
 *      (a per-flash `FlashRecord`, readable via {getFlash}) so delivery is
 *      inevitably retrievable — never dependent on prunable event logs (D-039,
 *      mirrors Beat; supersedes the original event-log-only model). The
 *      `FlashSent`/`FlashDelivered` events are retained as the real-time
 *      delivery/notification path for indexers. Fire-and-forget is unchanged:
 *      no recall, edit, or deactivate — "durable" ≠ "mutable".
 *
 *      Fee (D-022/D-023): pure linear, `recipients.length * perRecipientFee`,
 *      ETH-only via msg.value, 100% to the hardcoded immutable Foundation
 *      address (D-024). Linear scaling is the spam moat — broadcasting to N
 *      recipients costs N× a 1-recipient send, and fragmenting a broadcast
 *      across many calls gives no arbitrage advantage.
 *
 *      Exact-fee policy (pinned here, resolving the question left open at
 *      D-023): `msg.value` must equal the fee exactly. Unlike Beat — whose
 *      original deployment predates the committed curve and refunds excess —
 *      the Flash fee is a deterministic pure function of recipient count with
 *      both terms immutable, so every client can compute it exactly; requiring
 *      exactness keeps the hot path one external call cheaper (no refund) and
 *      makes fee bugs in clients loud instead of silently absorbed.
 *
 *      Forward secrecy: Flash payloads are encrypted against each recipient's
 *      per-session ratchet key (X3DH-style) from RecipientRegistryV2 — see
 *      RF-S9 / issue #32. This contract therefore requires every recipient to
 *      be Flash-eligible (ratchetPubKey registered on v2). Beat-only (v1)
 *      recipients cannot receive Flash until they opt in.
 *
 *      Confidentiality horizon (D-039, honest boundary): storing the payload in
 *      canonical state makes the ciphertext **permanently public** — carried by
 *      every full node forever, no longer prunable like an event log. Flash has
 *      **no forward secrecy** (D-034), so a future compromise of a recipient's
 *      long-term key — including a quantum break of the curve — retroactively
 *      exposes every Flash ever sent to them, from a ciphertext that is now
 *      guaranteed-permanent. Content is confidential **only** to the recipient's
 *      key (never "permanent privacy"); long-horizon / post-quantum hardening of
 *      the inner encryption layer is a tracked obligation (D-026 §5).
 */
contract MaktubFlash is ReentrancyGuard {
    // ──────────────────────────────────────────────
    //  Constants & Immutables
    // ──────────────────────────────────────────────

    /// @notice Maximum number of recipients per flash.
    /// @dev Safety limit, not a business rule (protocol-family.md §4
    ///      invariant 6). Bound by send-now UX latency, executor indexing
    ///      burden, and on-chain metadata footprint (the recipient list is
    ///      public), well under the 200-recipient security ceiling. Apps that
    ///      need larger groups fan out parallel flash() calls at the SDK
    ///      layer (D-029/D-021). Committed at 25 (D-023; reaffirmed #139).
    uint256 public constant MAX_RECIPIENTS = 25;

    /// @notice Maximum allowed `payload` length in bytes.
    /// @dev Sized for the inline-payload model (#139, supersedes D-030's 256-byte
    ///      "CID-only" cap): a normal encrypted text message — including to a full
    ///      MAX_RECIPIENTS group — rides inline in calldata + the `FlashSent` event,
    ///      so the cap must fit the compact hybrid envelope (~96 + 63·N bytes of
    ///      overhead) plus a useful message. 4096 holds ~400 words to 25 recipients.
    ///      External off-chain storage (CID) is reserved for payloads that exceed
    ///      this — big media only; the contract is agnostic to which it receives.
    ///      Safety limit, not a business rule (protocol-family.md §4 invariant 6).
    ///      Matches Beat's MAX_PAYLOAD_BYTES; mirrors the bounded-input pattern.
    uint256 public constant MAX_PAYLOAD_BYTES = 4096;

    /// @notice Fee in wei per recipient, set at deploy time.
    /// @dev Denominated in wei, immutable forever (D-022: fees are ETH-native;
    ///      D-027: no oracle, no fiat peg). Total fee for a flash is
    ///      `recipients.length * perRecipientFee` — no base term, no bulk
    ///      discount, no tiering. Committed target: 5_000_000_000_000 wei.
    uint256 public immutable perRecipientFee;

    /// @notice Address that receives 100% of collected fees (D-024).
    /// @dev Set once at deploy time. Cannot be changed. This is NOT an admin
    ///      key — it can only receive ETH, it has zero control over the
    ///      contract. Must be able to receive plain ETH transfers
    ///      unconditionally (EOA or guaranteed-receive contract); a reverting
    ///      receiver would permanently brick sending.
    address payable public immutable feeReceiver;

    /// @notice The RecipientRegistryV2 contract that gates Flash eligibility.
    RecipientRegistryV2 public immutable recipientRegistry;

    // ──────────────────────────────────────────────
    //  Data Structures
    // ──────────────────────────────────────────────

    /**
     * @notice The durable record of a sent flash (D-039). Written once at send and
     *         never mutated — fire-and-forget immutability ("durable" ≠ "mutable").
     * @param sender     The address that sent the flash.
     * @param recipients The full recipient list (deduplicated; see {flash}).
     * @param payload     The encrypted envelope, inline (≤ MAX_PAYLOAD_BYTES), or a CID.
     * @param timestamp  The block timestamp of the send.
     */
    struct FlashRecord {
        address sender;
        address[] recipients;
        bytes payload;
        uint256 timestamp;
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @notice Every flash by sequential ID — the durable source of truth (D-039).
    mapping(uint256 => FlashRecord) private _flashes;

    /// @notice Total number of flashes ever sent (also the next sequential ID).
    uint256 public flashCount;

    /// @notice IDs of every flash an address has sent (sender discovery).
    /// @dev Append-only and exact — sender is set once at send, never changes.
    mapping(address => uint256[]) private _sentFlashes;

    /// @notice IDs of every flash an address has received (recipient discovery).
    /// @dev **Exact**, unlike Beat's soft recipient index: Flash is immutable (no
    ///      `updateRecipients`) and {flash} rejects duplicate recipients, so each
    ///      `(id, recipient)` is recorded exactly once — no stale entries, no
    ///      duplicates, and no membership guard is needed. Griefing is bounded by the
    ///      per-recipient fee: adding an entry to a victim's index costs a paid send.
    ///      Recipient lists are already public on-chain (D-031), so enumerability adds
    ///      no new metadata exposure. Readers should still treat it as a discovery hint
    ///      and read {getFlash} for the authoritative record.
    mapping(address => uint256[]) private _receivedFlashes;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /**
     * @notice Emitted once per flash() call — the canonical record of a send.
     * @param id         The flash ID (sequential).
     * @param sender     The sender.
     * @param recipients The full recipient list.
     * @param payload    The encrypted envelope inline, or a CID for oversize
     *                   media (#139). Carries no cleartext content or metadata.
     * @param timestamp  The block timestamp of delivery.
     */
    event FlashSent(
        uint256 indexed id,
        address indexed sender,
        address[] recipients,
        bytes payload,
        uint256 timestamp
    );

    /**
     * @notice Emitted once per recipient so inboxes can filter by their own
     *         indexed address without scanning every FlashSent array.
     * @param id        The flash ID this delivery belongs to.
     * @param recipient The recipient being notified.
     * @param sender    The sender.
     */
    event FlashDelivered(
        uint256 indexed id,
        address indexed recipient,
        address indexed sender
    );

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when an empty recipients array is provided.
    error NoRecipients();

    /// @notice Thrown when the recipients array exceeds MAX_RECIPIENTS.
    error TooManyRecipients();

    /// @notice Thrown when an empty payload is provided.
    error EmptyPayload();

    /// @notice Thrown when the payload exceeds MAX_PAYLOAD_BYTES.
    /// @dev The payload is the inline encrypted envelope or a CID for oversize media (#139).
    error PayloadTooLarge();

    /// @notice Thrown when a recipient has not opted in to Flash (no ratchet
    ///         key registered on RecipientRegistryV2).
    error RecipientNotFlashEligible(address recipient);

    /// @notice Thrown when msg.value differs from the exact fee.
    error WrongFee(uint256 expected, uint256 provided);

    /// @notice Thrown when the same recipient address appears more than once in one flash.
    error DuplicateRecipient(address recipient);

    /// @notice Thrown when the flash ID does not exist.
    error FlashNotFound();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @notice Deploys the MaktubFlash contract with immutable configuration.
     * @param _perRecipientFee   The fee in wei per recipient.
     * @param _feeReceiver       The Foundation address receiving all fees.
     * @param _recipientRegistry The deployed RecipientRegistryV2 contract.
     */
    constructor(
        uint256 _perRecipientFee,
        address payable _feeReceiver,
        RecipientRegistryV2 _recipientRegistry
    ) {
        require(_perRecipientFee > 0, "Fee must be > 0");
        require(_feeReceiver != address(0), "Fee receiver cannot be zero");
        require(
            address(_recipientRegistry) != address(0),
            "Registry cannot be zero"
        );

        perRecipientFee = _perRecipientFee;
        feeReceiver = _feeReceiver;
        recipientRegistry = _recipientRegistry;
    }

    // ──────────────────────────────────────────────
    //  Core Function
    // ──────────────────────────────────────────────

    /**
     * @notice Send a flash: instant delivery of an encrypted payload CID to
     *         the given recipients. Fire-and-forget — nothing about a sent
     *         flash can ever be modified, recalled, or deactivated.
     * @dev Requires `msg.value == flashFeeFor(recipients.length)` exactly.
     *      All recipients must be Flash-eligible on RecipientRegistryV2.
     * @param recipients Array of recipient addresses (1 to MAX_RECIPIENTS).
     * @param payload    The encrypted envelope, inline (1 to MAX_PAYLOAD_BYTES), or a
     *                   CID pointing to it off-chain for oversize media (#139).
     * @return id The unique identifier of the sent flash.
     */
    function flash(
        address[] calldata recipients,
        bytes calldata payload
    ) external payable nonReentrant returns (uint256 id) {
        // --- Validation ---
        if (recipients.length == 0) revert NoRecipients();
        if (recipients.length > MAX_RECIPIENTS) revert TooManyRecipients();
        if (payload.length == 0) revert EmptyPayload();
        if (payload.length > MAX_PAYLOAD_BYTES) revert PayloadTooLarge();

        uint256 fee = recipients.length * perRecipientFee;
        if (msg.value != fee) revert WrongFee(fee, msg.value);

        for (uint256 i = 0; i < recipients.length; ) {
            if (!recipientRegistry.isFlashEligible(recipients[i])) {
                revert RecipientNotFlashEligible(recipients[i]);
            }
            // Reject duplicate recipients: keeps the per-recipient fee honest, the
            // recipient index exact, and a flash to the same person twice is nonsensical.
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

        // --- State: durable record + discovery indexes (D-039), written BEFORE the
        //     external fee call (checks-effects-interactions). Canonical state is now the
        //     source of truth; the events below remain the real-time delivery path. ---
        id = flashCount;
        unchecked {
            flashCount++;
        }

        FlashRecord storage fr = _flashes[id];
        fr.sender = msg.sender;
        fr.recipients = recipients;
        fr.payload = payload;
        fr.timestamp = block.timestamp;

        // Recipients are deduped above and each id is created once, so every (id, recipient)
        // is recorded exactly once — no membership guard needed (cf. Beat's free update path).
        _sentFlashes[msg.sender].push(id);
        for (uint256 i = 0; i < recipients.length; ) {
            _receivedFlashes[recipients[i]].push(id);
            unchecked {
                i++;
            }
        }

        // --- Fee transfer (100% to Foundation, D-024) ---
        (bool sent, ) = feeReceiver.call{value: fee}("");
        require(sent, "Fee transfer failed");

        // --- Delivery notification (real-time path; canonical state is the durable truth) ---
        emit FlashSent(id, msg.sender, recipients, payload, block.timestamp);
        for (uint256 i = 0; i < recipients.length; ) {
            emit FlashDelivered(id, recipients[i], msg.sender);
            unchecked {
                i++;
            }
        }
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice The exact fee in wei for a flash with the given recipient count.
     * @dev Pure linear (D-022): `recipientCount * perRecipientFee`. Clients
     *      must pass exactly this as msg.value. Reverts for a zero count.
     * @param recipientCount The number of recipients (1 to MAX_RECIPIENTS).
     * @return The total fee in wei.
     */
    function flashFeeFor(uint256 recipientCount) external view returns (uint256) {
        if (recipientCount == 0) revert NoRecipients();
        return recipientCount * perRecipientFee;
    }

    /**
     * @notice Retrieve the durable record of a flash (D-039) — payload survives in
     *         canonical state regardless of event-log retention.
     * @param id The flash ID.
     * @return sender     The address that sent the flash.
     * @return recipients The recipient list.
     * @return payload    The encrypted envelope (inline) or a CID.
     * @return timestamp  The block timestamp of the send.
     */
    function getFlash(
        uint256 id
    )
        external
        view
        returns (
            address sender,
            address[] memory recipients,
            bytes memory payload,
            uint256 timestamp
        )
    {
        if (id >= flashCount) revert FlashNotFound();
        FlashRecord storage fr = _flashes[id];
        return (fr.sender, fr.recipients, fr.payload, fr.timestamp);
    }

    // ──────────────────────────────────────────────
    //  Discovery (D-039) — trustless late-reader lookup from canonical state
    // ──────────────────────────────────────────────

    /// @notice Number of flashes sent by `sender`.
    function sentFlashCount(address sender) external view returns (uint256) {
        return _sentFlashes[sender].length;
    }

    /// @notice All flash IDs sent by `sender` (send order; newest last).
    function getSentFlashes(address sender) external view returns (uint256[] memory) {
        return _sentFlashes[sender];
    }

    /// @notice A page `[start, start+count)` of `sender`'s sent flash IDs.
    function getSentFlashesPaged(
        address sender,
        uint256 start,
        uint256 count
    ) external view returns (uint256[] memory) {
        return _page(_sentFlashes[sender], start, count);
    }

    /// @notice Number of flashes received by `recipient`.
    function receivedFlashCount(address recipient) external view returns (uint256) {
        return _receivedFlashes[recipient].length;
    }

    /// @notice All flash IDs received by `recipient` (exact — see {_receivedFlashes}).
    function getReceivedFlashes(address recipient) external view returns (uint256[] memory) {
        return _receivedFlashes[recipient];
    }

    /// @notice A page `[start, start+count)` of `recipient`'s received flash IDs.
    function getReceivedFlashesPaged(
        address recipient,
        uint256 start,
        uint256 count
    ) external view returns (uint256[] memory) {
        return _page(_receivedFlashes[recipient], start, count);
    }

    // ──────────────────────────────────────────────
    //  Internal
    // ──────────────────────────────────────────────

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
