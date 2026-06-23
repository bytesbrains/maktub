# Multi-participant Flash (group chat) — app-layer design

**Status:** v1 implemented (mobile). Web parity is a follow-up.
**Issue:** issue #91 (tracked internally).
**Decision record:** D-029 (operator-local).

---

## 1. Premise

Flash (`MaktubFlash.sol`) is already multi-recipient end to end:

- **Contract** — `flash(address[] recipients, bytes payload)`, `MAX_RECIPIENTS = 25`,
  fee is linear (`recipients.length * perRecipientFee`), one `FlashDelivered`
  event per recipient.
- **Encryption** — `eciesEncryptBundle(plaintext, [pubkeys…])` writes one
  independently-decryptable ECIES blob per recipient.
- **SDK** — `flash(recipients: string[], payload)`.
- **App model** — `FlashMessage.recipients` is already a list.

So **no protocol, SDK, or encryption changes are needed.** Group chat is built
entirely at the app layer, consistent with the protocol principle *simplicity in
the protocol, complexity in the app*.

The hard part is not "loop over recipients" — it is **defining what a group
is**, because the protocol has no concept of one. There is no group ID, no
membership list, no join/leave. Every `flash()` carries its own ad-hoc audience.

---

## 2. Decisions (resolved by CEO, see D-029)

| # | Question | Decision |
|---|---|---|
| 1 | What defines a thread? | **A — member-set hash (stateless).** `groupId = hash(sorted(sender ∪ recipients))`. No durable client state; reconstructs purely from chain events; identical on every device and across both apps with no sync. The member set *is* the identity. |
| 3 | Partial Flash-eligibility | **Send to the eligible subset + warn.** Never silently drop a recipient — name who can't receive, require explicit confirmation. |
| 4 | Sender readback | **Encrypt-to-self from the start.** The sender appends their own key as an extra blob (`recipients += [me]`), so outgoing messages are readable on every device the sender owns. Cost is `(N+1) × perRecipientFee`. |
| — | Scope | **Design doc + first-cut mobile implementation.** Web parity is a follow-up. The roster *is* the group — no human-set name/avatar in v1. |

---

## 3. Thread identity (decision #1)

```
groupKey = sorted, lowercased join of  ({sender} ∪ recipients)
```

A keccak hash is unnecessary for client-side grouping — a normalized string key
is order- and case-independent and gives the same value to every participant.
See `flashGroupKey()` and `FlashMessage.roster()/others()/groupKey` in the
reference mobile app (separate repository).

- Two flashes belong to the same thread **iff their rosters are equal.**
- Because of encrypt-to-self (decision #4), the sender is already in
  `recipients`, so the roster collapses to the recipient set. For **legacy**
  1:1 sends (which predate encrypt-to-self and have no self blob), `roster()`
  folds the sender back in — so an old `A → [B]` message and a new
  `A → [B, A]` message share a thread. Migration is automatic; no backfill.

**Accepted consequence — membership *is* the identity.** Adding or removing a
participant changes the roster, which changes `groupKey`, which reads as a *new*
thread. This is honest: the protocol cannot enforce a stable group across
senders, so the app does not pretend one exists. "X was added/left" system
messages are explicitly out of scope.

### Routing

Threads route by their **other** participants (roster minus me),
comma-joined: `/inbox/thread/<0xA,0xB,0xC>`. A single address is the 1:1 case
and stays backward-compatible with every existing call site. `ThreadScreen`
takes `List<EthereumAddress> participants` and computes the thread key as
`flashGroupKey([me, ...participants])`.

---

## 4. Membership derivation on receive (decision #2)

A recipient reconstructs the roster from each flash as `{sender} ∪ recipients`
and the conversation's other members as `roster − me` (`FlashMessage.others`).
Each flash carries its own audience, so two senders *can* disagree on the
roster — this is the "silent drift" the issue flagged.

**v1 rule: each message renders against its own roster; the thread is the exact
member set.** There is no "newest message wins" canonicalization yet — a
divergent audience simply forms a different thread. Combined with the
subset-send behavior below, this is the main rough edge; see §8.

---

## 5. Eligibility (decision #3)

Every participant must be Flash-eligible (a `ratchetPubKey` in
`RecipientRegistryV2`). The composer resolves eligibility for all other
participants when the thread opens (`flashRosterEligibilityProvider`):

- **Zero eligible** → the composer shows the "no one here can receive instant
  messages yet / send a Beat instead" state (same shape as 1:1 today).
- **Some eligible** → the composer is usable; a muted inline notice names how
  many can't receive.
- **On send with ineligibles** → a confirm dialog lists exactly who will be
  left out and requires "Send anyway". The message goes only to the eligible
  subset — never silently to fewer people than the user thinks.

Because the actual recipients are the eligible subset, the sent message belongs
to the **subset's** thread. If that differs from the roster the user opened,
the screen navigates to the subset thread after sending, so the user lands where
their message actually went.

---

## 6. Sender readback (decision #4)

The sender appends their own ECIES public key as the **last** blob:
`recipients = [...eligibleOthers, me]`, `pubkeys = [...eligibleKeys, myPubKey]`.

Consequences:

- The sender holds a real decryption slot, so outgoing messages decrypt through
  the **normal** path on any of the sender's devices — `myIndex` is now set for
  outgoing flashes too (`flashesForAccount`), and `_loadBody` decrypts when
  `myIndex >= 0` regardless of direction. The on-device plaintext cache is kept
  only as an instant local echo; it is no longer load-bearing.
- Cost is linear in blobs: a group of N others costs `(N+1) × perRecipientFee`
  (the +1 is the sender's own blob).
- Legacy outgoing sends (no self blob, `myIndex == -1`) still fall back to the
  local cache, so nothing regresses.

---

## 7. Fee UX (decision #5)

- Cost is linear; a 25-person message is 25× a 1:1 (plus the self blob).
- 1:1 keeps the one-confirm-per-session ceremony (#39 §3). **Groups always
  confirm**, showing the exact fee and headcount, so the larger cost is never a
  surprise.
- **25 recipients is the contract's hard cap.** Larger rooms would need
  multi-`flash()` fan-out (loses atomicity, complicates cost/UX) — out of scope.

---

## 8. Known rough edges / follow-ups

1. **Membership drift + subset-send fragmentation.** Sending to an eligible
   subset, or any roster edit, forms a distinct thread. v1 surfaces this via the
   warn dialog and post-send navigation, but there is no roster
   canonicalization. A future option: a "newest message defines the roster"
   convention, or rendering each message's own audience inline.
2. **Web parity.** This first cut is mobile-only (the reference web app, in a
   separate repository, still hardcodes the single-address thread route). Web
   should follow the same model.
3. **Group affordance polish.** The roster header is a plain "N people" sheet;
   no names-in-title, avatars, or roster pinning yet.
4. **Beats in group threads.** The ceremonial Beat rail is shown only in 1:1
   threads; folding Beats (which carry their own recipient sets) into a group
   view is deferred.

---

## 9. Where it lives

These live in the reference mobile app (a separate repository); file paths are
given relative to that repo's root.

| Concern | File |
|---|---|
| Roster / `groupKey` / encrypt-to-self readback | `lib/services/flash.dart` |
| Roster eligibility provider | `lib/state/flash_provider.dart` |
| Thread view, composer, send, attribution, roster header | `lib/screens/inbox/thread_screen.dart` |
| Inbox grouping + multi-select new-message sheet | `lib/screens/inbox/inbox_screen.dart` |
| Comma-joined thread route | `lib/navigation/router.dart` |
| Tests (identity + encrypt-to-self round-trip) | `test/flash_group_test.dart` |
