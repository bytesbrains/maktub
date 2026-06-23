---
name: Protocol proposal
about: Propose a change to protocol behavior, or a new immutable contract
title: "[proposal] "
labels: proposal
---

<!-- The core contracts are immutable. Behavior changes ship as NEW immutable
     deployments, evaluated against docs/developer/protocol-family.md §9. This
     issue is where that discussion happens — BEFORE any PR. -->

**The problem**
What's missing or wrong with the protocol as deployed?

**Proposed change**
What behavior would the new deployment have?

**Why a new deployment, not an edit?**
Confirm you understand the immutable-core constraint: no admin, no proxy, no
upgrade, no governance over the core. A live contract's behavior cannot change.

**§9 new-citizen gate**
How does this fit the criteria in
[`docs/developer/protocol-family.md`](../../docs/developer/protocol-family.md) §9
(single primitive, immutable, no governance surface, …)?

**Migration**
How would existing users opt in? (Old contracts run forever.)
