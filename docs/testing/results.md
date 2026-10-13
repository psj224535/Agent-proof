# Verified execution results — 2026-10-13

## Executed

| Check | Result | Boundary |
|---|---|---|
| `npm test` | **46 passed, 0 failed** | Deterministic local fixtures, Ed25519 crypto, persistent SQLite replay and concurrent requests; not actual-chain integration |
| `npm run test:e2e` | **20 checks passed** | Real HTTP to four separate running local processes; registry and issuer remain test simulations |
| TypeScript strict no-emit check | **Passed** | Installed TypeScript 5.8.3 / Node types 25.1.0; runtime tested on Node 22.16.0 |
| Offline browser UI smoke | **Passed** | All browser networking blocked; recorded synthetic fixtures render Agent setup/result, five filters, dashboard/detail/modules, mobile widths; no JavaScript page errors |
| Screenshot review | **Reviewed** | Agent setup and verifier overview; images clearly carry DEVELOPMENT SIMULATION labels |

Unit/security log, HTTP log and offline-UI log are stored alongside this file. Test case names are in `docs/demo/scenarios.md`. Tests 45–46 additionally prevent simulation or test company evidence being used to issue a production-assurance ticket.

## Not passed / not executed

- Live Playwright browser E2E could not reach localhost: Chromium returned `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The offline UI run is **not** counted as a live browser E2E pass.
- Anvil/Foundry/reference deployment and Sepolia RPC/transactions were not run.
- PostgreSQL adapter was not connected/tested. Docker was not available.
- NPM registry resolution failed (`EAI_AGAIN`); optional dependency installation, complete transitive lockfiles and security audit were not executed.
- Full A2A, APS, RFC9421 or Visa test-vector interoperability is not established by the app's tests.
- The Solidity interface is an integration aid, not a tested deployed contract.

## Reproduction

```sh
npm test
npm start
# Separate terminal:
npm run test:e2e
```

To rerun the optional offline UI smoke with Python Playwright and an installed Chromium:
```sh
CHROMIUM_PATH=/path/to/chromium python scripts/offline-ui-smoke.py
```
It records fresh *local synthetic* HTTP fixtures first, then disables all browser networking and exercises only UI rendering. Screenshots must not be described as proof of a live wallet, real chain, KYC or production deployment.

For a live browser test on an environment that allows local browser access:
```sh
CHROMIUM_PATH=/path/to/chromium python scripts/browser-smoke.py
```
That command still needs independent execution; no pass is claimed here.
