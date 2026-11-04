# Trading verification results — 2026-11-04

이 기록은 실제 실행한 자동 검증과 아직 필요한 수동 검증을 구분합니다. 이전 인증 데모 기록은 [results.md](results.md)의 2026-10-14 기록이며, 이 문서가 거래 기능의 추가 결과입니다.

## 이번 작업에서 확인한 결과

| 검증 | 실제 결과 | 범위 |
|---|---|---|
| 변경 전 로컬 인증 baseline | 46 tests passed | checkout 초기 커밋의 기존 인증·보안 테스트 |
| 최신 main 인증·Sepolia·catalog baseline | 51 tests passed | `origin/main` 5319f5c 기준 |
| 기존 real HTTP 통합 | 20 checks passed | 로컬 Agent/Verifier/registry simulator/test issuer. 최초 서버 미기동 실행은 state 없음으로 실패했으며 서버 기동 후 재실행 |
| Solidity compile | Passed | solc 0.8.30, OZ 5.4.0 고정 커밋, forge-std 1.9.7 고정 커밋 |
| Foundry contract tests | 58 passed, 0 failed | 실제 EVM contract state·events·negative tests |
| 새 Node trading rules tests | 18 passed, 0 failed | deterministic rules, signatures, key storage, amounts, schemas, receipts, audit |
| 새 trading Authentication/security tests | 10 passed, 0 failed | 거래 Agent ID·executor·별도 인증표·회사자료 범위·SSRF 회귀 |
| 최종 전체 Node tests | 79 passed, 0 failed | 기존 51 + 거래 28 |
| TypeScript typecheck | Passed | Node 22.22.0, TypeScript 5.8.3 |
| 실제 HTTP trading integration | Passed | 준비·확정 API, VERIFIED→ALLOW 거래, ASK→서명→거래, 원래 인증 감사 체인까지 receipt 연결 |
| Exchange 배포/관리 HTTP integration | Passed | 실제 준비 트랜잭션 16건, Exchange·3 tokens·3 listings·7 admin actions |
| Sepolia read-only check | 체인/registry PASS, USER_SETUP_REQUIRED | 원래 Agent state 없음, Exchange 미배포를 정확히 반환 |
| Anvil integration | Passed | 실제 local EVM deployment·budget·policy·VERIFIED/ALLOW purchase·ASK human approval purchase |
| Live read-only browser smoke | Passed | 임시 state와 ports 3310/3311/3320, 실제 Sepolia RPC, desktop 1440px·mobile 390px. JS 오류·가로 overflow 없음 |
| UI fixture rendering | Passed | 세 listing, 허용 token checkbox, 0.002 ETH slider 동기화, owner gating, MetaMask 미설치 오류 |
| 정적 browser JavaScript syntax | Passed | 두 신규 app.js에 `node --check` |

read-only browser에서 chain11155111·chainError 없음, 기존 Agent state 없음·gas0일 때 실행 비활성, listing/trade를 만들어 표시하지 않음, source NOT_VERIFIED와 여섯 authentication cards를 확인했습니다. 이 표는 아직 실행하지 않은 MetaMask 또는 Sepolia 구매를 포함하지 않습니다.

## Anvil에서 관측한 실제 값

`scripts/trade-anvil-e2e.ts`는 disposable localhost chain 31337을 시작하고 별도 임시 키로 Exchange·DemoToken 3개·registry fixture를 배포합니다. 공식 ERC-8004 registry 배포를 대체했다고 주장하지 않습니다. 등록/card/company 조회는 제어된 테스트 출처이며, 기존 Authentication engine의 다섯 모듈은 모두 PASS했습니다.

| 측정 | 결과 |
|---|---|
| 선택 token | dNOVA, score 91 |
| Authentication / Authorization | VERIFIED / ALLOW |
| 첫 구매 수량 | `2000000000000000000` units = 2 dNOVA |
| 사용자 token balance | 0 → 2 dNOVA |
| 사용자 예산 | `1000000000000000` → `800000000000000` wei |
| Merchant proceeds 증가 | `200000000000000` wei |
| 첫 구매 receipt | success, block 18, gas used 195631 |
| 구매 event | VerifiedAgentPurchase, exact buyer/agent/executor/token/quantity/cost/nonce/evidence/trace |
| ASK 추가승인 구매 | buyer EIP-712 + verifier 서명으로 두 번째 실제 transaction, 누적 4 dNOVA |
| Node/Solidity EIP-712 | execution digest와 human approval digest 일치 |
| Replay | 차단 |
| REJECT/PARTIAL·정책 거부 | executor transaction count 증가 0 |
| 감사 무결성 | 기존 verifier audit 및 trade audit 모두 확인 |

