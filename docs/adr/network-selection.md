# ADR-001: explicit simulation first
Status: accepted for this delivered development demo only.

No source repository, Docker, Anvil, Foundry or PostgreSQL executable was available; NPM registry DNS also failed. Instead of claiming a working real chain, provide a dependency-free testable simulation and label every result DEVELOPMENT_MINIMAL. Mainnet and real funds remain disallowed. The optional Sepolia script is read-only and requires a user-configured RPC. This choice does **not** satisfy the requested Anvil/Sepolia acceptance conditions.

Future gate: review/pin the official reference commit, deploy and test on Anvil, replace synthetic owner registration with Ethereum owner signing, record a Sepolia read or transaction and independently verify code hashes. Never turn off the simulation label merely because the registry filter is enabled.
