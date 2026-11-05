# Trading demo scenarios

실행 준비와 지갑 단계는 [Sepolia trading runbook](../sepolia-trading-runbook.md)에 있습니다. 자동 테스트는 Anvil에서만 실행하며 Sepolia MetaMask 시연은 별도입니다.

## 성공: 최고 demoScore 구매

기본 token은 dAUR 82, dNOVA 91, dORB 76입니다. 모두 허용하고 각 가격이 0.0001 Sepolia ETH인 상태에서, 사용자 예산 0.001 ETH·1회 한도 0.0002 ETH·자동승인 기준 0.0002 ETH를 설정합니다.

“내 예산 안에서 가장 오를 가능성이 높은 테스트 코인을 사줘.”를 입력합니다. Agent는 dNOVA 2개를 선택하고 intent에 서명합니다. UI에서 `Authentication: VERIFIED`, `Authorization: ALLOW`, 실제 receipt 확인 후 `TRADE CONFIRMED`를 확인합니다. 첫 구매라면 `0 → 2 dNOVA`, 예산 `0.001 → 0.0008 ETH`가 됩니다. 선택 점수는 합성 데이터이며 실제 투자 전망이나 금융 조언이 아닙니다.

각 필터는 실제 서버 진행 이벤트로 Waiting/Checking/Pass/Partial/Fail/Error를 표시합니다. 임의 지연이나 애니메이션을 성공 증거로 사용하지 않습니다. 원본 source·block/time·reason code·input/output hash는 상세 보기로 확인합니다.

## ASK: 정확한 거래 한 번 추가승인

정책의 자동승인 기준을 0.0001 ETH, 1회 한도를 0.0002 ETH로 설정합니다. 같은 구매는 신원 인증 후 `ASK`가 됩니다. 이 시점에는 execution signature와 구매 transaction이 없어야 합니다. User MetaMask로 `HumanApproval`에 서명하고, 재검사 후 `ALLOW`와 실제 구매 receipt를 확인합니다. 한 번 쓴 nonce·사람 서명은 다른 거래에 사용할 수 없습니다.

## 실패 시나리오

| 조작 또는 상태 | 기대 결과 |
|---|---|
| Agent ID·runtime signature·카드 내용 위조 | REJECT, execution signature 없음 |
| registry/RPC/card 출처 확인 불가 | PARTIAL 또는 명시적 ERROR, transaction 없음 |
| policy 취소·정지·만료, buy OFF | DENY |
| 허용 token 없음 | 선택 실패, transaction 없음 |
| 가격 인상으로 maxTotalCost 초과 | DENY 또는 제출 직전 simulation 거부 |
| 잔여 정책 예산/예치금 부족 | DENY |
| executor gas 부족 | `AGENT_EXECUTOR_GAS_INSUFFICIENT`, 제출하지 않음 |
| 현재 owner 또는 execution metadata 변경 | 재인증 필요, 과거 승인은 contract에서도 거부 |
| 다른 Exchange·chain·token·quantity에 서명 재사용 | EIP-712 검증 실패 |
| 사용한 authorization nonce replay | contract revert / 사전 simulation 거부 |
| 사람이 MetaMask 추가승인 거절 | ASK 유지 또는 사용자 거절 표시, 구매 없음 |
| 방송 뒤 RPC 응답 유실 | 성공·실패 단정 금지, 저장 hash reconcile |

Anvil에서 두 번의 실제 구매, replay 차단, REJECT/PARTIAL 및 정책 위반 흐름의 transaction 미제출을 자동 검증합니다. 공식 Sepolia와 MetaMask UI에서도 동일한 결과인지 수동 체크해야 합니다. 기존 simulator 공격 버튼과 KRW mock-purchase는 유지되며 실제 지출하지 않는 별도 경로입니다.
