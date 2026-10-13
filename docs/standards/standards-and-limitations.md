# Standards, versions, limitations
Reviewed against primary sources on 2026-10-13. Mutable pages are background references, not a claim that the archive vendors the entire standards corpus.

| Component | Selected interpretation | Implemented boundary |
|---|---|---|
| ERC-8004 | Draft, current identity-registry interface | Simulator plus optional unexecuted read adapter; no official reference deployment or pinned source commit |
| A2A | Public industry protocol v1.0 shape | Strict app subset, not full protocol client/server or certification |
| APS | Individual Internet-Draft `draft-pidlisnyi-aps-03`; passport record version 2.0 | Passport/signature and did:key only; not IETF-approved standard and not full APS |
| Visa TAP | Developing provider protocol based on HTTP Message Signatures | `TAP-compatible simulation`, not provider onboarding or Visa certification |
| RFC 9421 | HTTP Message Signatures | One strict Ed25519 component/parameter profile; not all valid RFC9421 encodings |
| RFC 9530 / 8785 | Content-Digest / JSON canonicalization | SHA-256 body digest; canonical restricted I-JSON with rejection of unsupported values |

A2A `extensions` are under `capabilities.extensions`. `programVersion`, `runtimeKeyId`, expiry/owner linkage etc. are params of the **AgentProof extension**, not newly invented standard card fields. A2A transport security descriptions do not themselves certify a runtime public key.

APS identity is distinct from an ERC-8004 numeric identity. Passport ID and self-signature use the selected draft's domain-separation tags `APS-PASSPORT-ID-V2` / `APS-PASSPORT-SIG-V2`, NUL separator and canonical bytes. Self-asserted capabilities are not tested functions. A copied valid self-signed passport is not current proof of possession; the stored one-time challenge and live request signature are additional controls. There is no legal-company proof without the separately trusted company issuer.

TAP-profile covered components: @method, @authority, @path, content-digest. Created/expires/nonce/keyid/alg/tag are signed signature parameters. Redemption additionally covers authorization. Query strings are rejected rather than pretending @path covers them. Only exact parameter/component order and one signature label are accepted; standard-valid alternate profiles may be rejected. Neither the card security label nor this signature parser means Visa recognizes the Agent.

The demo company issuer is not KYC, a company registry, a legal-responsibility determination or compliance certification. There is no Visa payment/card processing. Capabilities, ownership and identity do not prove that a user authorized a purchase; authorization is a separate unimplemented interface.

## Primary sources
- ERC-8004 specification: https://eips.ethereum.org/EIPS/eip-8004
- Reference contracts/deployment list: https://github.com/erc-8004/erc-8004-contracts
- A2A protocol: https://a2a-protocol.org/latest/specification/
- APS selected draft: https://www.ietf.org/archive/id/draft-pidlisnyi-aps-03.html
- Visa TAP official repository: https://github.com/visa/trusted-agent-protocol
- HTTP signatures: https://www.rfc-editor.org/rfc/rfc9421.html
- Content-Digest: https://www.rfc-editor.org/rfc/rfc9530.html
- JCS: https://www.rfc-editor.org/rfc/rfc8785.html
- Optional viem selection: https://github.com/wevm/viem/tree/viem%402.31.4
- Optional PostgreSQL client selection: https://github.com/brianc/node-postgres/tree/pg%408.16.0

NPM registry access failed in this environment. Exact direct versions are selected for optional integrations, but no downloaded dependency lock/conformance suite or vulnerability audit was completed. Node22.16/TS5.8.3 are test-environment versions, not latest/safest-version recommendations.
