# Implementation status — 2026-11-04

기존 인증 데모를 보존하면서 Sepolia trading 경로를 추가했습니다. **로컬 EVM 검증 완료와 실제 Sepolia 수동 실행 완료는 다릅니다. 실제 Sepolia transaction은 사용자 MetaMask 승인 대기입니다.** 상세 결과는 [trading-results.md](testing/trading-results.md)에 기록합니다.

## Trading acceptance status

| 요구사항 | 구현·검증 상태 |
|---|---|
| 기존 Authentication 및 KRW mock schema 보존 | 별도 trade schema/ticket operation 추가. 기존 baseline 51개와 HTTP 20개 회귀 확인 |
| Authentication / Authorization / Execution 분리 | 코드·타입·API·UI 단계 분리. VERIFIED만으로 spending 허용하지 않음 |
| Foundry·DemoToken·Exchange | 구현. Solidity 0.8.30·OZ 5.4.0·forge-std 1.9.7 commit 고정, 58 contract tests 통과 |
| 실제 local-chain E2E | Anvil에서 deployment, policy, deposit, authentication, verifier signature, 실제 구매, receipt/event/balance/audit 검증 |
| REJECT/PARTIAL 실행 차단 | rules/signing gate 및 Anvil executor tx count 미증가 확인 |
| VERIFIED 정책 위반 DENY | 규칙 행렬과 contract negative tests 확인 |
| ASK human approval | exact EIP-712 execution digest를 User가 승인. Node·Solidity·Anvil 실제 두 번째 구매 검증 |
| 별도 Agent execution wallet·Verifier key | 로컬 제한 권한 파일에 생성. 공개 주소만 UI/API에 제공. 운영 KMS/HSM 아님 |
| execution-wallet identity binding | 별도 metadata key·canonical bytes32·signed card extension. 기존 ID/root URI/runtime binding 유지 |
| Sepolia owner metadata update | MetaMask prepare/confirm 구현. 실제 owner 승인 미수행 |
| UI 목표·정책·준비·필터·권한·실행·결과 | 구현. 실제 RPC 기반 상태. read-only browser 및 fixture rendering 확인; MetaMask 승인 E2E 미수행 |
| Exchange 배포·market·activity·owner 관리 | prepare/confirm와 MetaMask UI 구현. 실제 Sepolia 배포 미수행 |
| 예산·token·merchant proceeds 변경 | 실제 Anvil EVM에서 확인. Sepolia 실제 값은 수동 검증 필요 |
| nonce replay·exact action·domain 방어 | Node·Solidity·Anvil 검증 |
| receipt/event 위조·RPC mismatch | configured RPC로 tx/receipt/block/event 교차 확인, Node negatives·Anvil 실제 receipt 검증 |
| 중복 제출·방송 불확실성 | 직렬화·지속된 submission hash·reconcile. 방송 이후 오류를 거래 없음으로 오인하지 않음 |
| ON-CHAIN/OFF-CHAIN SIGNED/LOCAL DEMO ATTESTATION/SIMULATION 라벨 | UI·문서에서 증거 범위 구분 |
| source verification | 배포 기록 기반 Foundry 명령/검증 경로. 실제 Sepolia 검증은 배포 후 수행 |
| 문서 및 재현 명령 | README, architecture, authorization, threat model, runbook, scenarios, OpenAPI, results 추가·갱신 |
| 실제 Sepolia 성공 시나리오 | **준비 완료, 사용자 승인 대기. 배포·예치·정책·거래·Etherscan·잔액 증거 아직 없음** |

## 기존 기능과 보존 범위

기존 Agent Portal·Sepolia Console·Verifier Dashboard, 공식 ERC-8004 reader, public multi-agent directory, Ed25519 runtime identity, A2A·APS·company·TAP 순차 필터, 단기 일회성 인증표, hash-linked audit, SSRF·replay·위조 방어를 유지합니다. 원래 `npm start`, `start:sepolia`, `npm test`, `test:e2e`를 유지합니다. local simulator의 mock-purchase는 계속 실제 spending을 하지 않습니다.

거래 모드의 Company 자료는 local test issuer가 서명한 데모 자료입니다. SEPOLIA_TESTNET에 대한 명시적인 local-demo 정책 아래 사용하며 실제 기업 KYC나 production assurance로 승격하지 않습니다. 기존 Sepolia verifier state와 충돌하지 않도록 trading trust·DB를 별도로 사용합니다.

## 사용자에게 남은 실제 작업

1. 원래 등록한 Agent의 비공개 runtime state가 이 컴퓨터에 없다면 안전한 백업에서 복원합니다. 새 Agent 등록으로 우회하지 않습니다.
2. Merchant MetaMask로 Exchange·token 3개·listing을 배포/등록합니다.
3. 기존 Agent owner가 execution metadata만 추가하고 갱신한 signed card를 기존 URL에 게시합니다.
4. User가 예산·정책·허용 token을 승인하고 executor에 Sepolia gas를 보냅니다.
5. 실제 인증·권한·구매·Etherscan receipt/event·잔액·audit를 runbook대로 확인합니다.
6. 선택적으로 Etherscan source verification을 수행하고 실제 결과를 기록합니다.

## 남아 있는 한계

Native Node HTTP·제한형 JSON schema·SQLite를 사용하며 대규모 프레임워크로 재작성하지 않았습니다. PostgreSQL adapter·별도 OS 사용자 격리·KMS/HSM·장기 audit 보존·독립 RPC quorum·production 운영·독립 계약 감사는 미검증 또는 범위 밖입니다. Anvil의 registry·문서 출처는 controlled fixture이며 공식 Sepolia의 실제 쓰기를 대체하지 않습니다. A2A/APS/TAP 전체 표준의 공식 인증 또는 외부 conformance를 주장하지 않습니다.
