# AgentProof — verified-agent Sepolia trading demo

AgentProof는 **신원 확인(Authentication) → 사용자 권한(Authorization) → 실제 거래(Execution)**를 분리합니다. 기존 ERC-8004·A2A·APS·회사 확인자료·TAP-compatible 인증 데모를 유지하면서, VERIFIED Agent가 사용자의 온체인 정책과 예산 안에서 테스트 ERC-20 token을 구매하는 경로를 추가했습니다.

**실제 EVM 구매는 로컬 Anvil에서 검증했습니다. 실제 Sepolia 배포·예치·정책·metadata·구매 transaction은 사용자 MetaMask 승인 대기이며 아직 완료하지 않았습니다.** 테스트넷 자산만 사용하며 실제 투자·기업 KYC·Visa 인증·운영용 key management를 제공하는 서비스가 아닙니다.

## 빠른 시작: trading demo

Node.js 22.16 이상, Git, npm, Foundry의 `forge`와 `anvil`, MetaMask가 필요합니다. 기존 Native Node.js TypeScript stripping과 정적 HTML/CSS/JS를 사용하며, 최신 main의 `integrations`에 고정된 viem **2.57.6**을 그대로 재사용합니다.

```sh
npm ci --prefix integrations
npm run contracts:build
npm run contracts:test
npm test
npm run test:trade
npm run start:trade-demo
```

| 화면 | 기본 URL | 역할 |
|---|---|---|
| Agent Trading Demo | http://127.0.0.1:3100/trading | 목표·권한·준비 상태·인증·승인·실행·잔액 변화 |
| 기존 Sepolia Identity Console | http://127.0.0.1:3100/ | 기존 Agent 등록·공개 문서 확인·인증 |
| Verifier Dashboard | http://127.0.0.1:3101/ | 인증 모듈·증거·감사 trace |
| Sepolia Demo Exchange | http://127.0.0.1:3200/ | Merchant 배포·listings·실거래 event·관리 |
| Local company issuer | localhost:3103 | 명시적인 LOCAL DEMO ATTESTATION 발급 |

RPC override는 무시되는 `.env.sepolia`의 `SEPOLIA_RPC_URL`로 설정합니다. 포트·선택적 Etherscan API key·주소 override는 `.env.example`에 설명되어 있습니다. Merchant/User 주소는 UI MetaMask 연결에서 얻습니다. 어떤 단계에서도 사용자·Merchant private key나 seed phrase를 서버에 입력하지 않습니다.

**기존 Agent의 비공개 state를 먼저 확인하십시오.** `.state-sepolia/agent/sepolia-agent.json`이 없는 새 checkout에서는 공개 Agent Card만으로 원래 Ed25519 키를 복구할 수 없습니다. 원래 운영 환경의 안전한 백업을 복원해야 합니다. 이 경우 준비 화면은 `AGENT_LOCAL_STATE_MISSING`으로 실행을 막습니다. 문제를 우회하려고 새 Agent ID를 등록하거나 root `agentURI`를 바꾸지 않습니다. 정확한 절차는 [Sepolia trading runbook](docs/sepolia-trading-runbook.md)에 있습니다.

## 실제로 수행하는 거래 흐름

