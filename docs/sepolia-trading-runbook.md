# Sepolia trading runbook

**구현과 로컬 Anvil 검증은 Sepolia 실배포 완료를 뜻하지 않습니다. 실제 Sepolia 배포·metadata·예치·정책·구매는 이 문서의 사용자 작업을 수행한 뒤에만 완료됩니다. 현재 상태는 준비 완료, 사용자 승인 대기입니다.**

Sepolia는 테스트넷이며 여기서 배포하는 dAUR·dNOVA·dORB는 테스트 자산입니다. 메인넷이나 실제 가치가 있는 token을 사용하지 마십시오. Merchant와 User가 같은 MetaMask 주소여도 되지만 역할은 구분합니다. 기존 Agent의 ERC-8004 owner는 이 두 역할과 별도일 수 있습니다.

## 1. 실행 도구와 기존 Agent state 확인

필요한 도구는 Node.js 22.16 이상, Git, npm, Foundry의 `forge`·`anvil`, MetaMask입니다. Merchant/User 주소는 UI 지갑 연결에서 얻습니다. 개인키나 seed phrase를 `.env`, API, 채팅에 입력하지 않습니다.

```sh
node --version
forge --version
anvil --version
npm ci --prefix integrations
npm run contracts:build
npm run contracts:test
npm test
npm run test:trade
```

`contracts:build`는 `contracts/dependencies.json`에 고정된 OpenZeppelin 5.4.0·forge-std 1.9.7 커밋과 Solidity 0.8.30을 사용합니다. 기존 dependency checkout이 다르거나 수정되었으면 덮어쓰지 않고 중단합니다. 자동 테스트는 임시 Anvil에서만 자금을 사용합니다.

**이 checkout에는 이미 등록된 Agent의 비공개 runtime state가 없을 수 있습니다.** 공개 `site/.well-known/*.json`만으로 기존 Ed25519 개인키를 복구할 수 없습니다. 이 경우 Trading Demo가 `AGENT_LOCAL_STATE_MISSING`을 표시하고 실행을 막습니다. 원래 등록에 사용한 컴퓨터 또는 안전한 백업에서 `.state-sepolia/agent/sepolia-agent.json`을 해당 역할 디렉터리로 복원하십시오. 이 파일에는 runtime key가 있으므로 내용을 표시하거나 Git에 추가하지 않습니다. 디렉터리 0700·파일 0600 권한을 유지합니다.

기존 파일이 있으면 비교·백업 없이 덮어쓰지 않습니다. 기존 Agent ID·root `agentURI`·runtime key를 유지해야 합니다. state를 얻을 수 없으면 기존 Agent를 실행할 수 없으므로 여기서 멈추고 원래 운영자에게 복원 또는 별도의 명시적인 키 회전 절차를 요청합니다. **데모를 진행하려고 새 Agent를 등록하거나 현재 root URI를 교체하지 않습니다.** 기존 등록 콘솔의 신규 등록 버튼은 이 거래 runbook의 단계가 아닙니다.

RPC를 재정의하려면 무시되는 `.env.sepolia` 파일에 `SEPOLIA_RPC_URL`을 설정합니다. HTTPS Sepolia RPC만 사용합니다. `.env.example`의 거래 변수 설명을 참고하되 placeholder를 실제 주소로 간주하지 않습니다. Etherscan source verification용 API key는 선택 사항입니다. 기존 `.state`, `.state-sepolia`, `.env`, DB와 키를 삭제하지 않습니다.

## 2. 서비스 기동

```sh
npm run start:trade-demo
```

| 화면 | 기본 URL |
|---|---|
| 기존 Identity Console | http://127.0.0.1:3100/ |
| Agent Trading Demo | http://127.0.0.1:3100/trading |
| Verifier Dashboard | http://127.0.0.1:3101/ |
| Sepolia Demo Exchange | http://127.0.0.1:3200/ |

거래용 local company issuer는 3103에서 동작합니다. 회사 확인자료의 라벨은 `LOCAL DEMO ATTESTATION`이며 실제 기업 KYC가 아닙니다. 거래 verifier의 별도 `trust-trading.json`·`verifier-trading.sqlite`를 사용해 기존 Sepolia 인증 설정과 상태를 유지합니다.

