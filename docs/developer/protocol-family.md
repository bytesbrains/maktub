# Maktub Protocol Family

> **Two citizens. Both immutable. No governance over protocol behavior.**
>
> *Maktub Protocol* is a two-citizen family of fully-immutable smart contracts on Base L2: **Maktub Beat** (timer-triggered) and **Maktub Flash** (instant-triggered). Both deliver encrypted payloads to recipients chosen by the sender. Nothing else lives at the protocol layer.

> ### Core vision
> **It is written. And only for whom it is written.**
>
> **It is written** — delivery is inevitable; no recall, no edit, no admin, no one (not even the Foundation) can stop it. **And only for whom it is written** — the payload is end-to-end encrypted to the sender-chosen recipients; only they can read it.
>
> These are the two properties the protocol guarantees, and the only two it claims. *"For whom it is written"* is a confidentiality claim (who can **read** it), never an anonymity claim (who can **see** it exists — recipient identity and timing are public on-chain by design; see §5). See decision D-031 (operator-local).

**Audience:** smart-contract developers, integrators, security auditors, ecosystem builders.

**Status:** Both citizens are live on Base Sepolia; both are mainnet-pending. *Maktub Beat* (`MaktubCore.sol`) is deployed and transacting. *Maktub Flash* (`MaktubFlash.sol`) is implemented, tested, and deployed on Sepolia too — it was built ahead of the original "spec-only" plan. **Mainnet sequencing is unchanged: Beat ships to mainnet first; Flash mainnet deployment stays gated on Beat being audit-green on mainnet.** This document records the architectural commitment that governs both citizens, plus the rules any future citizen must clear.

---

## Table of contents

