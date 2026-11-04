# Deterministic trading authorization

`VERIFIED / PARTIAL / REJECT`는 신원 판정이다. `ALLOW / ASK / DENY`는 사용자가 부여한 지출 권한의 판정이며 별도 `RuleBasedAuthorization`이 계산한다. 기존 `UnimplementedAuthorization`과 KRW mock API는 보존하며 실제 spending 권한을 부여하지 않는다.

## 정책 원본

User MetaMask가 `configurePolicy` 및 `setTokenAllowed`를 직접 호출한다. Agent·UI가 임의 JSON을 보내서 정책을 변경할 수 없다. verifier는 현재 Exchange의 policy·허용 token·deposit·spent를 읽고 오프체인 `TradeAuthorizationPolicy`로 정규화한다. `policyHash`는 `policyHash` 필드 자체를 제외한 canonical JSON의 SHA-256이다. 정책 변경·허용 token 변경·pause·revoke마다 contract `policyVersion`이 증가한다.

정책은 buyer, agent identity, execution wallet, chain, exchange, 허용 token, buyEnabled, 1회 최대 금액, 자동승인 기준, 총 사용 한도, 누적 spent, 만료, active/revoked 상태를 포함한다. `totalBudgetLimitWei`는 설정 변경마다 초기화되는 예산이 아니라 **누적 사용액을 포함하는 한도**다. 기존 `spentWei`는 재설정되지 않으므로, 예산을 추가하려면 누적 사용액을 감안한 새 한도를 설정한다. 예치는 사용 한도를 자동으로 늘리지 않는다.

## 판정 순서

| 조건 | 판정 |
|---|---|
| Authentication이 VERIFIED가 아니거나 만료 | DENY |
| 정책 없음·잘못된 schema/hash·취소·정지·만료 | DENY |
| chain·exchange·buyer·agent ID/registry·executor 불일치 | DENY |
| 허용되지 않은 token, buy 비활성 | DENY |
| intent 만료 또는 현재 가격이 서명된 최대 비용 초과 | DENY |
| 1회 한도 또는 `min(총한도−spent, 예치 잔액)` 초과 | DENY |
| 현재 비용이 자동승인 기준 이하 | ALLOW |
| 자동승인 기준 초과이고 나머지 조건 충족 | ASK |
| 정확한 거래에 대한 유효한 buyer 서명 후 모든 조건 재검사 성공 | ALLOW |

허용 여부를 LLM에 맡기지 않는다. schema의 금액은 decimal integer string이며 비교·수량 계산은 bigint이다. token 가격의 소수 wei 비용은 올림하여 무료 fractional-token 구매를 막는다.

## 두 개의 EIP-712 서명

공통 domain은 `name: AgentProofDemoExchange`, `version: 1`, `chainId`, `verifyingContract`다. chain 11155111(Sepolia) 및 자동 테스트의 localhost 31337(Anvil)만 사용한다.

`ExecutionAuthorization` 필드는 계약과 Node helper에서 순서 및 타입이 일치한다.

| 필드 | 타입 |
|---|---|
| registry, agentOwner, executionWallet, buyer, token | address |
| agentId, quantity, maxTotalCostWei, policyVersion | uint256 |
| evidenceHash, traceId, nonce | bytes32 |
| issuedAt, expiresAt | uint64 |

chain과 Exchange는 EIP-712 domain에 포함된다. `traceId`는 문자열 trace ID의 SHA-256 bytes32이며 evidence hash는 Authentication 결과에 연결된다. 승인은 기본 90초, 계약의 절대 최대 TTL은 120초이고 Authentication·intent보다 오래 유효할 수 없다. 다른 token, 수량, user, agent, owner, nonce, policyVersion, chain 또는 Exchange로 바꾸면 서명이 유효하지 않다.

`HumanApproval(bytes32 executionHash)`는 위 **전체 ExecutionAuthorization의 EIP-712 digest**를 포함한다. ASK 시 verifier는 unsigned authorization을 먼저 고정하고 buyer MetaMask에 이 digest를 제시한다. 사람 서명 후에도 최초 인증표의 유효성, 동일한 공개 card, 현재 registry owner·metadata, 활성 registration, 정책·가격·잔액·만료를 다시 확인한다. 같은 authorization에만 verifier가 서명하며, 새로운 evidence/nonce/action으로 바뀌면 사람의 이전 서명을 재사용하지 못한다. 만료되었으면 새 intent 및 인증·승인을 시작한다.

Verifier는 `PARTIAL / REJECT / ASK / DENY`에 execution signature를 발급하지 않는다. 인증표의 일회성 소비와 영속 issuance 상태가 재발급을 막고, Exchange의 `usedNonces`가 온체인 replay를 막는다. 자동승인 기준을 넘는 구매는 contract에서도 buyer 서명이 필요하므로 backend를 직접 우회할 수 없다.

## 온체인 집행

Exchange는 trusted verifier, sender=executor, registry, policy owner·agent·version, nonce, 시간, token listing·허용 상태, 수량·inventory, 최대 비용·1회 한도·총한도·예치액, 현재 ERC-8004 owner 및 execution-wallet metadata를 검사한다. 검사 후 nonce와 예산·spent·수익을 갱신하고 `SafeERC20`로 사용자에게 토큰을 전송한 뒤 event를 발생시킨다. `ReentrancyGuard` 및 Checks-Effects-Interactions를 적용하고 generic calldata executor는 제공하지 않는다.

정책 정지·취소와 Exchange pause는 새 구매를 막는다. 사용자는 Exchange가 pause된 상태에서도 미사용 예산을 회수할 수 있다. 운영자는 사용자 예치금을 merchant proceeds로 출금할 수 없다.

실행 승인 `issuedAt`은 wall-clock과 최신 블록 timestamp 중 작은 값으로 설정합니다. 60초 이상 오래된 RPC head는 거절합니다. 최신 블록에서의 `eth_call`이 아직 오지 않은 발급시각으로 거래를 거절하는 것을 방지하며, expiresAt은 이 시각부터 최대 90초이고 Authentication·intent보다 늦을 수 없습니다. 컨트랙트의 절대 TTL 상한은 120초입니다.
