# ADR-003: passport is an optional identity proof, not a wallet policy
Use only selected APS passport v2 fields, self-signature and a live key challenge. A passport's did:key is linked to the current ERC owner/Agent by independent custom runtime binding; it is not numerically equal to the ERC agentId.

Self-declared capabilities are not capability verification. Company/operator trust is separate. Spending limits, merchants, budgets, delegation and action receipts are not stuffed into the passport. The envelope is called Presentation Bundle and its fields remain untrusted until each filter succeeds.

When APS is disabled, a current runtime key must still be anchored independently through A2A/registry and prove possession in the live TAP-profile signature. This makes WEB3_AGENT_V1 meaningful without pretending APS was passed.
