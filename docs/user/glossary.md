# Glossary

Plain-language definitions for every technical term that appears in the Maktub documentation. If a term appears in our docs and is not here, please open an issue.

---

**Account abstraction.** A way of managing a crypto account that does not require the user to handle a seed phrase directly. Sign-in is usually via email, passkey, or social login; the wallet is provisioned and secured behind the scenes. Most "email login" wallets in the Maktub app use account abstraction.

**Address.** A string like `0x742d35Cc6634C0532925a3b844Bc9e7595f0fA3c` that identifies a wallet on the Ethereum/Base network. Your address is your public identity on the protocol. It is safe to share.

**Arweave.** A blockchain-based data storage network designed for permanent storage. Users pay once to store data that is expected to persist for 200 years or more. Maktub pins encrypted payloads to Arweave for permanence.

**Audit.** A security review performed by a professional firm on smart contract code to look for vulnerabilities, bugs, and economic attack vectors. Maktub's core contracts are undergoing audit as of April 2026.

**Base.** A Layer 2 rollup operated by Coinbase, built on the OP Stack, settling to Ethereum mainnet. Fast (2-second blocks) and cheap (very low fees), which is why Maktub runs there.

**Block.** A batch of transactions that is recorded to the chain together. Base produces a new block every 2 seconds.

**Block timestamp.** The time that a block was produced, recorded as seconds since January 1, 1970 UTC. Maktub timers are measured against block timestamps.

**BSL (Business Source License).** A license that permits most use but restricts commercial competition for a limited period. Maktub's reference web app is BSL-licensed, converting to MIT two years after deployment.

**CID (Content Identifier).** The hash used to address content on IPFS. A CID uniquely identifies a blob of data; given a CID, any IPFS node can serve the data. Maktub stores payload CIDs on-chain as pointers to the encrypted payload.

**Check-in.** The action of calling `checkIn` on a heartbeat to reset its timer. Free (only gas). Required before the timer expires, or the heartbeat becomes executable.

**Ciphertext.** Encrypted data. The payload you upload is ciphertext — unreadable without the appropriate decryption key.

**Contract.** Short for smart contract. A piece of code deployed to a blockchain that runs according to its own rules and cannot be modified after deployment (unless the contract itself was designed to be upgradable).

**Creation fee.** The protocol fee charged when a new heartbeat is created. A small one-time amount, denominated in ETH on Base.

**Deactivate.** To permanently turn off a heartbeat. A deactivated heartbeat cannot fire, cannot be modified, and cannot be reactivated. Only the owner can deactivate.

**Decentralized.** A system where no single party can unilaterally change behavior or shut it down. Maktub's core contracts are decentralized in this sense.

**Delegate.** In governance, assigning your voting power to another address. Required to vote in MKTB governance, even if you delegate to yourself.

**Dead-man's switch.** A term people often search for: a mechanism that triggers when a person stops providing a required signal. Maktub is best understood as a **silence-triggered** (or absence-triggered) sealed delivery — it delivers a message you sealed to the recipients you chose if you go quiet. The "switch" framing centers the person; Maktub centers the sealed letter and its inevitable delivery.

**ECIES (Elliptic Curve Integrated Encryption Scheme).** The encryption Maktub uses, on the secp256k1 curve. Your device encrypts the payload once and wraps the content key separately for each recipient using the public key they registered, so only a named recipient's private key can open it. All of this happens in the app on your own device — there is no external re-encryption network.

**ERC-20.** The standard for fungible tokens on Ethereum. MKTB is ERC-20 plus ERC-20 Votes.

**ERC-20 Votes.** An extension of ERC-20 that adds vote delegation and historical checkpoints. Required for on-chain governance.

**Ethereum.** The smart-contract blockchain that Base settles to. The underlying security layer for the protocol.

**Executor.** A node operator who watches the chain for expired heartbeats and triggers their execution. Executors stake MKTB and earn MKTB rewards. See [Running an Executor Node](../executor/running-a-node.md).

**Execution.** The act of triggering a heartbeat's delivery after its timer has expired. Calling `execute(id)` on MaktubCore.

**Gas.** The fee paid to the network to execute a transaction. Denominated in ETH. On Base, typically a negligible amount.

**Governance.** The system by which MKTB holders vote on protocol parameters and treasury spending. See [Governance Overview](../governance/overview.md).

**Hardware wallet.** A physical device (e.g., Ledger, Trezor) that holds a wallet's private key and requires physical confirmation to sign transactions. More secure than a software wallet for high-stakes use.

**Heartbeat.** The protocol's single primitive: a combination of recipients, encrypted payload, and a timer. If the owner does not check in within the interval, the heartbeat becomes executable.

**IPFS (InterPlanetary File System).** A peer-to-peer, content-addressed storage network. Maktub stores encrypted payloads on IPFS.

**Immutable.** Describes code or data that cannot be changed after it is set. Maktub's core contracts are immutable.

**Interval.** The maximum time between check-ins. Minimum 1 hour, maximum 365 days.