1. [TL;DR](#1-tldr)
2. [The two citizens](#2-the-two-citizens)
3. [The shared substrate](#3-the-shared-substrate)
4. [Hardline architectural invariants](#4-hardline-architectural-invariants)
5. [Payload storage and encryption envelope](#5-payload-storage-and-encryption-envelope)
6. [What is NOT in the protocol](#6-what-is-not-in-the-protocol)
7. [Naming and brand topology](#7-naming-and-brand-topology)
8. [Status, roadmap, and open questions](#8-status-roadmap-and-open-questions)
9. [Why two citizens, not three (or one, or five)](#9-why-two-citizens-not-three-or-one-or-five)
10. [Adding a third citizen later](#10-adding-a-third-citizen-later)

---

## 1. TL;DR

Maktub Protocol is two immutable contracts on Base L2.

| Citizen | Contract | Trigger | Status |
|---|---|---|---|
| **Maktub Beat** | `MaktubCore.sol` | Timer expiry (owner did not check in within `interval`, minimum 1 hour) | Live on Base Sepolia; mainnet pending |
| **Maktub Flash** | `MaktubFlash.sol` | Send-now (~2s on Base, one block) | Live on Base Sepolia; mainnet gated on Beat audit-green |

Both citizens:

- Deliver an encrypted payload (the encrypted envelope inline, ≤4096B; or a CID for oversize media) to a sender-chosen list of recipients.
- Are **fully immutable**: no proxy, no governance, no admin, no pause, no `selfdestruct`.
- Read from the same `RecipientRegistry` family (v1 for Beat, v2 for Flash — each immutable).
- Use the same token (`$MKTB`), the same executor network, and the same automated value-accrual mechanism.

That is the whole protocol. Everything else — UX, compliance, identity mapping, product branding, audience tiering, subscription billing — lives in apps.

Full Beat specification: [`protocol-spec.md`](./protocol-spec.md).
Encryption-stack decision: `ENCRYPTION_DECISION.md` (operator-local).

---

## 2. The two citizens

### 2.1 Maktub Beat — timer-triggered

**Contract:** `MaktubCore.sol` (v3)
**Status:** Live on Base Sepolia. Mainnet pending (gated on `launch-blocker` issues).
**Upgradeability:** None. Permanently immutable.
**Trigger:** Timer expiry — the `execute()` function succeeds only if `block.timestamp >= lastCheckIn + interval` and `executed == false`.
**Minimum interval:** 1 hour. Hardcoded. Cannot be lowered for any reason.
**Creation fee:**
- *Currently deployed Beat (`MaktubCore.sol`):* a single `creationFee` constant (wei, immutable at deploy) is charged for any heartbeat regardless of recipient count. This is permanent for the deployed contract.
- *Future Beat redeployments:* committed curve shape is **base + per-additional-recipient surcharge** — `creationFee = base + (recipients.length − 1) × perAdditional`, both terms in wei, both immutable at deploy.
- *Committed wei targets (D-023):* `base = 124_000_000_000_000` wei (0.000124 ETH — matches today's deployed `creationFee`); `perAdditional = 40_000_000_000_000` wei (0.00004 ETH — `base/3` ratio). A 5-recipient Beat lands at ~2.3× the `base` cost; a 50-recipient Beat at ~17× — modest enough for legitimate multi-heir use, expensive enough to discourage broadcast as an estate-planning workaround.

**Recipients safety limit (future Beat redeployments):** `MAX_RECIPIENTS = 100`. Bound by ECIES envelope encryption work per recipient and executor processing latency, not raw block gas. At this cap a single max-recipient `createHeartbeat` call stays under ~3M gas on Base (well within block capacity) and ECIES envelope generation completes in well under a second client-side. The currently deployed Beat retains its `MAX_RECIPIENTS = 50` permanently (immutable). Flash's `flash()` pins an **exact-`msg.value`** policy (reverts `WrongFee` unless `msg.value == flashFeeFor(...)`) — current Beat refunds excess, but Flash requires exactness to keep the hot path one external call cheaper.
**Audiences served by apps on top of Beat:** whistleblowers and source-protected journalism, digital estate / inheritance, safety triggers (solo travel, field work). Beat is audience-agnostic; apps differentiate.
**Data structure (struct, not citizen name):**

```solidity
struct Heartbeat {
    address owner;
    address[] recipients;
    bytes payload;           // inline encrypted envelope (≤4096B), or a CID for oversize media
    uint256 interval;        // seconds; minimum 1 hour
    uint256 lastCheckIn;
    bool executed;
}
```

Full spec: [`protocol-spec.md`](./protocol-spec.md). This document does not duplicate it.

### 2.2 Maktub Flash — instant-triggered

**Contract:** `MaktubFlash.sol` — implemented, tested, and deployed on Base Sepolia.
**Status:** Live on Base Sepolia (D-039 canonical-state). Mainnet deployment is gated on Beat being audit-green on mainnet — Beat ships to mainnet first.
**Upgradeability:** None. Permanently immutable from day one.
**Trigger:** Send-now. Payload is pinned and a delivery event is emitted in the same transaction — roughly one Base block (~2 seconds).
**Creation fee:** committed curve shape is **pure linear** — `creationFee = recipients.length × perRecipient`, where `perRecipient` is in wei, immutable at deploy. No base fee, no bulk discount, no per-band tiering.
- *Committed wei target (D-023):* `perRecipient = 5_000_000_000_000` wei (0.000005 ETH ≈ Beat-`base`/25). A 1-on-1 Flash is mentally free for any crypto-active user; a 25-recipient max-cap broadcast costs 0.000125 ETH (≈ Beat-`base`); a 1000-recipient theoretical broadcast (split across many calls — see safety limit below) costs 0.005 ETH. Linear scaling is the spam moat; fragmentation gives no arbitrage advantage.

**Recipients safety limit:** `MAX_RECIPIENTS = 25`. Bound by send-now UX latency (single Base block confirmation, ~2s) and executor processing burden, not raw block gas. Apps that need to send to larger groups fan out N parallel `flash()` calls at the SDK layer; the protocol stays honest about per-tx cost. (Per security review, the absolute security ceiling is 200; 25 is well under.)
**Audiences served by apps on top of Flash:** human messaging, agent-to-agent coordination, enterprise routing. Flash is audience-agnostic at the protocol layer — the same contract serves consumer chat apps and enterprise agent pipelines. Apps differentiate.

Flash is **not** "Beat with interval = 0." The two citizens differ on trigger (silence-timer vs send-now), lifecycle (Beat is mutable until executed; Flash is fire-and-forget), fee curve, and executor pricing. Since **D-039** both store the payload in **canonical state** for inevitable retrievability, so they share storage *strategy* — the distinction is trigger + lifecycle + fee, not storage. (Supersedes the earlier "share substrate, not storage" line, which predated D-039's move of Flash off the event-log-only model.)

### 2.3 Quick comparison

| Dimension | Maktub Beat | Maktub Flash |
|---|---|---|
| Contract | `MaktubCore.sol` | `MaktubFlash.sol` |
| Trigger | Timer expiry (min 1 hr) | Send-now (~2 s on Base) |
| Lifecycle | Mutable until executed (check-in, update recipients, update interval; payload is fixed at creation) | Fire-and-forget |
| Pricing basis | `base` + `(N−1) × perAdditional`; committed: `base = 124 µETH`, `perAdditional = 40 µETH` (future redeployments). Currently deployed = flat `creationFee` immutable. | `N × perRecipient`; committed: `perRecipient = 5 µETH` (≈ `base/25`). |
| Safety limit (recipients/tx) | 100 (future redeployments); current deployed = 50 | 25 |
| Safety limit (payload bytes) | `MAX_PAYLOAD_BYTES = 4096` (inline-payload model, #139 — supersedes D-030's CID-only 256) | `MAX_PAYLOAD_BYTES = 4096` (inline-payload model, #139 — supersedes D-030's CID-only 256) |
| Upgradeability | None (immutable) | None (immutable) |
| Audit scope | Standalone, cold-storage forever once live | Standalone |
| Status | Live on Sepolia | Live on Sepolia (mainnet gated on Beat audit-green) |

---

## 3. The shared substrate

Both citizens depend on the same small substrate. Each piece of the substrate is itself immutable; substrate evolution means **new immutable contracts deployed alongside the old ones**, never in-place upgrades.

| Substrate | Contract | Serves | Upgradeability |
|---|---|---|---|
| Recipient registry v1 | `RecipientRegistry.sol` | Beat | Immutable (already deployed) |
| Recipient registry v2 | `RecipientRegistryV2.sol` | Flash | Immutable (deployed on Sepolia) |
| Token | `MktbToken.sol` | Both (economic layer) | Immutable (already deployed) |
| Executor rewards (MKTB emissions) | `ExecutorRewards.sol` | Both | See note below — planned immutable pre-mainnet |

**Fee flow and value accrual:** Each citizen contract sends the full `creationFee` directly to a hardcoded immutable Foundation address (see §4 invariant 5). This is a per-citizen immutable constant, not a separate substrate contract. MKTB value accrual comes from executor-stake demand (D-023 MKTB-stake-only commitment) — not from an automated buyback or burn layer.

> **Disclosure — `ExecutorRewards.sol` current state.** The deployed `ExecutorRewards.sol` carries inherited `GOVERNANCE_ROLE` and `CORE_ROLE` admin roles and tunable parameters (`rewardPerExecution`, `minimumStake`, pause). The doc's "immutable" framing is **aspirational** for the long-term architecture, not the literal current state. Before mainnet, one of two paths must be committed to: (1) renounce all admin roles on the deployed contract, or (2) deploy a clean-room `ExecutorRewardsV2` with no admin surface and migrate executors to it. Tracked internally as issue #23. The substrate-evolution rule in this section supports option (2); the existing no-governance invariant in §4 will not be literally true until one of those paths is executed.

### Substrate evolution rule

When v2 substrate ships, v1 does not get migrated or deprecated — it continues running forever, because every Beat that points at it must stay decryptable for its recipients. Users opt in to v2 by registering a new key under the v2 contract and creating new citizens that reference it. Old citizens keep working against old substrate.

### `RecipientRegistry` — typed key slots (v2 sketch)

`RecipientRegistry v1` stores one `bytes` public key per address. Per `ENCRYPTION_DECISION.md` (operator-local), v1 uses ECIES-on-secp256k1 with hybrid symmetric envelopes — the on-chain slot remains `bytes` and the in-SDK name changes from `prePublicKey` to `encPubKey`; no contract change needed for v1.

`RecipientRegistryV2` (for Flash) carries **typed key slots** — committed shape (D-023):

```solidity
struct RecipientV2 {
    bytes encPubKey;        // long-lived ECIES (v1-compatible), 33 or 65 bytes
    bytes ratchetPubKey;    // per-session ratchet for Flash forward-secrecy
    uint64 encUpdatedAt;
    uint64 ratchetUpdatedAt;
}
mapping(address => RecipientV2) private _recipients;
mapping(address => mapping(bytes32 => bytes)) private _extKeys;        // future types (PQ, hardware-attested) without v3
mapping(address => mapping(bytes32 => uint64)) private _extUpdatedAt;
RecipientRegistry public immutable v1;                                  // immutable fall-through pointer
```

- **Backward compatibility:** `getEncPubKey(addr)` returns the v2 record if set, else falls through to `v1.getPrePublicKey(addr)`. Beat users do not re-register; they remain Beat-only addressable through v1. Flash-eligible recipients explicitly opt in by registering a `ratchetPubKey` on v2.
- **Forward compatibility:** new key types (post-quantum, hardware-attested, etc.) live in `_extKeys` keyed by namespaced `bytes32` (`keccak256("maktub.keytype.v1.<name>")`) without forcing a v3.
- **Schema validation:** `register()` length-checks `encPubKey` to 33 or 65 bytes (compressed/uncompressed secp256k1) and reverts otherwise — the validation v1 does not have. Tracked internally as issue #20.
- **Org-hierarchy / agent identity stays in the SDK**, not the registry. The registry is a key store, not an identity service.

Any higher-order identity structure — org hierarchies, BIP-32 HD subkeys, key rotation policies — lives in the SDK and in apps, not in the registry. The registry only stores named key slots that apps agree on.

### Token: `MktbToken` at the protocol layer

`MktbToken.sol` is ERC-20 + ERC20Votes. The ERC20Votes interface exists because it is cheap to include and future apps / treasuries may need it. **At the protocol layer, the voting role is zero.** No function on `MaktubCore` or `MaktubFlash` reads `MktbToken.getVotes(...)`. There is no governance path that reaches either citizen or the registries.

### Fee flow, executor rewards, and value accrual

**Fee flow (committed, D-024):** every `creationFee` paid by a user — for Beat or for Flash — flows in full to a hardcoded immutable Foundation address (the same multisig pattern the currently-deployed Beat already uses for `feeReceiver`). The protocol earns the fee. There is no per-fee split between executor / burn / treasury inside the trigger contract. Same mechanism as the currently-deployed `MaktubCore.sol`.

**Executor rewards** are paid separately, in MKTB, from the existing `ExecutorRewards.sol` design (35M MKTB pool over a halving curve, ~10 years of distribution). Each successful `execute()` call (Beat) or successful delivery (Flash) earns the executor a MKTB stipend per the hardcoded reward curve.

**MKTB value accrual** comes from **executor-stake demand** (the LINK / GRT / LPT model). MKTB is the only acceptable executor stake (D-023). Active executor work creates structural buy demand for MKTB. There is no automated buyback-and-burn, no DEX-router dependency, no MEV-vulnerable auto-swap, and no compliance-archive pattern at the protocol layer.

**Year-11+ executor incentive cliff** is a known future engineering problem, not a protocol design problem. When `ExecutorRewards.sol`'s emission curve approaches exhaustion, the response is to deploy `ExecutorRewardsV2` with a fresh emission curve (substrate evolution per §3 — new immutable contract alongside the old; opt-in for new executors). This is the same pattern by which any substrate evolves; no governance vote, no admin key, no protocol-layer change. Tracked as a long-horizon planning item, not a launch-blocker.

---

## 4. Hardline architectural invariants

These are non-negotiable and apply to both citizens and to any future citizen. They are load-bearing for the protocol's whole trust posture. Any agent, proposal, or PR that violates one of them is rejected at review, not debated.

1. **Beat and Flash are fully immutable.** No UUPS. No transparent proxy. No governance hook. No admin role. No pause. No `selfdestruct`. No owner multisig. No upgrade path, ever, under any name.

2. **The protocol layer has zero governance over its own behavior.** Token holders do not vote on `MaktubCore`, `MaktubFlash`, `RecipientRegistry` (any version), or `MktbToken`. The voting interface on `MktbToken` exists for apps and treasury DAOs that may opt to use it, not for the protocol. The protocol has no admin function that a governance contract could call, because it has no admin functions at all.

3. **No compliance hooks, no KYC, no identity tiering, no audience-specific features, no subscription billing, and no jurisdictional awareness at the protocol layer.** The protocol is content-agnostic, identity-agnostic, audience-agnostic, and jurisdiction-agnostic. Apps handle all of that, including any compliance-recipient archiving, KMS integration, enterprise sub-identities, or content moderation. These features are invisible to the contracts.

4. **Bug fixes ship as new immutable deployments, never as upgrades.** If a bug is discovered in a deployed citizen, the response is: deploy a `V2`, let users opt in by creating new heartbeats or flashes against it, and leave the `V1` running forever for every existing user who depends on it. No vote, no timelock, no migration can change a deployed contract. This is the cost of immutability, and it is paid deliberately.

5. **Fees flow 100% to a hardcoded immutable Foundation address; executor rewards are paid separately in MKTB from the `ExecutorRewards` substrate.** No per-fee split inside the trigger contract. No automated buyback, no automated burn, no DEX-router dependency, no MEV-vulnerable auto-swap. The Foundation address is set at deploy and immutable thereafter. Same fee-flow shape as the currently-deployed Beat.

6. **Group size is bounded by a technical safety limit only.** There is no product-level cap. The ceiling exists to protect gas, storage, and executor processing — it is a safety number, not a business rule. Economic discipline against broadcast abuse comes from **per-recipient pricing**, which applies to both Beat and Flash with different committed curve shapes appropriate to each citizen's use mode — Beat: `creationFee = base + (recipients.length − 1) × perAdditional` with committed targets `base = 124 µETH`, `perAdditional = 40 µETH`, `MAX_RECIPIENTS = 100` (future redeployments); Flash: `creationFee = recipients.length × perRecipient` with committed target `perRecipient = 5 µETH`, `MAX_RECIPIENTS = 25`. Beat's existing `MAX_RECIPIENTS = 50` is grandfathered by virtue of Beat being immutable and already deployed. **Payload is bounded the same way:** `MAX_PAYLOAD_BYTES = 4096` on both citizens caps the *on-chain* `payload` field. Under the **inline-payload model** (#139, which supersedes D-030's CID-only 256-byte rule), the field holds the **inline encrypted envelope** for normal letters — the body rides on-chain, no off-chain storage needed — or, only for **oversize media** that exceeds the inline cap, a content-addressed CID pointing to an off-chain encrypted manifest (§5). The bound is a gas / storage / executor-processing safety number, not a rule forcing content off-chain; both `MaktubCore.createHeartbeat` and `MaktubFlash.flash` revert `PayloadTooLarge` above 4096 bytes.

7. **Fees are denominated in wei (ETH) and paid in ETH at the point of use.** No MKTB-denominated fees, no oracle-priced stable-value fees, no fiat-denominated fees, no token-allowance dance. Users pay via `msg.value`. The specific wei amounts for the curve constants are set at deploy and immutable thereafter. Apps may translate the wei cost to local currency for display, but the protocol itself is fiat-blind. The MKTB economy lives in executor-stake demand (per D-023's MKTB-stake-only commitment) and in `ExecutorRewards` MKTB emissions, not on the user-payment side. Collected ETH funds Foundation operations (per invariant 5).

### How bug fixes and evolution work under immutability

A common question about the protocol: *"No upgrades? What happens when a bug is found, a feature needs adjustment, or the spec needs to evolve?"* The answer — committed in D-025 (2026-04-19) — distinguishes sharply between two patterns.

**What the architecture forbids (on any already-deployed citizen):**
- UUPS proxies, transparent proxies, diamond proxies, any pattern with an implementation slot a third party can rewrite
- Governance hooks that let token holders change contract behavior
- Admin roles / owner / multisig with authority over any protocol contract
- Pause functions, circuit breakers, kill switches
- `selfdestruct`, `delegatecall` to a mutable target
- Any upgrade path, ever, under any name

**What the architecture DOES support:**
- Deploy a new immutable contract (`V2`) at a new address, with the bug fix or feature change baked in
- V1 keeps running forever at its original address — nothing forces anyone off it
- Users opt in to V2 at their own pace: existing V1 state continues to work via V1; new actions target V2 if the user chooses
- Apps and SDKs read from both versions and present a unified UX; the protocol makes no effort to migrate users, only to coexist with old versions

**Why this discipline.** The core value proposition of Maktub is that the code executing a user's heartbeat cannot be changed by anyone after commitment. Whistleblowers, dying-declaration users, and digital-estate recipients are betting their lives or estates on this guarantee. Any upgrade path — however well-governed — becomes a target: a state actor coerces the upgrade authority; a multisig key gets phished; a governance vote gets captured by a whale coalition; "we had to push the patch to stop a drain" becomes a cover for compelled changes. Immutability is the only defense that survives adversarial conditions.

**What this costs.** The trade is real and should be understood:

| Can't do | Mitigation |
|---|---|
| Push a zero-day patch silently on deployed V1 | Deploy V2, publicly disclose the bug, users self-migrate |
| Emergency pause during an active exploit | V1 keeps being exploitable until users migrate to V2; app-layer can blacklist V1 in its UI |
| Tune fees post-deploy | V2 has different fee constants |
| Add a helper view function | Either live without it, or deploy V2 |
| Fast-follow on a spec revision | Every revision is a new deployment + parallel coexistence |

**Comparison to the wider ecosystem.** Ethereum itself evolves via hard forks (old chain can keep running); Bitcoin via soft/hard forks; Uniswap V1 → V2 → V3 → V4 each shipped as new deployments with the old ones still live today. Maktub chose the Ethereum / Uniswap path, not the typical DeFi "governance-upgradable proxy" path — deliberately, because the protocol's value prop makes the former the only honest architecture.

**The one honest caveat.** The deployed `ExecutorRewards.sol` carries inherited `GOVERNANCE_ROLE` + `CORE_ROLE` admin roles and tunable parameters — it is not yet actually immutable. Before mainnet, one of two paths must be committed to: (1) renounce all admin roles on the deployed contract, making it retroactively immutable; or (2) deploy a clean-room `ExecutorRewardsV2` with zero admin surface and migrate executors. Tracked internally as issue #23. Until one of those paths is executed, the substrate-immutability claim is aspirational for that one contract.

**Can the rule itself be changed?** The rule is *architectural*, not *bytecode-enforced at the framework level*. A future team could deploy a new contract with a proxy pattern if they chose to. But for any contract that already exists immutable, nothing — not the team, not token holders, not a court order — can change it. The framework for introducing a new citizen exists in §10 below; it would require an explicit, publicly-debated decision to break the immutability invariant for that citizen specifically, which would instantly forfeit the trust properties built around that citizen. Practically: we don't upgrade. By discipline and by design.

---

## 5. Payload storage and encryption envelope

Under the **inline-payload model** (#139), a normal Beat or Flash creation stores the **encrypted envelope inline** in its on-chain `bytes payload` field (≤ `MAX_PAYLOAD_BYTES = 4096`) — the body rides on-chain and needs no off-chain storage at all. Only **oversize media** that exceeds the inline cap falls back to a **CID** in the same `bytes payload` field, which resolves off-chain to an **encrypted manifest** containing the message text, attachment descriptors, and per-recipient key material. (This supersedes D-030's earlier CID-only model, where every payload was a manifest CID.)

The contract is deliberately content-agnostic either way — it treats `payload` as opaque bytes and knows nothing about whether they are an inline envelope or a CID, nor about attachment count, TTL, or provider choice. **Everything below in §5 — the off-chain envelope structure, IPFS / Arweave persistence, TTL, pinning, and provider-diversity machinery — is the oversize-media path and the manifest model.** It does not apply to a normal inline letter, whose ciphertext lives entirely in contract state. The per-recipient envelope structure in §5.1 describes the encrypted blob's shape whether it rides inline or via an off-chain manifest.

### 5.1 Envelope structure

**Encryption stack (v1):** ECIES on secp256k1 for per-recipient key wrapping; AES-256-GCM for symmetric content encryption; HKDF-SHA-256 for key derivation. Per `ENCRYPTION_DECISION.md` §4.4 (operator-local). Vocabulary here matches the currently-deployed Beat envelope already in production use — the v1 additions below are backward-compatible extensions to the existing shape, not a rename.

**Envelope v1 (JSON, versioned):**

```json
{
  "v": 1,
  "alg": "ECIES-secp256k1-AES256GCM-HKDFSHA256",
  "blobs": [
    {
      "recipient": "0x...",
      "ct": "base64(ECIES+AES-GCM ciphertext)"
    }
    // one blob per recipient; SDK locates own blob by address match
  ]
}
```

For a **normal letter**, the on-chain `bytes payload` field holds this **inline encrypted envelope** directly (≤ `MAX_PAYLOAD_BYTES = 4096`); recipients read it straight from contract state. For **oversize media**, the field instead holds a **CID** (IPFS CIDv1, raw multihash bytes), the envelope is uploaded to IPFS (+ Arweave for Beat, see §5.2), and recipients fetch it by CID. Either way, a recipient locates their own `blobs[]` entry by address and ECIES-decrypts with their private key to obtain a per-recipient **body**:

```json
{
  "message": "base64(AES-256-GCM ciphertext of the message text)",
  "attachments": [
    {
      "filename": "draft.pdf",
      "size": 1234567,
      "mime": "application/pdf",
      "cid": "bafy...",
      "key": "base64(32 bytes — AES-256-GCM key for this attachment, scoped to this recipient)"
    }
    // ...
  ]
}
```

Encrypted attachments are uploaded to IPFS separately from the envelope, each encrypted with a distinct per-recipient AES key carried inside that recipient's body. A recipient fetches each attachment's CID and AES-decrypts locally.

**Key-wrap and blast-radius discipline (per security review):**

- **Per-recipient independence.** Each recipient's `blobs[]` entry is encrypted with that recipient's ECIES public key wrapping a session key unique to that recipient. Per-attachment AES keys inside the decrypted body are HKDF-derived from that per-recipient session key (`k_i = HKDF(sessionKey_r, "maktub.att.v1" || attachmentId)`). **Compromise of one recipient's ECIES private key exposes only that recipient's view of the message and attachments.** Other recipients' blobs are independently decryptable only by their owners.
- **Intra-recipient blast radius.** An adversary who obtains one recipient's session key (e.g., via a partial side-channel during decryption) can derive all attachment keys in that message for that recipient. An adversary who obtains only a single attachment-specific key (e.g., extracted from memory mid-decryption) exposes only that attachment. Granularity is by recipient, then by attachment.
- **No shared manifest key across recipients.** Tempting for envelope-size savings; rejected. A single leaked long-term key would otherwise expose the attachment list (and content) to an adversary who can then subpoena the corresponding CIDs.
- **Flash enables forward secrecy** via the `ratchetPubKey` slot in `RecipientRegistryV2`: the per-recipient session key is derived X3DH-style from a per-session ratchet, so compromise of a recipient's long-lived `encPubKey` does not retroactively decrypt past Flash messages. The ratchet key must be rotated by the recipient periodically for the property to hold; SDK handles the rotation UX (tracked internally as issue #30).
- **Beat cannot achieve forward secrecy** by design — the payload is encrypted once at creation and must remain decryptable on execution that may happen years later. This is a deliberate trade-off: Beat chose long-lived decryptability over forward secrecy.

**Version evolution.** The `v` field + `alg` string let v1 envelopes coexist forever with v2+ envelopes (e.g., post-quantum layering per issue #31). The standalone `@bytesbrains/maktub-manifest-reader` package (§5.6) supports all versions it was shipped against; a v1-only reader archived today will decrypt a 2041 v1 Beat regardless of where the main SDK has moved.

### 5.2 Provider-diversity floor (per citizen)

For the **oversize-media path only** (a normal inline letter has no off-chain dependency — its ciphertext lives in contract state), storage durability is the soft underbelly of the trust model. If the Foundation's pinning infrastructure were the sole source of an oversize Beat payload, a compelled unpin would be equivalent to a `pause()` switch on `MaktubCore` — which we explicitly forbade at the contract layer. **For media stored by reference, the SDK enforces a minimum provider-diversity floor at creation time** and refuses to proceed if the caller's storage configuration falls below it.

| Citizen | Commercial pinners (hot) | Permanence layer (cold) | Foundation role | Tracked at |
|---|---|---|---|---|
| **Beat** | ≥ 2, jurisdictionally diverse | **Arweave (required)** — 200-year endowment matches decade-scale obligation | Optional hot-pin (performance only; never sole source) | issues #24, #25, #29 |
| **Flash** | ≥ 2, any | Not required (short-horizon) | Primary hot-pin (for ~2 s delivery) + ≥ 2 commercial async-replicated within 60 s | issue #29 |

**Flash default TTL: 90 days, user-extendable.** Flash payloads have a read-once-then-cold empirical pattern; Foundation stops pinning after the TTL, the CID becomes effectively unfetchable, and the payload is garbage-collected even though the on-chain record remains. Recipients may call an SDK-level "archive" function before expiry to re-pin under their own account or push to Arweave for permanence. Advance-notice (7 days) via an SDK notification.

### 5.3 Hot-pin infrastructure and latency reality

**Flash's ~2 s delivery target holds only for text-only payloads.** With attachments, upload dominates:

| Payload | Target P50 | Hard budget |
|---|---|---|
| Text-only (≤ 32 KB) | ~2 s | 4 s |
| +1 MB attachment | ~3–4 s | 8 s |
| +10 MB attachment | ~8–12 s | 20 s |
| +100 MB attachment | ~45–90 s | 5 min |

The SDK surfaces stage progress via events (`encrypt` → `upload` → `pin` → `chain`) so apps can render honest progress UIs. The flow is **publish-before-tx**: SDK encrypts locally, uploads to the hot-pin tier, awaits pin confirmation on ≥ 1 redundant provider, and only then submits the `flash()` / `createHeartbeat()` transaction. Partial upload failure post-submit is unrecoverable; the SDK refuses to submit the tx until every attachment CID is confirmed pinned.

### 5.4 Cost realities (wei-relative)

At projected adoption volumes (100K Flash users × 10 msg/day × ~3 recipients average, 5% attachment rate at 10 MB average), storage costs using Filebase-class providers land at ~4 ETH/year — **under 1% of the fee-inflow projection**. Even 100× heavy load tops out at ~400 ETH/year (~2% of inflow). The 100%-to-Foundation fee flow (D-024) comfortably absorbs storage as an operational cost without needing a contract-level per-MB fee.

Beat's permanent-corpus cost (Arweave + commercial redundancy for ~50 GB projected lifetime) is ~95 ETH one-time — a single day's inflow at mid-volume.

**No per-MB fee at the contract layer.** Per architecture review, sender-declared size is unenforceable on-chain, and the contract would be stuck with hardcoded storage-cost assumptions as provider economics shift. Storage cost is absorbed by Foundation operations, funded by the 100% fee flow. If scaling economics change materially in Year 5+, the response is a new immutable `MaktubFlashV2` deployment per the substrate-evolution rule, not a per-MB retrofit on v1.

### 5.5 Metadata-leakage honesty

**Maktub's metadata posture is materially worse than every mainstream encrypted messenger** for the axes that matter:

| Protocol | Who sees recipient identity? | Who sees timing? |
|---|---|---|
| Signal | Signal servers (connection IPs) | Signal servers |
| WhatsApp | Meta (full social graph) | Meta |
| Telegram (non-secret) | Telegram Inc. (full) | Telegram Inc. |
| SimpleX | Nobody (no identifier) | Per-queue relay only |
| **Maktub Beat/Flash** | **Entire chain, forever** | **Entire chain, forever** |

This is a protocol property, not a bug — on-chain auditability is the flip-side of contract-layer immutability. But **"private" cannot appear in user-facing copy unqualified**. Acceptable framings: *"end-to-end encrypted — nobody can read your content"*; *"the content is private; the fact that you sent something, and to whom, is publicly visible on-chain"*. Any "uncoercible" or "anonymous" copy requires additional gating on the SDK fetch-mode work and storage-diversity floor (issues #26, #28, #29).

### 5.6 Long-tail resilience — decryption in Year 20

A Beat created today and triggered in 2041 must decrypt in 2041. Architectural hedges:

- **Standalone `@bytesbrains/maktub-manifest-reader` package** — zero runtime deps beyond `@noble/curves` + `@noble/ciphers`, under 20 KB packed, archived per release to IPFS + GitHub releases. A recipient in 2041 can install a `legacy-v1` tag and decrypt given their private key, regardless of where `@bytesbrains/maktub-sdk` has moved.
- **Self-describing envelope.** Manifest's `alg` field plus byte-level spec in `docs/developer/envelope-v1.md` let any competent cryptographer decrypt from scratch without the SDK.
- **Printable PDF recovery sheet.** Mobile app offers to generate a paper recovery sheet for any Beat — CID, envelope version, pointer to open-source decryption reference, recipient private-key backup instructions. Paper outlives services.
- **Post-quantum research track** (issue #31) — evaluate CRYSTALS-Kyber / ML-KEM wrapping under the existing envelope before any decade-scale whistleblower marketing cycle. Not launch-blocking; real tail risk.

### 5.7 What stays outside the protocol (storage edition)

Consistent with the "apps handle everything" discipline in §6:

- **Fine-grained payload policy.** Beyond the contract-level `MAX_PAYLOAD_BYTES = 4096` safety cap (§4 invariant 6 — a gas / storage / executor-processing bound on the on-chain `payload` field under the inline-payload model, #139, superseding D-030's CID-only 256), all finer policy for the **oversize-media / manifest path** is app-layer enforced by the SDK: the off-chain envelope size, attachment limits, manifest shape, and storage budgeting. The contract bounds only the on-chain `payload` field; for media stored by reference it does not — and cannot — see or limit the off-chain blob.
- **TTL / expiration semantics.** Encoded inside the encrypted manifest; recipient clients honor or ignore. The contract has no `validUntil` field.
- **Provider choice.** Apps can configure their own storage providers via `BYOStorage` adapter in the SDK; the protocol has no preferred-provider registry.
- **Attachment pricing surcharges.** Apps may mark up the protocol fee at the UX layer for premium storage / longer TTL / etc. The protocol charges the committed per-recipient curve only.
- **Compliance-archive recipients.** Enterprise apps may enforce a compliance-recipient on every Flash at the app/SDK layer. The contract does not see this and does not enforce it.

### 5.8 Tracked follow-ups for the storage layer

Full red-flag catalogue (per security review):

| Ref | Severity | Issue | Summary |
|---|---|---|---|
| RF-S1 | `launch-blocker` | issue #24 | Beat must not ship with Foundation-only pinning |
| RF-S2 | `launch-blocker` | issue #25 | Beat requires Arweave (or equivalent permanence layer) |
| RF-S3 | `red-flag` | issue #26 | SDK default fetch leaks recipient IP |
| RF-S4 | `red-flag` | issue #27 | Envelope `blobs[]` array leaks recipient addresses |
| RF-S5 | `hardening` | issue #28 | Metadata-honesty in UX |
| RF-S6 | `red-flag` | issue #29 | SDK must enforce provider-diversity floor |
| RF-S7 | `red-flag` | issue #30 | Key-rotation UX in `RecipientRegistryV2` |
| RF-S8 | `hardening` | issue #31 | Year-20 decryption: standalone reader + printable backup |
| RF-S9 | `red-flag` | issue #32 | `MaktubFlash.sol` spec must preserve `ratchetPubKey` |

RF-S1, RF-S2 gate Beat mainnet. RF-S3/S4/S6/S7/S9 must resolve before Flash *mainnet* deployment (Flash is already live on Sepolia) or before any whistleblower-facing Beat marketing.

---

## 6. What is NOT in the protocol

Everything in the list below lives **in apps**, not at the protocol layer. The protocol does not know about it and cannot enforce it.

- KYC, identity verification, sanctions screening.
- Jurisdictional awareness or geofencing.
- Compliance recipients (SEC 17a-4, HIPAA, attorney-client archive obligations). An enterprise app may enforce a compliance-recipient on every outbound Flash at the app layer — the protocol does not know this happened, does not validate it, and has no function to enforce it.
- Audience tiering, subscription billing, freemium gating, per-country pricing.
- Governance votes, treasury allocation votes, parameter tuning, feature flags, kill switches.
- Marketing or brand logic — "Maktub Messages" or "Maktub Agents" may exist as **app brands** on top of Flash; they are not protocol contracts and do not appear in the codebase under those names.
- UX identity mapping (ENS, email, human-readable handles).
- Account abstraction routing, bundlers, paymasters, session keys.
- Content moderation, reporting, takedown.

If a feature would require the protocol to "know" something about who a user is, where they are, what content they are sending, or what they can and cannot do, it is an app-layer feature. No exceptions.

---

## 7. Naming and brand topology

| Layer | Name | Usage |
|---|---|---|
| The family / umbrella | **Maktub Protocol** | "Maktub Protocol is a two-citizen family of immutable contracts on Base L2." |
| The timer-triggered citizen | **Maktub Beat** | "Maktub Beat is live on Base Sepolia." |
| The instant-triggered citizen | **Maktub Flash** | "Maktub Flash is live on Base Sepolia; it ships to mainnet after Beat." |
| Contract file for Beat | `MaktubCore.sol` | Kept as the file name since Beat is already deployed under it. |
| Contract file for Flash | `MaktubFlash.sol` | Deployed on Sepolia; mainnet deployment follows Beat. |
| Data structure inside Beat | `Heartbeat` (struct) | "The `Heartbeat` struct stores owner, recipients, payload, interval, lastCheckIn, executed." |
| Token | `$MKTB` | Same token across both citizens. |

### Retired terms at the protocol layer

The following terms appeared in earlier drafts and are **retired as protocol-layer concepts**. They may continue to exist only as **app-layer product brands built on top of Flash**, never as contract files in this repo.

- ❌ *Maktub Messages* — not a protocol contract. May be the name of a consumer chat app built on Flash.
- ❌ *Maktub Agents* — not a protocol contract. May be the name of an enterprise agent-coordination app built on Flash.
- ❌ *Maktub Heartbeat* as a citizen name — `Heartbeat` is the struct inside Beat. The citizen's name is *Maktub Beat*.

### Forbidden constructions

- "Maktub is immutable" is ambiguous when both citizens are in scope — use *Maktub Beat is immutable* or *Maktub Flash is immutable* or *the Maktub Protocol contracts are all immutable*.
- "Maktub Heartbeat" in any public or internal context — the struct is not the citizen.
- "Maktub Messages contract" or "Maktub Agents contract" — there is no such contract at the protocol layer.

---

## 8. Status, roadmap, and open questions

### Status

| Citizen | Status | Next milestone |
|---|---|---|
| Maktub Beat (`MaktubCore`) | Live on Base Sepolia | Mainnet (gated on `launch-blocker` issues) |
| Maktub Flash (`MaktubFlash`) | Live on Base Sepolia (D-039 canonical-state) | Mainnet (gated on Beat being audit-green on mainnet) |

### Protocol-design decisions — all closed

All four prior open questions from D-021 are now resolved: wei values, safety limits, and `RecipientRegistryV2` schema by **D-023**; fee flow / value accrual by **D-024** (per the original-model commitment — every `creationFee` flows 100% to the hardcoded immutable Foundation address; executors are paid via MKTB emissions from the existing `ExecutorRewards.sol`; the Year-11+ executor cliff is deferred to a future `ExecutorRewardsV2` substrate redeployment, handled outside the protocol-design surface). See §3 "Fee flow, executor rewards, and value accrual" for the committed mechanism.

### Engineering work — Flash built ahead of plan

`MaktubFlash.sol` and `RecipientRegistryV2.sol` were implemented, tested, and deployed on Base Sepolia ahead of the original "Beat-mainnet-first, then Flash spec" sequencing below. The items that were open at spec time are now closed in code:

- `MaktubFlash.sol` + `RecipientRegistryV2.sol` — implemented, deployed on Sepolia, covered by the `test/MaktubFlash.*.test.js` suite (adversarial, boundaries, discovery, fee, flash, validation).
- Flash `msg.value` policy — **resolved: exact-fee.** `flash()` reverts `WrongFee` unless `msg.value == flashFeeFor(recipients.length)`. Both fee terms are immutable, so every client computes the fee exactly; exactness keeps the hot path one external call cheaper (no refund). Unlike Beat, whose original deployment predates the committed curve and refunds excess.

Still open, not Flash-specific:

- `ExecutorRewards.sol` admin-role resolution pre-mainnet (renounce vs V2 redeploy) — see §3 disclosure and issue #23.

None of this changes the protocol-design commitments captured here.

### Sequencing

Flash was *built* ahead of plan, but the **mainnet** order is unchanged: **Beat mainnet → Flash mainnet**, not in parallel. Both citizens live on Base Sepolia today; Flash mainnet deployment stays gated on Beat being audit-green on mainnet. Substrate decisions (`RecipientRegistryV2` schema, `ExecutorRewardsV2` if/when needed) follow the substrate-evolution rule from §3 — new immutable contracts deployed alongside, never in-place upgrades.

---

## 9. Why two citizens, not three (or one, or five)

An earlier draft of this document proposed a **three-citizen** family — Beat, Messages, Agents — with Messages and Agents as governance-upgradeable siblings. That draft was superseded on 2026-04-19 after the CEO reframed the protocol's purpose:

> *"We don't have to care for legal or country rules, we aren't making it to please the governments. And we aren't making and selling app, because governance comes into picture at app level. We are designing a decentralised true private communication protocol. That's it."*

Everything that differentiated Messages from Agents turned out to be app-layer concern once that reframe landed:

- **Audience-specific features.** Consumer vs. enterprise UX → apps, not the protocol.
- **Compliance hooks.** Regulated-industry archive recipients → apps, enforced by SDK policy and organizational discipline, never by contract code.
- **Tiered trust postures.** "Warm session PRE for Messages, org-hierarchy key ceremony for Agents" → app concerns layered on top of a single primitive.
- **Different fee tiers per audience.** Consumer-low vs. enterprise-high pricing → expressed via different base rates within a single per-recipient pricing model and via app-layer markup, not via separate contracts.
- **Governance-upgradeability.** Any upgrade surface is a coercion vector — incompatible with "true private decentralized." Eliminated entirely.

Strip those app-layer concerns out and Messages and Agents collapse into the same protocol-layer primitive: **instant-triggered encrypted delivery to N recipients**. One contract. One citizen. **Flash.**

Beat remains a distinct citizen because its **trigger** is fundamentally different: Beat fires on the absence of a check-in, Flash fires on an explicit send. A single contract conditional-on-flag would force the min-1hr timer floor to become a flag-dependent invariant, which is exactly how silence-triggered contracts get people killed (see the hardline invariants in §4). The trigger split is structural, not a branding choice.

That is why the family has two citizens, not one or three.

---

## 10. Adding a third citizen later

The door is not closed — but it is gated. A third citizen may be proposed when a new trigger semantic exists that clears all four gates below. No gate is optional.

1. **It cannot be expressed by parameter choice inside Beat or Flash.** If it can be built by setting `interval = X` on Beat, or by an app sending a Flash, it does not get its own citizen.
2. **It is neither a pure timer trigger nor a pure instant trigger.** If it is either of those, it belongs inside Beat or Flash. A third citizen must represent a genuinely different trigger shape — e.g., oracle-conditional delivery, multi-party threshold release, on-chain event-triggered, etc.
3. **It ships as a fully immutable contract from day one.** No upgrade path. No governance. No admin. No pause. Same immutability rules as Beat and Flash. If the trigger semantic requires governance to work, it is not a valid citizen — it is an app.
4. **It reuses existing substrate.** `RecipientRegistry` (the appropriate version), executor network, `MktbToken`, value-accrual mechanism. If it needs a new substrate, the substrate ships as its own new immutable deployment alongside the existing versions — not as an upgrade.

A third citizen is added to this document in the same PR that deploys it. Citizens are not retroactively merged.

---

