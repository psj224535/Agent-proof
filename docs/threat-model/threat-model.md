# Threat model
## Assets / attackers
Protect the runtime identity binding, issuer/verifier private keys, administrator configuration, single-use challenges/nonces/tickets, evidence and trace integrity. Assume a remote Agent can forge every submitted JSON field, copy public documents, mutate headers/payloads, race requests and host malicious endpoints. Do not trust the Agent's own public key as an independent identity anchor.

## Implemented controls
- Registry/issuer and destination origins are selected by server configuration, not arbitrary caller URLs.
- Independent card/status fetch, whole-card canonical comparison, cross-document owner/key/endpoint/version binding.
- Ed25519 document/request signatures and challenge-response with domain separation.
- Raw-body Content-Digest, real transport authority/path, 30-second creation-clock skew but no grace past expiry.
- Atomic unique persistent SQLite replay/request/challenge/ticket constraints; no memory-only replay fallback. A failed persistence commit never yields a usable returned ticket.
- Tickets bound to exact action, proof key, audience and config version, at most 5 minutes and single-use; issuer status/current owner anchor rechecked at redemption.
- Admin bearer secret for configuration/trace/evidence APIs; token not stored in browser localStorage; optimistic config versioning.
- External fetch size/time/redirect/content-encoding limits; production HTTPS/default-port restriction, no userinfo; DNS address validation and pinning; deny private/reserved/cloud-metadata destinations. Local HTTP/private-origin allowances require exact trusted development origins.
- Strict JSON duplicate-key/Unicode/integer/schema handling; bounded body sizes, request limits, CSP and safe DOM text rendering.
- Append hash-chain audit with separately hashed evidence. Integrity checks detect alteration against surviving hashes; no raw ticket stored in saved trace results.

## Not protected / remaining risks
- **Development only**: same-UID processes are not an isolation boundary. Local OS access can read the Agent or verifier state. Keys are permission-protected but not encrypted/KMS-managed; no HSM or secure enclave.
- A fully compromised verifier/storage administrator can rewrite an entire local audit chain. There is no external signed checkpoint, timestamp authority or blockchain anchor. Do not call this immutable auditing.
- No real KYC, real chain registration, attested program execution, capability proof, payment or authorization. A passing request cannot prove benevolent Agent behavior.
- Proxy/reference contract source and deployment versions still need independent review/pinning. Optional on-chain reads reject mismatched bytecode but are untested. Provider trust, consensus/finality and reorg policies must be validated for deployment.
- Individual freshness checks and redemption rechecks do not eliminate cross-system TOCTOU. Hard revocation guarantees need a stricter protocol/operational design.
- PostgreSQL adapter, TLS reverse-proxy semantics, multi-replica races, integration/browser standards conformance and production adversarial testing are incomplete.
- No production retention/cleanup job, backup/restore policy, disk quota, security-event streaming, per-account rate limiting, account lifecycle, token rotation workflow or secure provisioning UI.
- Some local simulator APIs validate their narrow expected structures rather than a complete public standard schema. The application uses a custom validator, not Zod or an independently audited validator.
- Verifier trust enrollment is manual/launcher-only. General DID resolution, arbitrary key types, recovery, automatic key rotation and verifier issuer-key rotation are not implemented.

## Development endpoint exception
The local services intentionally allow exactly their administrator-set localhost origins. Do not generalize this into private-network access for arbitrary registration URLs. Do not expose these endpoints through a public tunnel.
