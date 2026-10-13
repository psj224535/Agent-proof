# ADR-002: sequential evidence, independent adapters
Each module consumes validated context and emits one typed ModuleResult. Fetches may be independently optimized later, but decisions and evidence binding remain ordered. Unavailable required sources cause PARTIAL, explicit evidence contradiction causes REJECT. Fail-fast and continue-all are administrator settings.

The UI controls only administrator-authenticated configuration. The presentation schema rejects config overrides. Required flags define evidence expectations; they never make a failed signature acceptable. Recognized reduced policy profiles can issue development tickets only when all remaining enabled evidence succeeds; CUSTOM_REDUCED cannot silently become FULL.

Trade-off: shared context and store adapter are simple for this demo but warrant further splitting before independently packaging/publishing modules. No dependency on browser DOM exists in filters.