transaction·block hash와 주소는 실행마다 달라집니다. 최신 실제 로컬 결과는 Git에서 제외되는 `test-results/trade-anvil.json`에 생성되며 Sepolia Etherscan 링크로 해석하면 안 됩니다. 거래소 HTTP 검증 결과는 별도 `test-results/exchange-service.json`, 최종 명령 출력은 `test-results/final-node-tests.log`와 `test-results/final-trade-tests.log`에 있습니다. 임시 테스트 state만 종료 시 정리하며 기존 `.state*`는 삭제하지 않습니다.

## 부정 테스트 범위

Foundry는 deposit/configure/buy/balance/event/출금 외에 wrong signer·agent·executor·buyer, expired authorization/policy, replay, policy revoked/buy disabled/token disallowed/listing inactive, 한도·잔고·max cost, owner·metadata 변경, chain/domain 교체, pause, 관리자 접근, reentrancy, human approval 및 누적 spent 보존을 검사합니다. canonical execution-wallet bytes32 vector를 Node와 공유합니다.

Node tests는 허용되지 않는 자연어 요청, 최고점/허용 token/재고/예산 선택, 1 wei와 큰 수의 정확한 변환, schema extra fields·mainnet·zero quantity 거부, ALLOW/ASK/DENY 행렬, exact human signature·domain 교체, 키 파일 0600/디렉터리 0700, private key 비노출, nonce 재발급과 재시작 replay, audit tamper, RPC chain·sender·target·calldata·value·block·confirmation 불일치를 검사합니다.

## 통합 중 발견하여 수정한 경계 조건

- runtime metadata·공개 card·active 상태가 승인 발급 후 바뀌면 실행 직전 preflight에서 거래를 차단합니다.
- 인증표의 Agent identity와 거래 intent identity가 다르면 TAP 및 verifier에서 거절합니다.
- executor gas가 0 또는 1 wei인 경우 모두 `AGENT_EXECUTOR_GAS_INSUFFICIENT`이며 transaction count가 증가하지 않습니다.
- 서버 시각이 최신 블록 timestamp보다 앞선 경우를 2.1초 idle-block regression으로 재현했습니다. 발급시각은 wall-clock/최신 블록 시각 중 작은 값에 고정하며 60초 이상 오래된 head를 거절합니다. 수정 후 실제 구매가 통과했습니다.
- 잘못된 prepare/confirm 조합, 비소유자 관리, numeric wei·임의 calldata, cross-origin 요청, Exchange runtime bytecode 변경을 거절했습니다.

## 아직 완료로 표시하지 않는 항목

- 실제 Sepolia Exchange·token deployment 및 listings, metadata, deposit, policy, purchase transactions: **사용자 MetaMask 승인 대기**.
- 실제 Sepolia Etherscan receipt·event·token balance 증가: **미실행**.
- Etherscan source verification: **배포 후 API key 또는 출력된 Foundry 명령으로 별도 실행 필요**.
- 실제 MetaMask extension을 포함한 browser E2E: **이 기록 시점 미실행**. UI 구현·정적 검사·스크린샷은 실제 지갑 승인 테스트를 대신하지 않음.
- 원래 등록 Agent runtime state 복원 및 갱신 card의 외부 Pages 게시: **사용자 환경 작업 필요**.
- PostgreSQL, 운영 HSM/KMS, OS 사용자 격리, 장기 audit 보존, 독립 스마트 컨트랙트 보안 감사: **범위 밖 또는 미검증**.

## 재현 명령

```sh
npm ci --prefix integrations
npm run contracts:build
npm run contracts:test
npm test
npm run test:trade
npm ci --prefix tools/typecheck
npm run typecheck
```

기존 HTTP 시험은 로컬 simulator 서버를 기동한 별도 터미널에서 `npm run test:e2e`로 실행합니다. 기존 `start:sepolia`·`npm start`·`test:e2e` 명령의 의미는 유지됩니다. 자동 테스트는 Sepolia 자금을 소비하지 않습니다.
