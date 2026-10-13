# Chain integration status — incomplete, not executed
The runnable UI uses `services/registry-simulator`, not a smart contract. It must not be presented as an Anvil or ERC-8004 deployment. `src/IIdentityRegistry.sol` is an ABI subset only; it is not ERC-721-complete and is not deployable.

The optional `packages/erc8004-filter/viem-reader.ts` reads a reviewed ERC-8004 deployment at one block, checks both proxy/implementation code hashes, and reads owner, wallet, URI, and owner-managed metadata. The metadata key `agentproof.runtimeBinding.v1` and its 32-byte SHA-256 value are **AgentProof extensions**, not mandatory ERC-8004 fields.

Before a real-chain demonstration:
1. Select a commit of the official reference repository, verify its deployment/upgrade procedure, pin that exact commit and dependencies, and save bytecode hashes. No reference commit is pinned in this delivery.
2. Deploy that reviewed version on Anvil. Do not assume that calling an upgrade initializer on a fresh proxy works.
3. Replace the simulator registration path and simulated owner key with Ethereum wallet registration; publish documents for the returned ID and set the binding metadata from the current owner.
4. Wire the on-chain reader into a separate test-chain service configuration, run ownership transfer and concurrent verification tests, and record a real receipt/block.
5. Repeat read-only inspection or registration on Sepolia using test ETH. Mainnet is deliberately unsupported.

The README address candidate from the reference repository is `0x8004A818BFB912233c491871b3d84c89A494BD9e` on chain `11155111`. It was checked against published documentation, not through a live RPC in this environment. `npm run check:sepolia` does the latter with your RPC; it does not register an agent or prove the deployment source is authentic.

Reference: https://github.com/erc-8004/erc-8004-contracts
