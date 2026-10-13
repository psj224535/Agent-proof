# Sequential pipeline and decisions
1. ERC8004 checks the configured chain/registry, nonzero current owner and off-chain active registration, capturing the observed block/source.
2. A2A fetches the registry-linked URL independently. It compares canonical card hashes; binds Agent ID, current owner, endpoint, version, expiration and runtime DID/key to anchored metadata; checks a supported optional JWS.
3. APS verifies the selected draft's passport ID/signature and current key, then a server-stored challenge bound to audience, operation, identity, request ID and bundle hash.
4. Company verifies a trust-store issuer and cross-document attributes, then independently fetches a fresh signed status tied to the attestation hash.
5. TAP verifies actual HTTP method/authority/path/body digest and signature parameters, runtime key and durable nonce uniqueness.
6. Aggregator rejects explicit contradictions and forged evidence; partial availability never automatically gets a ticket.

Each module has enabled/required/dependencies/timeout and a version. Disabled is SKIP, never PASS. `continueAll` preserves failures but skips unresolved dependencies; `failFast` skips remaining work after a required FAIL. Timed-out modules have an isolated context so late results cannot change accepted state.

Policy ambiguity resolved: a recognized reduced profile (e.g. WEB3_AGENT_V1) may be VERIFIED within that profile, rather than every disabled optional module forcing PARTIAL. An enabled optional module with missing/unavailable evidence yields PARTIAL; an explicit FAIL remains REJECT even when optional. A custom combination without sufficient required request authentication is PARTIAL. This distinguishes specification tests 2/3 from tests 5/6/8 without incorrectly calling reduced evidence FULL_AUTH_V1.

In this delivery the outer assurance profile is always DEVELOPMENT_MINIMAL. `policyProfile` is FULL_AUTH_V1 / WEB3_AGENT_V1 / EXPERIMENTAL_APS_V1 / CUSTOM_REDUCED. Enabling all simulated filters is not production assurance. Nondevelopment core execution explicitly rejects simulated registry or test-company proof before issuing a ticket.

Disabling ERC requires an administrator-pinned independent identity anchor to resolve the card/key. There is no trust-on-first-use from the request's own card or passport. The local UI does not automatically provision such anchors.
