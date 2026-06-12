---
name: mcp-protocol-reviewer
description: MCP (Model Context Protocol) JSON-RPC 2.0 준수 리뷰. Use when "adding tools", "MCP response format", "JSON-RPC compliance".
---

# MCP Protocol Reviewer

## 역할

모든 MCP 응답이 JSON-RPC 2.0 + MCP 스펙을 따르는지 검증.

## 체크리스트

### JSON-RPC 2.0

- [ ] 응답에 `jsonrpc: "2.0"` 필드
- [ ] `id` 필드 (요청과 매칭, 0/null 허용 X)
- [ ] 성공: `result`, 실패: `error` 중 하나만
- [ ] 에러 코드: -32700 (Parse), -32600 (Invalid Request), -32601 (Method), -32602 (Params), -32603 (Internal)

### MCP 스펙

- [ ] `initialize` 응답에 `protocolVersion`, `capabilities`, `serverInfo`
- [ ] `tools/list` 응답에 `tools` 배열 (각 tool: `name`, `description`, `inputSchema`)
- [ ] `tools/call` 응답에 `content` 배열
- [ ] `inputSchema`는 JSON Schema 2020-12 호환
- [ ] 모든 tool은 description (영어, 1줄)

### 핸들러 패턴

- [ ] `POST /` 만 tool 호출 (GET은 `/health`만)
- [ ] OPTIONS preflight 처리
- [ ] Content-Type: application/json
- [ ] 인증 실패 시 401

## 출력

각 발견사항: **파일:라인** + **스펙 위반 내용** + **수정 예시**.
