# Identity resolver and binding
ERC identity `(chainId, registry, agentId)` is not the same as APS `agent_id` (a DID). The runtime-identity extension links these identifiers explicitly. The selected passport profile uses `did:key` with an Ed25519 multicodec public key; arbitrary DID methods/key resolution endpoints are not implemented.

Independent trust chain:
```
configured registry -> current owner + token URI + owner-managed binding hash
                   -> fetched registration -> official card URL
                   -> fetched card runtime extension -> current runtime key
                   -> passport + fresh challenge + HTTP request signature
configured issuer -> signed company attestation + fresh signed status
```
`agentproof.runtimeBinding.v1` is a custom registry metadata key containing the 32-byte SHA256 hash of the complete canonical runtime binding. The registration `agentproof` object and A2A extension URI are also custom. This avoids treating an arbitrary self-signed passport as proof of the registered agent.

The binding covers owner, subject identity, runtime key/DID, endpoint, version and validity. After ownership transfer, the old owner's card binding cannot match current ownership even if other URIs remain unchanged. Protected redemption repeats owner/key-anchor checks and company status checks. Checks are observational: no cryptographic system here makes the remote state immutable between the last read and service response. For actual on-chain value transfer, atomic execution/authorization design is still required.
