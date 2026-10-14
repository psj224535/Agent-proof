# ADR-001: explicit simulation first
Status: superseded for the new Sepolia path; retained for the default local simulator.

No source repository, Docker, Anvil, Foundry or PostgreSQL executable was available; NPM registry DNS also failed. Instead of claiming a working real chain, provide a dependency-free testable simulation and label every result DEVELOPMENT_MINIMAL. Mainnet and real funds remain disallowed. The optional Sepolia script is read-only and requires a user-configured RPC. This choice does **not** satisfy the requested Anvil/Sepolia acceptance conditions.

Future gate: review/pin the official reference commit, deploy and test on Anvil, replace synthetic owner registration with Ethereum owner signing, record a Sepolia read or transaction and independently verify code hashes. Never turn off the simulation label merely because the registry filter is enabled.

Update 2026-10-14: the separate `start:sepolia` mode now pins the official Sepolia registry, its EIP-1967 implementation and both bytecode hashes, prepares exact zero-value calldata, requires MetaMask owner signing, publishes HTTPS discovery documents, and labels assurance `SEPOLIA_TESTNET`. The default `npm start` path remains the dependency-free `DEVELOPMENT_MINIMAL` simulator. Anvil remains unimplemented, and no Sepolia write is claimed until the owner approves it in MetaMask.
