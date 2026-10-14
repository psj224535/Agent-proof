# Ethereum Sepolia ERC-8004 runbook

## What this mode does

`npm run start:sepolia` starts two localhost services while reading the real Ethereum Sepolia network:

- `127.0.0.1:3100`: MetaMask registration console and PM request signer
- `127.0.0.1:3101`: independent verifier dashboard

The browser wallet signs contract writes. The backend never receives a wallet private key or seed phrase. A separate Ed25519 runtime key is generated under `.state-sepolia/agent/`; that key signs AgentProof/A2A requests and is not an Ethereum account.

## Pinned network values

- Chain: Ethereum Sepolia, chain ID `11155111` (`0xaa36a7`)
- IdentityRegistry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Configured owner: `0x422A6dDB79F4a13B58f7aAedD92f464c3e1e70A9`
- Public origin: `https://psj224535.github.io/Agent-proof`
- Official contract repository HEAD observed on 2026-10-14: `b9e466c250744a7e06b13dff9d3c2844ed64f825`
- Proxy code hash observed at Sepolia block `11912638`: `0xd0e45b1d89fa9b6cc7e97c1f155d64180e5c232aaccf9900ef9d4fd738c02b41`
- EIP-1967 implementation: `0x7274e874ca62410a93bd8bf61c69d8045e399c02`
- Implementation code hash observed at the same block: `0xa5f9624ea85e45b3f4b8558581f03bfb3e6cefab278d7bf0500ec9bd065dc16f`

The service refuses to start or verify an agent if the chain, proxy bytecode, implementation slot, or implementation bytecode no longer matches these pins. An upgrade therefore fails closed and requires a fresh source review plus an intentional pin update.

## First publication

The repository contains a clearly inactive placeholder document so that the final `agentURI` exists before registration. GitHub Pages must use **GitHub Actions** as its source. The workflow `.github/workflows/pages.yml` publishes only the `site/` directory.

Open repository **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**, then run or re-run `Deploy PM agent documents to GitHub Pages`. Confirm these URLs load over HTTPS:

- `https://psj224535.github.io/Agent-proof/`
- `https://psj224535.github.io/Agent-proof/.well-known/agent-registration.json`

## Registration

1. Run `npm install --prefix integrations` once.
2. Run `npm run start:sepolia` and keep the terminal open.
3. Open `http://127.0.0.1:3100` in a browser with MetaMask. Safari does not provide the MetaMask extension; use the Chrome/Firefox extension or MetaMask mobile's in-app browser. A phone cannot reach the Mac's `127.0.0.1` without additional LAN/TLS setup.
4. Connect only the configured owner account. The console switches to Sepolia.
5. Click **등록 트랜잭션 보내기** and review the target, network, zero value, and gas estimate in MetaMask.
6. After confirmation, record the displayed agent ID and Etherscan transaction link.
7. Click **메타데이터 트랜잭션 보내기** and approve `setMetadata`.

The backend accepts a transaction only if its chain, sender, target, zero ETH value, and full calldata exactly match what it prepared. It also verifies the `Registered` event and reads the stored metadata back at the receipt block.

The backend will not prepare the first transaction until the public HTTPS `agentURI` returns the expected PM placeholder document. This prevents accidentally anchoring a 404 or unrelated page.

## Publish the final documents

Registration confirmation writes the final files locally:

```sh
git add site/.well-known/agent-registration.json site/.well-known/agent-card.json
git commit -m "Publish PM ERC-8004 documents"
git push origin main
```

Wait for the Pages workflow, then click **공개 상태 확인**. The backend fetches both public HTTPS documents and compares their canonical hashes with the local signed copies.

## Verify locally and externally

- In the registration console, click **인증 요청 보내기**. A successful result is `VERIFIED` with `SEPOLIA_TESTNET` assurance and `WEB3_AGENT_V1` policy.
- Run `npm run admin-token:sepolia`, enter it at `http://127.0.0.1:3101`, and inspect the pinned block, owner, agent URI, binding hash, fetched documents, signatures, and audit chain.
- View the NFT and transactions on Sepolia Etherscan from the console.
- Open 8004scan from the console. It is a third-party indexer, so indexing may lag or its URL/UI may change.

## Costs and safety

Both calls consume Sepolia gas only. They do not mine ETH in the browser and do not spend mainnet ETH. Do not send mainnet ETH to a Sepolia address for this task. Keep enough Sepolia ETH for two transactions and later metadata updates.

Do not commit `.state-sepolia/`, `.env.sepolia`, admin tokens, SQLite files, or runtime private keys. If the first registration transaction succeeds but local confirmation fails, do not immediately register again: copy the transaction hash from MetaMask/Etherscan and diagnose the confirmation error first to avoid duplicate agent NFTs.
