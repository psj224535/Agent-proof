# Verified execution results — updated 2026-10-14

## Executed

| Check | Result | Boundary |
|---|---|---|
| `npm test` | **51 passed, 0 failed** | Existing deterministic security suite plus exact Sepolia calldata, public-document schema and multi-Agent catalog integrity tests |
| `npm run test:e2e` | **20 checks passed** | Real HTTP to four separate running local processes; registry and issuer remain test simulations |
| TypeScript strict no-emit check | **Passed** | Installed TypeScript 5.8.3 / Node types 25.1.0; runtime tested on Node 22.16.0 |
| Offline browser UI smoke | **Passed** | All browser networking blocked; recorded synthetic fixtures render Agent setup/result, five filters, dashboard/detail/modules, mobile widths; no JavaScript page errors |
| Screenshot review | **Reviewed** | Agent setup and verifier overview; images clearly carry DEVELOPMENT SIMULATION labels |
| Sepolia live startup | **Passed (read-only)** | Chain ID, official proxy bytecode hash, EIP-1967 implementation and implementation bytecode hash independently read at block 11912700 |
| Sepolia register estimate | **Passed (read-only)** | Owner balance 0.01 Sepolia ETH; zero-value `register(string)` estimated at 833625 gas; no transaction sent |
| Integration dependency audit | **0 known vulnerabilities** | `viem` 2.57.6 and locked transitive dependencies checked with npm audit |

Unit/security log, HTTP log and offline-UI log are stored alongside this file. Test case names are in `docs/demo/scenarios.md`. Tests 45–46 additionally prevent simulation or test company evidence being used to issue a production-assurance ticket; tests 50–51 validate unique catalog identities and keep the PM card synchronized with its ERC-8004 registration document.

## Not passed / not executed

- Live Playwright browser E2E could not reach localhost: Chromium returned `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The offline UI run is **not** counted as a live browser E2E pass.
- Anvil/Foundry deployment was not run. Sepolia reads and gas estimation passed, but write transactions still require owner approval in MetaMask.
- PostgreSQL adapter was not connected/tested. Docker was not available.
- Optional dependencies and lockfiles are installed; the current audit is clean.
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
