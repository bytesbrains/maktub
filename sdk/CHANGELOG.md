# Changelog

## 0.1.0-dev.2

- Rebuilt the bundled **Veil** warden wasm with remapped build paths, so the
  binary no longer embeds absolute local source paths in its debug strings. No
  API or behavior change; crypto output is identical (cross-language vectors
  unchanged).

## 0.1.0-dev.1

- First public **pre-release** of `@bytesbrains/maktub-sdk` (published under the
  `dev` dist-tag). Typed TypeScript API over Maktub Protocol v3 on Base L2:
  `MaktubClient` (heartbeat / recipient / executor / token / governance / flash
  ops), contract wrappers + ABIs + generated addresses, ECIES crypto, reading-key
  derivation (pinned cross-language vectors), and the **Veil** PREVIEW
  conditional-decryption layer (bundled warden wasm).
- Experimental: targets the Base Sepolia testnet deployment; pre-mainnet.
