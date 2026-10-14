# AgentProof — authentication development demo

**실제 실행·테스트한 로컬 인증 데모입니다. 명세의 전체 완료 조건을 충족한 운영용 MVP는 아닙니다.**

KAIST CS40008 프로젝트를 위한 독립형 구현입니다. 기존 저장소가 제공되지 않아 새 디렉터리에 작성했으며 기존 보고서나 사용자 파일을 수정하지 않았습니다. 외부 Agent가 제출한 정보를 그대로 믿지 않고, 별도의 출처에서 조회한 정보와 현재 요청의 암호학적 증명을 순차 검증합니다.

## 실제 Ethereum Sepolia 모드

로컬 시뮬레이터와 별도로, 공식 ERC-8004 IdentityRegistry를 사용하는 Sepolia 모드가 구현되어 있습니다. MetaMask가 모든 쓰기 트랜잭션을 직접 서명하며 서버는 개인키나 시드 문구를 요구하지 않습니다.

```sh
npm install --prefix integrations
npm run start:sepolia
```

- Registration console: `http://127.0.0.1:3100`
- Verifier dashboard: `http://127.0.0.1:3101`
- Public agent site: `https://psj224535.github.io/Agent-proof/`
- Configured owner: `0x422A6dDB79F4a13B58f7aAedD92f464c3e1e70A9`
- Ethereum Sepolia IdentityRegistry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`

공개 사이트는 `site/agents.json`을 읽는 다중 Agent 디렉터리입니다. PM 카드에서 8004scan Testnet, Sepolia Etherscan, Registration JSON, A2A Agent Card를 바로 확인할 수 있습니다. 새 역할 Agent의 권장 문서 경로와 카탈로그 추가 형식은 `docs/public-agent-directory.md`를 참조하십시오. 이미 온체인에 기록된 PM의 루트 `agentURI`는 변경하지 않습니다.

등록 콘솔에서 MetaMask를 연결하면 다음 두 건을 순서대로 승인합니다.

1. `register(agentURI)` — 공개 GitHub Pages registration JSON을 ERC-8004 agent NFT에 연결
2. `setMetadata(agentId, "agentproof.runtimeBinding.v1", bytes32)` — AgentProof 런타임 키 연결 해시를 온체인에 고정

첫 트랜잭션이 확정되면 콘솔이 실제 `agentId`가 포함된 `site/.well-known/agent-registration.json`과 서명된 A2A Agent Card를 생성합니다. 이 두 파일을 commit/push하고 Pages 배포가 끝난 뒤 콘솔의 **공개 상태 확인**과 **인증 요청 보내기**를 실행합니다. Etherscan과 8004scan 링크도 콘솔에 표시됩니다. 자세한 순서와 장애 복구 방법은 `docs/sepolia-runbook.md`에 있습니다.

Sepolia 모드는 실체인 증거를 사용하지만 테스트넷입니다. 결과의 `assuranceProfile`은 `SEPOLIA_TESTNET`이며 메인넷 신원, 기업 KYC, Visa 인증 또는 실제 결제를 뜻하지 않습니다. 공개 문서는 GitHub Pages의 HTTPS/TLS로 전송되고, localhost 화면은 같은 컴퓨터에서만 쓰는 제어 UI입니다.

## 바로 실행

테스트 환경은 Node.js **22.16.0**입니다. Node 22.16 이상에서 네이티브 TypeScript stripping과 SQLite를 사용합니다. 다른 버전에서의 호환성은 별도 검증하지 않았습니다. 기본 데모에는 `npm install`, Docker, 지갑, API 키가 필요 없습니다.

```sh
cd agentproof-mvp
node --version
npm start
```

실행한 터미널은 유지합니다. 다른 터미널에서 관리자 토큰을 확인합니다.

```sh
cd agentproof-mvp
npm run admin-token
```

- Agent Portal: `http://127.0.0.1:3000`
- Verifier Dashboard: `http://127.0.0.1:3001`

Agent Portal의 **테스트 에이전트 준비** 버튼을 누른 다음, **정상 요청**을 실행합니다. 문서 생성·독립 등록부 등록·여권 생성·테스트 회사 자료 발급·요청 서명·검증·인증표 발급·보호 API 접근을 확인할 수 있습니다. 공격 시나리오도 버튼으로 실행합니다. Dashboard에는 관리자 토큰을 입력합니다. 토큰은 화면 메모리에만 보관하며 새로고침하면 다시 입력해야 합니다.

> 실행 로그의 TypeScript/SQLite experimental 경고는 사용한 Node 버전의 API 상태를 알리는 메시지입니다. 외부에 서버를 공개하지 마십시오. 네 프로세스가 localhost에서 동작하고 전체 결과에 `DEVELOPMENT_MINIMAL`이 표시됩니다.

## 실행되는 구성

| 구성 | 포트 | 역할 |
|---|---:|---|
| Agent Portal + Agent Service | 3000 | Agent 준비, 문서 게시, 서명, 13개 시나리오 |
| Verifier Dashboard + Verifier Service | 3001 | 5개 필터, 관리자 설정, 판정, 단기 인증표, 감사 기록 |
| Registry simulator | 3002 | 독립적인 개발용 소유권·URI·키 연결 원본 |
| Test company issuer | 3003 | 테스트 회사 자료와 서명된 상태 응답 |

