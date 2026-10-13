# Deployment work not completed
No Docker binary was available to validate images, compose configuration or container isolation. This archive deliberately does not include an untested one-command production deployment claim.

For subsequent integration, run verifier, Agent, registry adapter and test issuer as separate users/containers. Mount only each role's state and public trust files, never a shared writable project/state root. Do not pass verifier database credentials or admin tokens to the Agent container. Use an isolated PostgreSQL network/role and HTTPS or explicitly configured local development origins. Review Anvil/reference deployment instructions in `contracts/README.md`.

The tested launcher is localhost-only and independent-process, not hard container-isolated.
