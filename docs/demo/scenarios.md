# Scenarios and tests

The Agent portal has 13 visible scenarios: normal, unregistered, cloned-id, changed-card, stale-card, forged-passport, expired-passport, wrong-key, revoked-company, wrong-merchant, changed-payload, replay and ownership-transfer. Each creates fresh local evidence, without changing verifier policy.

With default settings normal is VERIFIED (DEVELOPMENT_MINIMAL); each attack is REJECT. This does not imply a real-chain attack was tested. The UI stale-card case changes the presented expiry and fails the card-hash comparison; core test 14 independently tests expiration of the official card itself.

Tests 01–27 cover the intent of the supplied mandatory scenarios using simulated independent sources, and 28–46 add security/regression cases. Each test asserts its relevant reason, status or policy; it is not a full cartesian conformance test of every field/profile.

- 01 all five filters PASS and development assurance cannot masquerade as full
- 02 APS disabled selects WEB3_AGENT_V1, not FULL
- 03 optional company module with valid evidence
- 04 valid one-time, proof-of-possession ticket grants mock access only
- 05 optional company source outage gives PARTIAL
- 06 enabled optional APS missing gives PARTIAL
- 07 A2A endpoint outage is ERROR/PARTIAL, not forgery
- 08 unrecognized reduced profile is PARTIAL
- 09 unregistered agent
- 10 copied documents and ID do not prove private-key possession
- 11 current on-chain owner must match card binding
- 12 presented card differs from independently fetched card
- 13 presented endpoint substitution
- 14 expired official Agent Card is stale
- 15 forged passport signature
- 16 expired passport
- 17 passport agent ID mismatch
- 18 wrong challenge-response signature
- 19 revoked company evidence
- 20 independently valid passport for a different runtime key
- 21 forged TAP signature
- 22 merchant confusion
- 23 actual request path differs
- 24 expired TAP request
- 25 nonce and challenge replay rejected
- 26 payload changed after HTTP signature
- 27 ownership transfer invalidates previous key and ticket
- 28 concurrent replay has exactly one success
- 29 audit hash chain and evidence integrity; raw tickets not persisted in trace
- 30 request cannot disable server-side filters
- 31 stolen ticket without runtime key cannot be redeemed
- 32 ticket cannot authorize a different product or amount
- 33 configuration change requires fresh authentication
- 34 failFast stops dependents, continueAll preserves all results
- 35 RPC outage cannot issue a ticket
- 36 explicit optional-module forgery remains REJECT
- 37 rejects duplicate and escaped-duplicate JSON keys
- 38 rejects lone surrogates, invalid UTF-8 and unsafe integers
- 39 canonical order and negative zero
- 40 private, metadata, mapped IPv6 and reserved targets blocked
- 41 unsafe URI schemes and localhost blocked before connection
- 42 durable nonce survives reopening SQLite
- 43 rejects extra signature components and duplicate parameters
- 44 Ed25519 rejects wrong keys
- 45 simulated registry cannot issue a production assurance ticket
- 46 test company issuer cannot issue a production assurance ticket

## Run order
`npm test` uses isolated fixtures. `npm run test:e2e` requires four running local servers, checks 13 scenario calls plus seven HTTP/admin controls, and changes local test state. The optional browser smoke script is separate and was not successfully run against localhost in this environment.