기동 로그와 Exchange Setup에서 chain 11155111, registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`, verifier 공개 주소, contract build 상태를 확인합니다. 서명 전용 verifier 키는 `.state-sepolia/verifier/`, Agent execution 키는 `.state-sepolia/agent/`에 제한된 권한으로 생성됩니다. 두 키는 서로 다르며 운영용 KMS/HSM이 아닙니다. Verifier 주소에는 ETH를 보낼 필요가 없습니다.

실행 전후의 read-only 확인:

```sh
npm run check:trade-sepolia
```

이 명령의 성공은 배포·구매 transaction을 발생시켰다는 뜻이 아닙니다.

## 3. Merchant MetaMask: Exchange·token·listing

Exchange Portal에서 다음 순서로 진행합니다. 지갑이 Sepolia가 아니면 UI가 network 전환을 요청합니다. 각 transaction마다 주소·network·작업을 MetaMask에서 확인하고 승인합니다. 서버가 Merchant 키를 받는 단계는 없습니다.

1. **Connect wallet / Check Sepolia:** Merchant 지갑을 연결하고 배포 gas용 Sepolia ETH를 준비합니다.
2. **Deploy Exchange:** verifier 주소와 공식 registry를 확인하고 Exchange를 배포합니다. 실제 receipt의 contract address와 Etherscan transaction 링크가 나타나야 합니다.
3. **Deploy Tokens:** Aurora/dAUR, Nova/dNOVA, Orbit/dORB를 각각 배포합니다. constructor는 고정 공급량 전체를 Exchange inventory로 전송합니다. 임의 mint 함수가 없습니다.
4. **Register Listings:** 각 token의 listing 등록을 승인합니다. 기본 whole token 가격은 `100000000000000 wei`(0.0001 Sepolia ETH), 점수는 82·91·76입니다.
5. **Verify Public State:** 세 listing의 token address, decimals, 가격, inventory, active, score, observed block을 다시 읽습니다.
6. **Ready:** 활성 listing 3개와 Exchange owner·trusted verifier가 예상한 값인지 확인합니다.

UI의 배포 확인 API는 RPC의 transaction sender·calldata·value·receipt·block을 검사합니다. MetaMask 서명을 거절하면 거래가 없고, 제출 이후 RPC 상태가 불확실하면 기존 hash를 확인해야 합니다. 확인되지 않은 hash를 성공으로 표시하거나 새 배포를 무조건 반복하지 않습니다.

## 4. 기존 Agent owner MetaMask: execution-wallet binding

Trading Demo의 Agent 준비 상태에서 실행 지갑 공개 주소를 확인합니다. 이것은 Ed25519 runtime identity나 User MetaMask 주소가 아닙니다.

1. 기존 ERC-8004 Agent의 **현재 owner** MetaMask로 연결합니다.
2. **Owner MetaMask로 실행 지갑 연결**을 선택합니다.
3. 기존 agent ID에 대한 `setMetadata(agentId, "agentproof.executionWallet.v1", abi.encode(executorAddress))`만 승인합니다. 기존 `agentproof.runtimeBinding.v1`과 root `agentURI`는 유지합니다.
4. 로컬에서 갱신한 signed Agent Card의 execution-wallet extension을 확인합니다. 기존 공개 card URL에 갱신된 파일을 게시해야 합니다. 공개 파일만 검토하여 기존 Pages 게시 절차로 반영합니다. 이 작업은 저장소 자동 push나 외부 계정 작업을 대신 수행하지 않습니다.
5. Identity Console의 **공개 상태 확인** 및 Trading 준비 체크를 갱신해, 공개 card와 로컬 signed card가 같고 현재 owner·runtime binding·execution metadata가 일치하는지 확인합니다.
6. 실행 지갑 주소를 복사해 사용자가 소량의 **Sepolia ETH**를 직접 보냅니다. UI의 gas balance와 추정 gas 비용을 확인합니다. 잔액이 충분하지 않으면 `AGENT_EXECUTOR_GAS_INSUFFICIENT`이며 구매를 제출하지 않습니다.

누군가 이미 다른 executor를 metadata에 연결했으면 기존 값을 무심코 교체하지 않습니다. 현재 운영자·로컬 state·정책을 대조한 뒤 owner가 의도한 주소를 승인해야 합니다.

## 5. User MetaMask: 예치·정책

구매 토큰을 받을 User 지갑으로 전환합니다. 다음은 기본 가격에서 dNOVA 2개 구매를 확인하기 위한 작은 예시이며 실제 값을 UI에서 검토합니다.

| 설정 | 예시 |
|---|---|
| 예산 예치 | 0.001 Sepolia ETH |
| 자동 구매 | ON |
| 허용 token | dAUR, dNOVA, dORB |
| 1회 최대 금액 | 0.0002 Sepolia ETH |
| 자동승인 기준 | 0.0002 Sepolia ETH |
| 전체 누적 사용 한도 | 0.001 Sepolia ETH |
| 유효기간 | 1시간 |

예산 예치, `configurePolicy`, 각 token 허용 변경은 개별 MetaMask transaction입니다. 정책 저장 버튼이 완료되어도 receipt가 확정되기 전에는 준비 완료로 보지 않습니다. 예치 잔액과 정책 한도는 별개입니다. 누적 spent는 정책 재설정으로 사라지지 않습니다.

준비 상태에서 ERC-8004, 공개 card, runtime binding, execution binding, gas, 활성 정책, 예치액, Exchange, 활성 listings가 모두 충족되어야 실행합니다.

## 6. 구매 및 사람 추가승인

목표에 다음을 입력하고 **목표 실행 · 인증 시작**을 선택합니다.

> 내 예산 안에서 가장 오를 가능성이 높은 테스트 코인을 사줘.

지원되는 시나리오는 `BUY_HIGHEST_DEMO_SCORE_TOKEN`입니다. 기본 데이터에서 허용된 최고 score는 dNOVA 91입니다. 이 점수는 합성 데모 데이터이며 실제 투자 전망이나 금융 조언이 아닙니다.

Authentication에서 각 모듈 결과·source·hash·expiry를 확인합니다. `PARTIAL` 또는 `REJECT`이면 이후 execution signature나 구매 transaction이 없어야 합니다. `VERIFIED` 다음 Authorization에서 선택 token·수량·현재 가격·총비용·정책·남은 예산을 확인합니다.

자동승인 기준을 넘으면 `ASK`가 됩니다. **MetaMask 일회성 추가승인**은 전체 ExecutionAuthorization digest에 대한 EIP-712 서명입니다. 무료 메시지 서명도 spending 권한에 사용되므로 내용을 확인합니다. 승인 후 신원·owner·card·정책·가격·잔액·만료를 다시 검사합니다. 승인 창을 오래 열어 만료되면 새 intent와 인증부터 다시 시작합니다. 이전 사람 서명을 변경된 거래에 재사용하지 않습니다.

`VERIFIED + ALLOW`에서만 verifier가 짧은 실행 승인을 발급합니다. Agent EVM 지갑이 실제 transaction을 제출하며, 그 시점의 contract 재검사가 최종 집행 조건입니다.

## 7. 성공 판정과 실패 복구

성공 화면의 `TRADE CONFIRMED`는 아래 항목이 실제 RPC에서 확인되었을 때만 받아들입니다.

- Sepolia transaction hash와 성공 receipt, block number/hash, gas used
- Exchange의 `VerifiedAgentPurchase` event 및 buyer·agent·executor·token·quantity·cost·nonce·evidenceHash·traceId
- 예시 첫 거래: `0 dNOVA → 2 dNOVA`, 예치 예산 `0.001 → 0.0008 Sepolia ETH`
- 요청·Authentication·Authorization·Execution을 잇는 audit trace
- Etherscan transaction·Exchange·token·사용자 token holdings 링크

거래 전 실패는 `submitted:false`로 확인합니다. 방송 뒤의 RPC timeout/응답 유실은 거래 없음이 아니며 `SUBMISSION_UNCERTAIN` 상태일 수 있습니다. 저장된 hash를 Etherscan/RPC에서 조회하고 `/api/trading/reconcile`로 같은 거래를 확인합니다. 다른 intent를 즉시 반복해 이중 구매하지 않습니다. transaction이 revert하면 token과 예산은 변하지 않아도 executor gas는 소모될 수 있습니다.

중지 시험은 사용자 policy 긴급 중지·취소를 먼저 수행하고, 다음 요청이 거절되는지 확인합니다. Merchant의 Exchange pause는 모든 새 구매를 막습니다. 미사용 예산 출금은 pause 상태에서도 사용자가 승인할 수 있습니다.

## 8. Etherscan source verification

```sh
npm run verify:trade-sepolia
```

스크립트는 저장된 배포 기록의 정확한 constructor arguments를 사용합니다. API key가 없으면 실행할 Foundry 검증 명령과 ABI-encoded arguments를 출력합니다. key가 있으면 검증을 시도하고 실제 결과를 확인합니다. API key를 source control에 추가하지 않습니다.

Exchange constructor는 `(address merchant, address verifier, address registry)`입니다. Token constructor는 `(string label, string symbol, address exchange)`이며 label은 `Aurora`, `Nova`, `Orbit`이고 symbol은 `dAUR`, `dNOVA`, `dORB`입니다. 전체 token 이름은 계약에서 `AgentProof Demo ` 접두사를 붙입니다. compiler 0.8.30, optimizer 200 runs, via-IR, Cancun, 의존성 커밋을 배포 빌드와 맞춥니다. 주소나 bytecode가 조회되는 것만으로 source verification을 완료라고 표시하지 않습니다.

## 최종 수동 체크리스트

- [ ] 기존 Agent ID·root agentURI·runtime state 보존 및 공개 card 일치
- [ ] Exchange 배포 receipt, owner, trusted verifier, registry
- [ ] DemoToken 3개 배포 receipt 및 초기 inventory
- [ ] 활성 listings, 기본 가격·score·decimals
- [ ] 현재 Agent owner가 execution metadata 승인
- [ ] 갱신된 signed card를 기존 공개 URL에 게시
- [ ] 사용자 예산 예치 receipt 및 policy·허용 token receipts
- [ ] execution wallet Sepolia gas 잔액
- [ ] 모든 실제 Authentication 결과와 증거 라벨
- [ ] `VERIFIED + ALLOW`, 필요하면 정확한 일회성 human approval
- [ ] 실제 purchase transaction, receipt, block, event
- [ ] 사용자 token 잔액 증가와 deposit 감소
- [ ] 감사 trace 및 Etherscan 링크 대조
- [ ] replay·정책 취소·gas 부족 실패에서 불필요한 transaction 미제출
- [ ] source verification 실제 결과 또는 미수행 표시

이 체크리스트는 사용자 수행용입니다. 코드 구현 또는 Anvil 통과만으로 항목을 자동으로 완료 표시하지 않습니다.
