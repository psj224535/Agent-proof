# Optional integrations — not validated against external services
The offline demo has no NPM runtime dependencies. Install these optional packages only for PostgreSQL or on-chain adapter work:

```sh
npm install --prefix integrations
```

`pg` 8.16.0 and `viem` 2.31.4 are exact direct-dependency selections, not claims to be latest or security-audited releases. Their transitive dependency lockfiles could not be generated because the package registry was unreachable. Review dependencies and commit the resulting lockfile before integration or deployment.

PostgreSQL: configure `DATABASE_URL` for the verifier; the registry/test issuer remain separate SQLite stores. `openPostgres` has not been run against PostgreSQL here, and there is no Prisma/Drizzle migration tool in this version.

Sepolia read-only inspection:
```sh
SEPOLIA_RPC_URL='https://YOUR_TEST_RPC' npm run check:sepolia
```

The UI does not switch to Anvil/Sepolia by installing these packages. Follow `contracts/README.md`; the wallet button only connects an address and never sends a blockchain transaction.
