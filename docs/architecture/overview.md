# Architecture
The Agent is untrusted. The verifier obtains registry snapshots from a separate service, registration and Agent Card bytes from the anchored URI, and company status from an administrator-pinned issuer. Possession of an ID/card alone cannot yield a ticket: the runtime key is independently anchored and the live request must be signed.

Local process flow:
```
Browser :3000 -> agent-service -> registry :3002
                            -> issuer :3003
                            -> verifier :3001 -> registry, card, issuer status
Browser :3001 -> admin-protected traces / module configuration
verifier -> its own persistent replay, evidence, audit, tickets database
```
The agent never receives the verifier's signing key, token, database URL or trust-management API. The launcher is a trusted local administrator and bootstraps issuer **public** trust; the Agent cannot register an issuer in the trust store.

The module core depends on `RegistryReader`, `Fetcher`, `Store`, configuration and trust interfaces, not on DOM or HTTP framework. Current modules still rely on shared context/store abstractions; they are not separately published pnpm packages. The filesystem layout is monorepo-style, but the root is the only runnable package.

Runtime crypto is Node Ed25519. The simulator's owner key/address is an explicitly synthetic test identity, NOT an Ethereum EOA. The separate Sepolia mode uses the adapter's actual `ownerOf` and MetaMask wallet approvals.

Sepolia mode is a separate flow: the local console prepares `register(string)` and `setMetadata(uint256,string,bytes)` calldata, MetaMask signs as the configured EOA, the backend validates the confirmed transaction and event, and the verifier independently reads a code-hash-pinned registry block plus public GitHub Pages documents. The local Ed25519 runtime key proves live Agent requests; it is linked to the Ethereum owner through the on-chain binding hash and is never treated as the wallet key.

Security boundary limitation: independent processes/directories are not OS isolation when running as the same Unix user. A real deployment needs separate UIDs/containers and role-specific read-only secrets/mounts. This archive does not claim to provide that hardened deployment.
