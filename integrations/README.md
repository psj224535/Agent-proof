# Optional integrations
The offline demo has no NPM runtime dependencies. Install these optional packages only for PostgreSQL or on-chain adapter work:

```sh
npm install --prefix integrations
```

`pg` 8.16.0 and `viem` 2.57.6 are exact direct-dependency selections. The lockfile is committed. `npm audit --prefix integrations` reported zero known vulnerabilities on 2026-10-14.

PostgreSQL: configure `DATABASE_URL` for the verifier; the registry/test issuer remain separate SQLite stores. `openPostgres` has not been run against PostgreSQL here, and there is no Prisma/Drizzle migration tool in this version.

Sepolia read-only deployment inspection:
```sh
SEPOLIA_RPC_URL='https://YOUR_TEST_RPC' npm run check:sepolia
```

Real Sepolia mode:

```sh
npm run start:sepolia
```

This starts the MetaMask transaction console and the independent on-chain verifier. See `docs/sepolia-runbook.md`. The local simulator remains the default `npm start` command.
