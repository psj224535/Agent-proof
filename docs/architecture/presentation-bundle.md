# Presentation bundle
The envelope is transport convenience, not evidence. It contains a claimed chain/registry/agent identity, presented A2A card, optional passport and company attestation, purchase intent, timestamps/request ID, bundleHash and optional passportProof.

`bundleHash = SHA256(JCS(bundle excluding bundleHash and passportProof))`. Excluding the proof avoids a circular hash dependency. Passport proof is nevertheless covered by the outer live HTTP body signature. A challenge stores requestHash = bundleHash plus audience, operation, identity, requestId and runtime key. Challenge lifetime is 120 seconds; successful authentication consumes it atomically.

TAP is carried in real `Signature-Input`, `Signature`, and `Content-Digest` HTTP headers. `tapRequest` is the purchase intent; it is NOT a replacement for observing the actual HTTP transport. The verifier checks raw bytes against Content-Digest before verifying RFC9421 signature input.

Parsing rejects duplicate JSON keys, unsafe integer magnitudes, invalid UTF8, lone surrogates, oversized/deep JSON and unknown fields in the app schemas. JCS processing is limited to this supported I-JSON subset; this is not a certificate of universal JCS conformance. Amounts use integer KRW; no floating-point money.
