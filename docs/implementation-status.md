# Completion status against the supplied specification

| Acceptance item | Status in this archive |
|---|---|
| 1. Independent Agent/System apps | Implemented, four local processes; no hard same-UID filesystem isolation |
| 2. Register on local Anvil | **Not implemented/executed**; simulator does not count |
| 3. Chosen testnet demonstration | Sepolia integration, MetaMask write flow, pinned real-chain reader, Pages documents and UI implemented; read-only live startup executed. Owner must still approve the two write transactions |
| 4. Submit card/passport bundle | Implemented and tested |
| 5. Refetch official card | Implemented for both simulator and Sepolia: verifier reads `agentURI` on-chain, then refetches registration and A2A card over public HTTPS |
| 6. Compare hashes | Implemented and tested |
| 7. Passport signature, expiry, challenge | Implemented for selected draft/profile and tested |
| 8. Optional company proof | Implemented with clearly marked local test issuer; no real KYC |
| 9. TAP-compatible request signature | Strict RFC9421-based local profile implemented; not full Visa interoperability |
| 10. Filter toggles | Implemented, admin-only, versioned configuration |
| 11. Assurance changes | policyProfile reflects configuration; development assurance never falsely upgrades |
| 12. Deterministic verdict logic | Implemented/tested under controlled clock/data; live sources naturally change |
| 13. Tickets only for VERIFIED | Implemented with evidence expiry, one-use proof binding |
| 14. UI filter flow | Simulator UI plus Sepolia registration console and environment-aware verifier dashboard implemented; automated browser control was unavailable |
| 15. Attack scenario buttons | 13 buttons implemented; corresponding real HTTP scenarios exercised |
| 16. Audit timeline | Implemented, authenticated viewer, local hash/evidence integrity checks |
| 17. Required automated tests | 49 core/security/Sepolia calldata tests pass; live read-only Sepolia startup also passes; write transaction and PostgreSQL conformance still pending |
| 18. Reproduce from README | Local no-install startup and HTTP flow tested; foreign-machine reproduction not executed |

Additional requested stack gaps: no Next.js, Fastify/Nest, Zod, Prisma/Drizzle or Vitest. Native Node HTTP/TS, app-owned restricted JSON Schema validator, SQLite and node:test were used. pnpm workspace layout is provided, but modules do not each have independently published package manifests. Docker/Foundry/reference implementation deployment is a follow-on integration, not a delivered tested component.

This is useful working code and a local authentication demonstration, **not a statement that all requested MVP completion conditions have been achieved**.