1. Merchant가 MetaMask로 Exchange와 고정 공급량 DemoToken 3개를 배포하고 listings를 등록합니다.
2. 기존 ERC-8004 owner가 별도 `agentproof.executionWallet.v1` metadata를 승인합니다. 기존 runtime binding과 root URI는 유지하고, execution-wallet extension이 추가된 signed Agent Card를 기존 공개 URL에 게시합니다.
3. User가 예산을 예치하고 buyEnabled·허용 token·1회/총한도·자동승인 기준·유효기간을 MetaMask로 설정합니다. 별도 Agent execution wallet에는 Sepolia gas를 제공합니다.
4. “내 예산 안에서 가장 오를 가능성이 높은 테스트 코인을 사줘.”를 입력합니다. Agent가 허용된 활성 listing 중 최고 demoScore를 결정론적으로 선택합니다.
5. 기존 신원 필터가 `VERIFIED`를 반환해야 `RuleBasedAuthorization`으로 넘어갑니다. 규칙에 따라 `ALLOW / ASK / DENY`를 판단하며, ASK는 exact transaction에 묶인 User EIP-712 추가승인이 필요합니다.
6. Verifier는 재검사 후 `VERIFIED + ALLOW`인 exact action에만 짧은 EIP-712 실행 서명을 발급합니다. Agent EVM 지갑이 계약을 호출합니다.
7. Contract가 정책·예산·현재 ERC-8004 owner·execution metadata·서명·nonce·만료를 다시 검사하고 사용자에게 token을 전송합니다. UI는 RPC receipt·event·token 잔액 증가와 audit를 확인한 뒤 성공으로 표시합니다.

기본 listing은 `AgentProof Demo Aurora / dAUR`(82), `AgentProof Demo Nova / dNOVA`(91), `AgentProof Demo Orbit / dORB`(76)입니다. 기본 가격은 whole token당 0.0001 Sepolia ETH입니다. 1회 한도 0.0002 ETH와 충분한 예산이면 dNOVA 2개를 선택합니다.

> 이 점수는 시스템 흐름 검증을 위한 합성 데모 데이터이며 실제 투자 전망이나 금융 조언이 아닙니다.

모든 금액·token 최소 단위는 bigint/decimal string으로 처리합니다. 거래 실패에 가짜 transaction hash를 생성하지 않습니다. 방송 후 RPC 응답이 불확실하면 기존 hash를 reconcile하며 자동 재전송하지 않습니다.

## 신원·권한·키의 구분

| 구성 | 의미 |
|---|---|
| Authentication | 등록된 바로 그 Agent와 현재 요청인가: VERIFIED / PARTIAL / REJECT |
| Authorization | 사용자 정책에서 이 exact action이 허용되는가: ALLOW / ASK / DENY |
| Execution | 실제 contract call·receipt·event·balance가 일치하는가 |
| Ed25519 runtime key | 기존 Agent Card·Passport·HTTP request identity |
| Agent secp256k1 execution key | 별도 테스트 transaction signer. 사용자 키를 보유하지 않음 |
| Verifier secp256k1 attestation key | exact action 인증서명 전용. 자금 보관 불필요 |

Registry·metadata·token·listing·사용자 예산/정책·구매·nonce·event는 `ON-CHAIN`입니다. Card·Passport·TAP request는 `OFF-CHAIN SIGNED`, 회사자료는 `LOCAL DEMO ATTESTATION`이며 실제 KYC가 아닙니다. Simulator와 테스트 fixture는 `SIMULATION`으로 구분합니다. 상세 판단 evidence와 audit 전체를 블록체인에 저장한다고 주장하지 않습니다.

TAP은 AgentProof의 제한형 TAP-compatible HTTP signature profile이며 Visa 공식 인증이 아닙니다. x402는 유료 HTTP resource 결제 프로토콜이므로 이 스마트 컨트랙트 token 매매 경로에 사용하지 않습니다. 향후 유료 API를 구매한다면 별도 adapter로 확장할 수 있습니다.

## 스마트 컨트랙트와 검증

`contracts/`는 Solidity **0.8.30**, OpenZeppelin **5.4.0**, forge-std **1.9.7**의 정확한 커밋을 고정합니다. 업그레이드 proxy나 generic calldata executor를 만들지 않습니다.

- `DemoToken`: OpenZeppelin ERC20, 고정 초기 공급량을 Exchange로 전달, 추가 mint 없음.
- `AgentProofDemoExchange`: 예산 예치·미사용액 출금, 정책·허용 token, listing·inventory, exact EIP-712 구매, nonce, merchant proceeds, owner-only 관리·pause.
- `buyWithAuthorization`: 현재 owner·execution binding, trusted verifier, buyer policy, 수량·가격·예산·만료를 검사하고 Checks-Effects-Interactions, ReentrancyGuard, SafeERC20을 적용합니다.

