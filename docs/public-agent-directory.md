# Public Agent Directory

GitHub Pages의 루트는 여러 Agent를 탐색하는 공개 디렉터리입니다. `site/agents.json`이 카드, 역할 필터, 검색, 외부 탐색기 링크의 단일 데이터 원본입니다.

## 현재 PM Agent

PM의 ERC-8004 `agentURI`는 이미 다음 경로로 Sepolia에 기록되어 있으므로 이동하지 않습니다.

```text
https://psj224535.github.io/Agent-proof/.well-known/agent-registration.json
```

PM의 8004scan 링크는 다음과 같습니다.

```text
https://testnet.8004scan.io/agents/sepolia/10854
```

## 새 Agent 경로

새 역할은 고유한 소문자 `slug`를 사용합니다. 예를 들어 QA Agent라면 다음 구조를 권장합니다.

```text
site/
  agents.json
  agents/
    qa/
      .well-known/
        agent-registration.json
        agent-card.json
      logo.svg
```

이 Agent의 등록 URI는 다음처럼 기존 PM과 겹치지 않아야 합니다.

```text
https://psj224535.github.io/Agent-proof/agents/qa/.well-known/agent-registration.json
```

1. inactive placeholder Registration JSON을 위 경로에 먼저 배포합니다.
2. 별도의 상태 디렉터리와 공개 origin으로 Sepolia 등록을 실행합니다.
3. 실제 `agentId`가 생성되면 최종 Registration JSON과 Agent Card를 같은 경로에 배포합니다.
4. `site/agents.json`에 아래 형식의 항목을 추가합니다.

```json
{
  "slug": "qa",
  "name": "QA Agent",
  "role": "QA",
  "description": "테스트 역할 설명",
  "image": "agents/qa/logo.svg",
  "status": "registered",
  "active": true,
  "network": "Ethereum Sepolia",
  "chainId": 11155111,
  "chainSlug": "sepolia",
  "agentId": "새 Agent ID",
  "owner": "0x...",
  "registry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  "services": ["A2A", "Web"],
  "registrationUrl": "agents/qa/.well-known/agent-registration.json",
  "cardUrl": "agents/qa/.well-known/agent-card.json",
  "scanUrl": "https://testnet.8004scan.io/agents/sepolia/새 Agent ID",
  "explorerUrl": "https://sepolia.etherscan.io/nft/0x8004A818BFB912233c491871b3d84c89A494BD9e/새 Agent ID"
}
```

`slug`, `(chainId, registry, agentId)`, Registration JSON 경로는 Agent마다 고유해야 합니다. 아직 온체인 등록 전인 항목은 `status: "draft"`, `active: false`로 표시하고 `agentId`, `scanUrl`, `explorerUrl`은 비워 둘 수 있습니다.

## 배포

```sh
git add site docs/public-agent-directory.md
git commit -m "Add Agent to public directory"
git push origin main
```

Pages 배포 후 루트 디렉터리, Agent의 두 공개 문서, 8004scan 직접 링크를 각각 확인합니다. GitHub Pages 배포 자체는 온체인 트랜잭션이 아닙니다. 새로운 Agent 등록이나 런타임 키 해시 변경만 MetaMask 서명과 Sepolia 가스가 필요합니다.
