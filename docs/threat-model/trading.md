# Trading threat model and remaining limits

이 구현은 Sepolia 테스트 자산 전용 개발 데모다. 독립 보안 감사·운영 적합성·실제 기업 KYC·Visa 인증을 주장하지 않는다. Anvil 시험 결과는 공식 Sepolia registry의 실제 쓰기 검증을 대신하지 않는다.

## 보호하는 경계

| 공격 / 오류 | 방어 및 관측 결과 |
|---|---|
| REJECT·PARTIAL 또는 꺼진 필터로 spending 시도 | trading verifier가 필수 identity 모듈 PASS와 VERIFIED trace를 요구하며 RuleBasedAuthorization 및 signing gate에서 거부 |
| 다른 agent·executor·buyer·token·quantity로 교체 | intent schema·HTTP signature·ticket action hash·EIP-712 및 contract policy 일치 검사 |
| 소유권 이전 후 과거 승인 사용 | verifier 재조회 및 contract `ownerOf(agentId)` 재확인 |
| execution metadata 변경 | canonical `abi.encode(address)` 비교를 verifier와 contract에서 수행 |
| stale card·비활성 registration | 공개 HTTPS 원본 재조회, 인증 당시 card hash 비교, active 및 만료 확인 |
| 인증·intent·execution authorization 만료 | 각각의 만료 검사, 실행 승인 120초 상한 |
| nonce replay·중복 클릭·재발급·재시작 | 지속되는 인증표/issuance 상태, onchain `usedNonces`, 직렬화된 제출, 방송 전 hash 저장 |
| 다른 chain·Exchange에서 signature 재사용 | EIP-712 domain, RPC chain ID, Exchange bytecode·registry 검증 |
| 가격 인상·한도 초과·취소된 정책·허용되지 않은 token | verifier 현재 상태 재조회, contract quote·정책·policyVersion·예산 검사 |
| 자동승인 기준을 넘는 direct contract call | exact authorization digest에 대한 buyer 서명을 contract에서도 검증 |
| 임의 verifier 서명 | contract의 `trustedVerifier`와 복구된 signer 비교 |
| reentrancy | nonReentrant, nonce/예산 선갱신, SafeERC20 및 부정 테스트 |
| 관리자 함수 오용 | 준비 API의 owner 확인과 contract `onlyOwner`; 관리 변경도 MetaMask 승인 |
| 조작한 receipt·RPC reorg·다른 calldata | RPC로 receipt/transaction/canonical block/event를 교차 확인; balance 재조회 |
| SSRF·오프체인 endpoint 교체 | 기존 SafeFetcher 및 독립 registry→registration→card 조회 경계 유지 |
| 사용자 키 유출 | 사용자·merchant는 MetaMask에서 서명; 서버는 그들의 개인키/seed를 받지 않음 |
| runtime 키와 EVM 키 혼동 | 별도 키·metadata·card extension; runtime Ed25519를 Ethereum signer로 사용하지 않음 |
| private key·인증표·signature·admin token 로그 유출 | 역할별 0700/0600 파일, 공개 evidence 필터, 제한된 감사 payload |

## 신뢰하는 구성

Verifier가 모든 인증 판단에 대해 완전히 trustless인 시스템은 아니다. 악성 trusted verifier는 허위 신원 증명에 서명할 수 있다. Exchange는 그 경우에도 사용자 정책·예산·executor·현재 owner/metadata·nonce·사람 승인 조건을 집행하지만, 상세 A2A/APS/company/TAP 의미를 Solidity에서 모두 검증하지 않는다. Verifier rotation은 owner만 할 수 있고 event를 남긴다.

Merchant는 listing 가격·점수·활성 상태와 trusted verifier를 바꿀 수 있다. maxTotalCostWei, 사용자 token allowlist와 정책 한도가 이러한 변경의 지출 범위를 제한한다. demoScore는 Merchant가 설정하는 합성 데이터이며 투자 예측 또는 신뢰 등급이 아니다. fixed-supply DemoToken은 추가 mint가 없다. 임의 토큰의 경제적 안전성을 검증하는 거래소는 아니다.

RPC 응답을 교차 검증하지만 단일 RPC 제공자가 일관된 거짓 chain history를 제공하는 상황을 해결하는 light client는 아니다. 중요 운영 환경에는 독립 RPC quorum·finality/reorg 정책이 필요하다. 현재 한 confirmation 기반 UX는 Sepolia 데모 기준이며 깊은 재조직 가능성을 없애지 않는다.

오프체인 자료의 상태를 Solidity가 실시간으로 읽을 수는 없습니다. 서버는 제출 직전 다시 확인하지만, 이미 발급된 서명은 만료 또는 온체인 정책 취소까지의 짧은 신뢰 구간을 가집니다. 오프체인 card/회사자료 변경을 즉시 집행해야 하면 policy revoke/pause 또는 verifier rotation을 함께 수행해야 합니다.

서명 후 transaction 제출 사이의 정책·가격 변경은 contract가 최종 차단한다. 따라서 정상 사전 검사 뒤에도 revert할 수 있고 executor gas가 발생할 수 있다. 방송 이후 응답 유실은 '거래 없음'으로 표시하지 않고 **상태 불확실, 기존 hash 재조회 필요**로 처리한다. transaction에 쓰인 gas는 구매 예산 환불 대상이 아니다.

## 개발환경 제한

- 같은 OS 사용자 아래의 별도 프로세스·디렉터리는 강한 격리가 아니다. 다른 로컬 프로세스나 같은 UID가 키 파일에 접근할 수 있다. 운영은 역할별 UID/컨테이너·최소 권한 mount·KMS/HSM·key rotation 절차가 필요하다.
- 로컬 secp256k1 키는 평문 파일로 제한된 권한에 저장된다. 암호화된 운영 key vault가 아니다. verifier key에는 자금을 보관하지 않는다.
- 신뢰된 로컬 개발자만 localhost UI를 사용해야 한다. 공개 인터넷 서비스의 계정·세션·rate limit·조직별 권한 경계와 고가용성은 범위 밖이다.
- audit hash chain은 변조 탐지를 돕지만 로컬 저장소 전체를 수정할 수 있는 운영자에 대한 외부 불변 증명을 제공하지 않는다. 운영에는 원격 append-only 보존, 백업, 보존·삭제·접근 정책 및 별도 anchor가 필요하다.
- Anvil은 실제 EVM 거래를 실행하지만 ERC-8004 registry와 문서 fetcher는 테스트 fixture다. 공식 registry compatibility와 Sepolia transaction은 수동 runbook으로 별도 확인한다.
- MetaMask·실제 Sepolia deployment/purchase·공개 card 게시가 완료되지 않은 상태를 성공으로 보고하지 않는다. 현재 사용자 승인 및 원래 Agent runtime state 복원이 필요할 수 있다.

즉시 중지 순서는 사용자 policy pause/revoke, 필요 시 Merchant exchange pause, verifier 교체이며 미사용 사용자 예산 출금은 pause 중에도 가능하다. 키 노출 시 단순 서버 재시작으로 문제가 해결되지 않는다. 해당 execution-wallet metadata·정책·trusted verifier를 적절히 갱신하고 기존 승인 만료 및 audit를 확인해야 한다.