```sh
npm run check:trade-sepolia   # 읽기 전용 readiness 확인
npm run verify:trade-sepolia # 배포 후 source verification 또는 정확한 명령 출력
```

계약 주소가 있다는 사실과 Etherscan source verification은 구분합니다. API key가 없으면 정확한 constructor arguments와 Foundry 명령을 출력하고 미검증으로 남깁니다.

## 기존 인증 데모 유지

```sh
npm start
# 별도 터미널에서:
npm run test:e2e
```

기존 로컬 Agent Portal은 http://127.0.0.1:3000, Verifier는 http://127.0.0.1:3001입니다. 별도 registry simulator(:3002)·test issuer(:3003)를 사용하며 `DEVELOPMENT_MINIMAL`로 표시합니다. 기존 KRW `mock-purchase`는 보호 API 접근만 확인하며 실제 token 구매나 spending permission을 실행하지 않습니다. 기존 공격 시나리오와 관리자 필터 설정도 유지합니다.

```sh
npm run start:sepolia
npm run admin-token:sepolia
```

`start:sepolia`는 기존 등록·인증 콘솔입니다. 이미 등록된 Agent를 대상으로 거래하려면 신규 등록을 반복하지 않고 `start:trade-demo`와 runbook을 사용합니다. 공개 다중 Agent 디렉터리는 `site/agents.json`을 유지하며 [디렉터리 문서](docs/public-agent-directory.md)를 참조합니다.

## 테스트 기록과 문서

2026-11-04 기준 기존 최신-main baseline 51개, 기존 HTTP 20개, 새 trading Node 28개(전체 Node 79개), Foundry 58개 테스트와 TypeScript 검사를 통과했습니다. 실제 HTTP 거래 서비스 및 배포·관리 준비 트랜잭션 16건도 Anvil에서 검증했습니다. Anvil에서는 다섯 identity 모듈 PASS, VERIFIED/ALLOW 구매, ASK+human approval 구매, 실제 token 증가·예산 감소·event·receipt·감사·replay 차단을 검증했습니다. 최종 세부 결과 및 남은 검증은 [trading test results](docs/testing/trading-results.md)에 기록합니다. 실제 MetaMask 승인과 Sepolia 쓰기는 별도 수동 단계입니다.

선택적 타입 검사:

```sh
npm ci --prefix tools/typecheck
npm run typecheck
```

- [거래 아키텍처](docs/architecture/trading.md)
- [Authorization 규칙과 서명](docs/architecture/authorization.md)
- [스마트 컨트랙트 위협 모델](docs/threat-model/trading.md)
- [Sepolia 수동 runbook](docs/sepolia-trading-runbook.md)
- [성공·실패 데모 시나리오](docs/demo/trading.md)
- [구현 상태와 남은 작업](docs/implementation-status.md)
- [OpenAPI](docs/api/openapi.yaml)

## 파일·비밀값·운영 범위

`.state*`, `.env*`, DB, 로그, private key, admin token을 Git에 추가하지 않습니다. 새 실행 키는 `.state-sepolia/agent/`, verifier 키는 `.state-sepolia/verifier/`에 0700 디렉터리·0600 파일로 저장하며 공개 주소만 UI에 제공합니다. 기존 state와 키를 삭제하거나 자동 초기화하지 않습니다.

같은 OS 사용자 아래의 프로세스 분리는 강한 key 격리가 아닙니다. 운영에는 KMS/HSM, 역할별 OS 사용자/컨테이너, 독립 RPC와 finality 정책, 감사 보존·백업·접근 제어, 독립 스마트 컨트랙트 검토가 추가로 필요합니다. 로컬 데모를 공개 인터넷 서비스로 배포한 운영 준비 완료 상태로 해석하지 않습니다.
