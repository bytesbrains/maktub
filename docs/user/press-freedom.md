# Press Freedom

A guide for journalists, editors, and researchers who carry information of consequence, and who need a way to ensure that information — and their obligations to sources — survive their own silence.

This guide is for:

- Investigative reporters working on stories with sensitive material
- Freelance journalists in regions where reporting carries risk
- Researchers, NGO field staff, and fact-finders with privileged information
- Editors and lawyers who serve as handoff points for ongoing investigations
- Source-protection custodians at newsrooms

The framing of this document is simple and deliberately neutral: the protocol helps a journalist ensure that the story reaches the right professional custodians — editor, lawyer, trusted colleague — if the journalist can no longer do so themselves. The protocol is content-agnostic, takes no side in any dispute, and makes no accusations against any actor.

---

## Table of contents

1. [Why journalists need this](#why-journalists-need-this)
2. [What the protocol does and does not do](#what-the-protocol-does-and-does-not-do)
3. [Content-agnostic by design](#content-agnostic-by-design)
4. [What to place in the payload](#what-to-place-in-the-payload)
5. [Who should receive it](#who-should-receive-it)
6. [Interval choice](#interval-choice)
7. [Operational security](#operational-security)
8. [Threat model: what this does and does not defend against](#threat-model-what-this-does-and-does-not-defend-against)
9. [Working with a newsroom](#working-with-a-newsroom)
10. [After the story breaks](#after-the-story-breaks)

---

## Why journalists need this

A serious journalist working on a story of consequence faces a recurring dilemma: the story is not yet ready to publish, but something could happen before it is. Accidents. Illness. Arrest. Any of the reasons a human being can go silent. If the journalist does, their notes and their obligations to sources do not automatically pass to a colleague. They sit in an inbox, on a laptop, or in a notebook — inert.

Most newsrooms address this informally: a designated colleague holds a copy, a lawyer has a sealed envelope, or the editor knows the password to a shared drive. These informal systems are fragile. They depend on one person remembering, one lock not rotating, one attorney not retiring.

Maktub makes the handoff deterministic. The journalist writes what the handoff would contain, names the professional custodians — editor, lawyer, colleague — and sets a timer. While the journalist is active and checks in, nothing happens. If the journalist stops checking in, the material reaches the custodians according to the plan the journalist wrote.

This is press freedom expressed as infrastructure. The right to ensure the work survives the journalist, and the right to keep source promises even when circumstances remove the journalist from the situation.

## What the protocol does and does not do

**What it does:**

- Stores an encrypted payload on permanent, censorship-resistant infrastructure (IPFS/Arweave)
- Holds that payload behind a timer controlled by the journalist's check-ins
- On timer expiry, makes the payload decryptable by the named custodians — and only the named custodians
- Delivers permanently, with no recall, no pause, and no institutional override

**What it does not do:**

- Publish anything. Delivery is to the custodians the journalist named, not to the public. What the custodians do with the material is their decision.
- Make the journalist anonymous or untraceable. The protocol does not link a wallet address to a real-world identity, but it does **not** hide that link either. The owner's wallet address, the recipients' addresses, and the timing of every check-in and delivery are **public and permanent** on-chain. The protocol protects *what the payload says* (content), never *the fact that a heartbeat exists or whom it names* (metadata). Do not treat Maktub as an anonymity tool.
- Accuse any party. The protocol has no opinion about why the journalist went silent. It executes based on elapsed time, not on theories about cause.
- Protect against physical coercion. If a journalist is compelled under duress to check in or to deactivate, the protocol has no way to detect that.
- Replace a newsroom's legal counsel, source-protection protocols, or editorial judgment.

## Content-agnostic by design

The protocol layer is deliberately content-agnostic. It does not know what is in the payload and cannot read it. This matters for two reasons.

**Legal.** Maktub Protocol, the codebase, and the executor network cannot be held responsible for the content of any individual payload because they cannot see the content. They are comparable to a postal service or an encrypted messenger — common-carrier infrastructure.

**Ethical.** Maktub takes no side in any dispute between a journalist and any actor. If a journalist uses the protocol to safeguard their work, the protocol treats that heartbeat exactly the same as one safeguarding a hiker's trip or an inheritance letter. The protocol delivers; the journalist decides what, to whom, and when.

The public framing of this use case is similarly neutral. Maktub is a tool for ensuring that a journalist's work and source obligations survive the journalist's silence — it is not a tool against any government, organization, or individual.

## What to place in the payload

A press-freedom payload is a professional handoff package. It should be sufficient for the custodian to understand what they have received and what the journalist asked them to do with it.

A suggested structure:

```
HANDOFF — [BYLINE / STORY CODE]
Last updated: [date]

PURPOSE
This is a handoff of reporting material from [journalist name] to the
professional custodians named below. It exists because the journalist has
not checked in within the interval they set and cannot deliver this
material in person.

WHAT IS IN THIS PACKAGE
- [One-paragraph description of the story and its current state]
- [List of documents, recordings, transcripts, and their locations]
- [Source handling instructions — see below]

WHAT THE JOURNALIST ASKS YOU TO DO
[Specific instructions. Examples:
 "Verify the remaining factual claims in section 4 before publication."
 "Do not publish without legal review by [attorney name]."
 "If source S1 can be contacted safely, tell them the story is moving
  forward. Otherwise protect their identity as specified below."]

SOURCE PROTECTION
[For each source, explain the promise made. Include a key for the source
codes used in the documents so the custodians can read the notes.]

WHERE THE MATERIAL LIVES
[Cloud storage location + how to access it. Hardware locations. Encrypted
archive passwords. Where the original notebooks are stored. A link to the
journalist's encrypted communication history if that is part of the story.]

LEGAL
[Attorney name and contact. Retainer status. Any pre-publication clearance
the attorney has already given. Any privileged material that should not
leave legal review.]

ADMINISTRATIVE
[Invoice records, per-diem agreements, any financial matters tied to the
reporting that the editor should know about.]

A NOTE
[Optional. Anything the journalist wants their colleagues to know.]
```

Keep the payload text-first. Attachments (document archives, audio) can be stored separately on encrypted cloud storage; include the link and the decryption key in the payload. Storing the full material directly in the payload is possible up to a few megabytes, but text-plus-references is usually cleaner.

## Who should receive it

Choose **three custodians** as a default:

1. **The editor** responsible for the story. Professional obligation to carry it forward.
2. **The lawyer** reviewing the story. Holds the legal context and the privilege.
3. **A trusted colleague** at the same or a different outlet. Redundancy in case the editor is unavailable.

Choosing more than three recipients is possible but dilutes accountability. Fewer than two is risky — a single-recipient handoff has a single point of failure.

The three should not all be at the same physical location or the same organization, if that can be avoided. If the editor and the lawyer are at the same firm and the firm becomes unreachable, redundancy disappears.

Each custodian needs a Maktub wallet registered to an address only they control. If they use their organization's account, consider whether the organization could be pressured to surrender it. A personal wallet held by the individual is usually safer.

Tell each custodian in advance that they are named. Do not send them the payload. Tell them what it contains in general terms, what you would ask them to do if they receive it, and how to open it.

## Interval choice

Most press-freedom heartbeats use intervals in the range of **1 to 14 days**.

**24 hours.** Aggressive. Appropriate when the journalist is in a fast-moving situation — reporting in a conflict zone, running down a time-sensitive lead, expecting to hear from sources daily. Requires daily check-ins without fail. One missed day triggers delivery.

**72 hours (3 days).** A common default for active reporting. Allows for a weekend without check-in; triggers if the journalist vanishes for the better part of a week.

**7 days.** Slower, safer rhythm. Good for research-phase reporting where the journalist is in their usual environment and a weeklong silence is meaningful.

**14 days.** Appropriate for investigations that are proceeding slowly or for "hold the package" scenarios where the journalist expects to be reachable but wants a quiet backstop.

**Over 14 days:** probably too long to be useful as a press-freedom safeguard.

The journalist can update the interval as the story's posture changes. Short intervals for active reporting, longer intervals during quiet periods. Updating interval or recipients does not leak the payload.

## Operational security

Maktub is one layer of a journalist's operational security. It does not replace the others.

**Device security.** If the journalist's phone or laptop is compromised, the attacker can create, modify, or deactivate heartbeats on the journalist's behalf. Use a strong passcode, encrypted drives, and avoid unattended devices in adversarial environments.

**Wallet custody.** The wallet that controls the heartbeat should be the journalist's, not the newsroom's. Hardware wallets (Ledger, Trezor, GridPlus) are recommended for serious use — they require physical confirmation for each transaction, and a compromised phone cannot forge a check-in.

**Payload encryption.** The protocol encrypts the payload at creation. If the journalist additionally wants a second layer — so that even a compromised recipient cannot read without a shared secret — they can encrypt the payload with age, PGP, or a symmetric passphrase before uploading. The custodians would need the decryption key through another channel. This is belt-and-suspenders; it is not the default.

**Avoiding deanonymization.** Maktub does not give you anonymity, and you should not lean on it for that. The owner and recipient wallet addresses and all timing are public and permanent on-chain — anyone analyzing Base can see that a heartbeat exists, whom it names, and when it was last checked in. Only the payload contents are confidential. Two consequences follow. First, do not assume the link between your wallet and your identity is hidden; if your reporting requires that link to stay secret, that protection must come from your own operational security, not from Maktub. Second, the payload might name sources, and a payload that names sources in the clear is only as safe as the recipients who decrypt it. Think of the payload as a message you are willing to hand to your custodians in a sealed envelope — because that is exactly what it is.

**Duress.** If the journalist is coerced to check in or to deactivate, the protocol has no way to detect it. Some journalists pair a Maktub heartbeat with a "duress signal" — a second heartbeat with a very short interval (e.g., 12 hours) that fires only if the primary heartbeat is deactivated or modified. There is no protocol-level support for this; it is a workflow pattern.

**Time-zone and check-in hygiene.** Your check-in schedule should be predictable to you and not obviously scheduled around known absences (e.g., don't check in every day at 09:00 local if that makes your absence trivially noticeable). The interval creates tolerance for normal life variance; use it.

## Threat model: what this does and does not defend against

**Good at:** ensuring material and instructions reach professional custodians if the journalist disappears for any reason — accident, illness, detention, technical outage, or any circumstance the journalist did not anticipate. The delivery is automatic, unsignalable in advance, and cannot be stopped by any party once the timer expires.

**Partially good at:** discouraging silencing. A party that might otherwise "make the problem go away" knows that silencing the journalist triggers the delivery of the material to custodians they did not choose. This changes the calculus. Maktub does not prevent a bad act; it raises the cost of one.

**Not good at:** stopping the bad act itself. Maktub is not a shield. It cannot intervene in a physical situation. It cannot alert in real time. It cannot force a hostile actor to behave.

**Cannot defend:** against compelled speech (the journalist being forced to check in or deactivate at gunpoint), against adversarial payload contamination at the recipient (a recipient who is themselves compromised), or against the long arm of a jurisdiction that can legally compel the recipient to hand over what they received.

Maktub is a piece of infrastructure, not a guarantee. Use it with open eyes, and layer it with the other precautions the profession already knows.

## Working with a newsroom

For a newsroom that wants to make source protection a systematic part of its workflow, a suggested pattern:

- **Default heartbeat for every investigation.** When a reporter is assigned to a story of consequence, create a heartbeat as part of the onboarding. 3- or 7-day interval. Recipients: editor, lawyer, backup colleague.
- **Dedicated editor wallet.** The editor's Maktub wallet is a professional identity, not a personal one. It should live in a hardware wallet in the newsroom's custody, with clear succession if the editor leaves.
- **Newsroom runbook.** When a custodian receives a delivered heartbeat, what do they do? Who gets called first? How is the material processed, verified, and preserved? Write this down before you need it.
- **Annual audit.** Once a year, review every active heartbeat with every reporter. Is the interval still right? Is the payload current? Are the custodians still appropriate? Is the legal context still right?
- **Legal integration.** The outlet's lawyer should understand that they are a recipient on active heartbeats, and what that means. Delivery to a lawyer's wallet preserves privilege in a way that delivery to a journalist's laptop does not.

## After the story breaks

Once a story has been published and the reporting is no longer sensitive:

- **Deactivate the heartbeat.** There is no reason to keep a live trigger for a completed story. Deactivation is permanent.
- **Or update it toward a longer interval and a lower-stakes payload.** Some journalists keep a heartbeat live for after-publication communications — e.g., "if I become unreachable after publication, here are the outstanding communications with sources and here is what you should do." Interval can expand to 30 days or more.

Do not leave old heartbeats in place out of habit. A heartbeat is a live obligation — every check-in is a commitment. Close what is done.

---

## Related reading

- [Getting Started](./getting-started.md)
- [Safety Guide](./safety-guide.md)
- [How It Works](./how-it-works.md) — the cryptography that makes this content-agnostic
- [FAQ](./faq.md)

