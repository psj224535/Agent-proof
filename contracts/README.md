# AgentProof testnet contracts

The non-upgradeable exchange supports **Ethereum Sepolia (11155111)** and disposable **Anvil (31337)** only. Test tokens have no real-world value. No deployment transaction is sent by building or testing. Merchant and user transactions are prepared for MetaMask; only the separate test Agent executor signs purchases on the server.

## Reproducible build and tests

Prerequisites: Node.js 22.16+, Git, Foundry (`forge`, `anvil`, `cast`). The tested Foundry version is 1.5.1. Install the exact JavaScript dependency versions with `npm ci --prefix integrations`.

```sh
node --experimental-strip-types scripts/contracts-build.ts
forge test --root contracts -v
node --experimental-strip-types scripts/trade-anvil-e2e.ts
node --experimental-strip-types scripts/trade-service-e2e.ts
```

`dependencies.json` pins Solidity **0.8.30**, OpenZeppelin **5.4.0**, and forge-std **1.9.7** to immutable Git revisions. The build script refuses mismatched or dirty dependency checkouts. It writes deployment ABIs and bytecode to ignored `out/deployment-artifacts.json`. Libraries, compiler output, local keys, and test state are not tracked.

The Anvil script creates a temporary node, randomly generated keys, and a deliberately minimal local identity registry fixture. It verifies all five authentication modules, authorization rules, typed-data agreement with Solidity, actual token/budget changes, receipts/events, human approval, replay protection, and audit chains. The fixture is **not** a full or official ERC-8004 registry. No Sepolia funds are used. `trade-service-e2e.ts` additionally exercises real Agent/verifier HTTP handlers, policy and binding transaction confirmation, both ALLOW and ASK purchases, receipt linkage to the original authentication audit, and blocked gas/runtime/card/registration mutations.

## Contracts

- `DemoToken(string demoName,string demoSymbol,address exchange)`: OpenZeppelin ERC-20 with 18 decimals and exactly 1,000,000 tokens minted to the exchange. Pass `Aurora`, `Nova`, or `Orbit`; the contract prepends `AgentProof Demo `. There is no public mint, upgrade, or arbitrary execution function.
- `AgentProofDemoExchange(address initialOwner,address verifier,address identityRegistry)`: owner-managed listings, user-owned ETH budget and policy, single-use EIP-712 purchases. On Sepolia, the constructor accepts only `0x8004A818BFB912233c491871b3d84c89A494BD9e` as registry.
- `IIdentityRegistry.sol`: integration ABI subset, **not** a registry implementation.
- `test/MockIdentityRegistry.sol`: unrestricted setters for isolated automated tests only. Never deploy it as a trusted Sepolia registry.

User `configurePolicy` is bound to `msg.sender`; the Agent cannot configure another user's policy. Every configuration, token permission, pause, or revocation increments `policyVersion`. Cumulative `spentWei` persists when a user reconfigures a policy. Users can withdraw unspent ETH while the exchange is paused. Merchant proceeds are separately accounted and cannot withdraw user budget.

A listing quotes the **whole-token price in wei**; purchase quantity is the ERC-20 base-unit integer. Fractional costs round **up**, preventing free sub-wei purchases. All fees, ETH quantities, and token amounts use integers.

## Typed data and execution binding

EIP-712 domain: `name = AgentProofDemoExchange`, `version = 1`, current chain ID, current exchange address.

```text
ExecutionAuthorization(address registry,uint256 agentId,address agentOwner,address executionWallet,address buyer,address token,uint256 quantity,uint256 maxTotalCostWei,uint256 policyVersion,bytes32 evidenceHash,bytes32 traceId,bytes32 nonce,uint64 issuedAt,uint64 expiresAt)
HumanApproval(bytes32 executionHash)
```

`hashExecution` returns the **full EIP-712 digest**, including domain. `HumanApproval.executionHash` is this digest, not the struct hash. Human approval therefore covers registry, Agent identity/current owner, executor, buyer, token, quantity, maximum cost, policy version, evidence, trace, nonce, and expiry. The contract independently requires the buyer signature whenever the current cost exceeds `autoApproveLimitWei`. The execution nonce makes both approvals one-use. Execution authorizations may live at most 120 seconds.

`agentproof.executionWallet.v1` metadata contains exactly `abi.encode(address)` (32 bytes, twelve zero bytes then the twenty address bytes). This is a separate AgentProof extension and does not overwrite `agentproof.runtimeBinding.v1`. For example:

```text
address: 0x1234567890123456789012345678901234567890
bytes:   0x0000000000000000000000001234567890123456789012345678901234567890
```

The contract re-reads `ownerOf` and the metadata during every purchase. It rejects noncanonical metadata, even when its final twenty bytes contain the expected address. JS/Solidity agreement is checked by Anvil and unit tests.

## Security boundaries

The verifier signature attests that off-chain authentication was `VERIFIED` and deterministic authorization was `ALLOW`. The contract cannot inspect those off-chain documents; it trusts the configured verifier to issue only valid approvals. It independently enforces caller, current identity owner/executor binding, policy version/state/expiry, allowed token, inventory, maximum/per-trade/total budget, deposit, expiry, nonce, and buyer approval threshold. Rotation of `trustedVerifier` immediately invalidates signatures from the old key.

Checks-Effects-Interactions, OpenZeppelin `ReentrancyGuard`, and `SafeERC20` protect transfers. Owner permission covers listing changes, pause, verifier rotation, and merchant revenue withdrawal. No generic address/calldata executor exists.

The deployment owner and verifier remain trusted development roles. Listing metadata and `demoScore` are synthetic. Production would need separate security review, audited deployment/source verification, issuer governance, KMS/HSM keys, process isolation, RPC trust/reorg policy, and audit retention. Test token contracts are fixed supply; changing the price or verifier is an owner transaction. Contract deployment is **not** source verification.

## Sepolia source verification

The constructor arguments are visible in each prepared deployment transaction. After MetaMask deployment, source verification must be run and checked separately:

```sh
forge verify-contract --root contracts --chain sepolia --watch \
  --constructor-args "$(cast abi-encode 'constructor(address,address,address)' MERCHANT VERIFIER 0x8004A818BFB912233c491871b3d84c89A494BD9e)" \
  EXCHANGE src/AgentProofDemoExchange.sol --etherscan-api-key "$ETHERSCAN_API_KEY"

forge verify-contract --root contracts --chain sepolia --watch \
  --constructor-args "$(cast abi-encode 'constructor(string,string,address)' Nova dNOVA EXCHANGE)" \
  TOKEN src/DemoToken.sol --etherscan-api-key "$ETHERSCAN_API_KEY"
```

Replace uppercase placeholders with the actual public addresses; repeat token verification for Aurora/dAUR and Orbit/dORB. No source verification was performed by automated local tests. Official library references: [OpenZeppelin EIP-712](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography#EIP712), [OpenZeppelin utilities](https://docs.openzeppelin.com/contracts/5.x/api/utils).