`ERC-8004 → A2A → APS → Company → TAP → Final Decision` 순서로 검사합니다. 모든 조건을 만족한 개발 요청의 `verdict`는 `VERIFIED`일 수 있지만, 실제 체인/KYC를 확인했다는 뜻은 아닙니다. `assuranceProfile`은 언제나 `DEVELOPMENT_MINIMAL`, 실제 활성화 조합은 별도 `policyProfile`입니다.

단기 인증표는 최대 5분이며 현재 서명 요청·Agent key·audience·설정 버전에 연결됩니다. 보호 API에는 추가 서명과 동일 구매 payload가 필요하고 인증표는 한 번만 사용할 수 있습니다. Agent 시나리오는 인증 직후 자동으로 모의 API를 호출하므로 결과 화면의 인증표는 이미 사용된 상태일 수 있습니다.

**실제 결제, 실제 구매 실행, 사용자 예산/상품 정책 검사는 하지 않습니다.** `executed`, `paymentExecuted`, `policyEvaluated`는 모두 `false`입니다.

## 테스트

```sh
npm test
# npm start가 실행 중인 다른 터미널에서:
npm run test:e2e
```

이번 환경에서 핵심/보안/Sepolia calldata/공개 Agent 카탈로그 자동 테스트 51개 및 기존 실제 HTTP 통합 점검 20개가 통과했습니다. 최종 실행 기록은 `docs/testing/results.md`를 참조하십시오. HTTP 통합 테스트는 로컬 테스트 데이터와 필터 설정을 변경합니다. 운영 데이터에 실행하지 마십시오.

선택적 타입 검사 도구 설치:
```sh
npm install --prefix tools/typecheck
npm run typecheck
```

오프라인 UI 렌더링 점검은 통과했으며 `docs/demo/screenshots/`에 예시 화면이 있습니다. 이는 기록된 모의 응답으로 UI만 점검한 결과입니다.

실제 브라우저 E2E 스크립트는 `scripts/browser-smoke.py`에 있습니다. Python Playwright와 Chromium이 필요합니다. 이 환경에서는 localhost 브라우저 접속이 정책에 막혀 실제 브라우저 E2E 통과를 확인하지 못했습니다.

## 명세 대비 중요한 차이

| 명세 요구 | 이번 제공 상태 |
|---|---|
| 실제 Anvil 등록/조회 및 Sepolia 시연 | Sepolia reader·MetaMask 등록 UI·실체인 verifier 구현 및 read-only 기동 검증 완료. 실제 쓰기 트랜잭션은 owner가 MetaMask에서 승인해야 완료 |
| PostgreSQL replay 영속 저장 | 기본 데모는 **파일 기반 SQLite**. PostgreSQL 어댑터는 작성했으나 실제 DB 연결 미검증 |
| Next.js, Fastify/Nest, Zod, Vitest | 네이티브 Node HTTP, 정적 HTML/JS, 제한형 JSON Schema validator, node:test로 대체 |
| 공식 ERC-8004 reference contract 버전 고정 | ABI 부분집합만 제공. reference 구현 커밋 고정·배포는 아직 필요 |
| 두 웹 앱/서버 독립 실행 | 구현. 다만 같은 OS 사용자이므로 강한 파일시스템 격리는 미구현 |
| 5개 필터·설정·감사·단기 인증표 | 로컬 모의 출처 기반으로 구현 및 테스트 |
| 모든 API의 Zod/OpenAPI | Zod 미사용. 주요 API OpenAPI 명세와 엄격한 입력 검증 제공; 전체 외부 규격 validator는 아님 |
| 실제 기업 확인/정식 Visa 인증 | 명세대로 범위 밖. 항상 테스트·simulation으로 표시 |

상세 차이·완료 조건별 상태: `docs/implementation-status.md`.

## 파일과 비밀값

처음 실행할 때 `.state/` 아래 역할별 키·관리자 토큰·DB가 생성됩니다. private key는 소스/ZIP에 없고, 서버 파일 권한은 가능한 곳에서 `0600`, 디렉터리는 `0700`으로 제한합니다. 브라우저 localStorage에는 저장하지 않습니다. 이 데모는 암호화된 키 저장소나 KMS를 구현하지 않습니다.

**`.state/`, `.env`, DB, 로그, 관리자 토큰을 Git이나 공개 장소에 올리지 마십시오.** 개발 초기화가 필요하면 서버를 종료한 뒤 `.state`를 다른 이름으로 옮기고 재실행합니다. 일부 역할의 키만 삭제하면 trust store 불일치로 시작을 거부합니다.

```sh
# 서버를 종료한 후, 기존 상태를 보존하며 새 데모 시작:
mv .state .state-backup
npm start
```

`.env.example`의 포트/필터 초기값은 `.env`에 복사해 설정할 수 있습니다. 기존 DB의 관리자 설정은 초기 환경변수보다 우선합니다. `NODE_ENV=production` 또는 배포용 사용은 지원하지 않습니다.

## 다음 통합 작업

우선순위는 `MetaMask에서 실제 두 트랜잭션 승인 및 Pages 최종 문서 배포 → PostgreSQL 통합 테스트 → 프로세스별 OS/컨테이너 격리 → 외부 표준 호환 벡터 및 브라우저 E2E`입니다. `integrations/README.md`, `contracts/README.md`, `docs/threat-model/threat-model.md`에 필요한 작업을 분리했습니다.