**L1 / L2 / L3.** Layer 1 is the base blockchain (Ethereum). Layer 2 is a scalability layer built on top (Base). Layer 3 is a further scaling layer possibly built on an L2. Maktub currently runs on L2.

**MKTB.** The governance token of the Maktub Protocol. Standard: ERC-20 + Votes. Max supply: 100,000,000. Used for executor staking and governance voting.

**Maktub.** Arabic for "it is written." The name of the protocol and the governance token (MKTB).

**MaktubCore.** The immutable core contract that implements heartbeat CRUD, timer, and execution logic.

**MIT license.** A permissive open-source license. Allows commercial use, modification, and redistribution with attribution. The smart contracts and SDK are MIT-licensed.

**Mempool.** A queue of pending transactions waiting to be included in a block.

**Multisig.** A wallet that requires multiple signatures to approve a transaction. For example, a "2-of-3" multisig requires two out of three designated signers.

**Off-chain.** Data or computation that does not happen on the blockchain. Maktub's encrypted payloads are stored off-chain (on IPFS/Arweave) with only a pointer on-chain.

**On-chain.** Data or computation that happens on the blockchain. Maktub's heartbeat metadata, recipient registry, and token balances are on-chain.

**Owner (of a heartbeat).** The wallet address that created a heartbeat. Only the owner can check in, update, or deactivate it.

**Payload.** The encrypted content of a heartbeat. The thing that will be delivered if the timer expires. The protocol never sees the plaintext.

**Private key.** The secret key that controls a wallet. Keep this private. Never share it. Losing it means losing the wallet.

**Public key.** The non-secret counterpart to a private key. Safe to share. Others use your public key to encrypt messages only you can decrypt.

**Quorum.** The minimum participation required for a governance vote to count. Maktub's governance uses a 4% quorum of total MKTB supply.

**Recipient.** A person who will receive a heartbeat payload if the timer expires. Identified by wallet address. Must be registered in the Recipient Registry.

**Recipient Registry.** An immutable contract that stores recipient addresses and their ECIES public keys. (The on-chain field is named `prePublicKey` for historical reasons but holds an ECIES key.) A heartbeat cannot name an unregistered recipient.

**Relay.** A lightweight on-chain role that can distribute executor rewards when an execution occurs. Often a role held by MaktubCore itself.

**Rollup.** A Layer 2 scaling solution that bundles many transactions off-chain and settles them as a single proof to L1. Base is an optimistic rollup.

**Seed phrase.** A sequence of 12 or 24 words that represents a wallet's private key in human-writable form. Anyone with the seed phrase controls the wallet.

**Sequencer.** The node operator that orders transactions on a Layer 2 rollup. Base's sequencer is operated by Coinbase; it is a single point of failure with an L1 fallback mechanism.

**Signer.** In ethers/web3 terminology, an object that can sign transactions on behalf of a wallet.

**Slash / slashing.** In some staking systems, confiscating a portion of a participant's stake as a penalty for misbehavior. Maktub's ExecutorRewards has a slash function callable only by governance.

**Smart contract.** A piece of code deployed to a blockchain that runs automatically when called. Maktub's five core contracts are smart contracts.

**Stake.** To lock up tokens as a commitment. Maktub executors stake MKTB to participate in the executor network.

**Timelock.** A governance mechanism that enforces a delay between a successful proposal vote and its execution. Gives the community time to react if a proposal turns out to be malicious.

**Timer.** The countdown in a heartbeat. Equal to the interval. Starts over each check-in.

**Transaction.** An on-chain action signed by a wallet. Every check-in, creation, and execution is a transaction.

**Treasury.** The community-governed pool of MKTB (25% of total supply) that can fund development, grants, and operational expenses according to governance proposals.

**TVL (Total Value Locked).** A common DeFi metric. Not particularly applicable to Maktub because Maktub does not custody assets.

**Veil.** Maktub's optional time-lock. On top of the always-on ECIES encryption, Veil wraps the letter in a gate that the in-house Warden federation withholds until the heartbeat executes on-chain — so until then, even the recipient cannot read it. Veil is a **preview** today (the federation is operator-run on the testnet), so its timing is not yet a guarantee. Plain confidentiality holds with or without Veil.

**Vesting.** A schedule by which tokens become available over time. Team MKTB allocation vests over 4 years with a 1-year cliff.

**Wallet.** A piece of software (or hardware) that holds your private key and signs transactions on your behalf.

**Warden.** The in-house threshold federation that powers the optional Veil time-lock. It withholds a letter's decryption gate until the on-chain delivery condition (the heartbeat's execution) is met. On the current testnet it is operator-run, which is why Veil is a preview. Ships as `warden_ffi` (pub.dev) and the `bytesbrains/warden` node image (Docker Hub).

**Web3.** A loose term for applications that use blockchain-based identity and transactions. Maktub is Web3 in that sense, though we prefer to describe it as "protocol infrastructure."

**Zero-knowledge proof.** A cryptographic proof that you know something without revealing what you know. Not currently used by Maktub, but an area of future research.

