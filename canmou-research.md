# OpenClaw API 调研：获取 Agent 状态

> 调研时间：2026-03-26  
> 来源：OpenClaw CLI 帮助文档 + Gateway RPC + 官方文档 https://docs.openclaw.ai

---

## 一、sessions_list API

### 用途
列出当前 Agent 下的所有会话（sessions），返回结构化的会话列表。

### 工具名称
`sessions_list`（作为 AI Tool 调用）

### 参数（Parameters）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `kinds` | `string[]` | 否 | 过滤类型：`"main" \| "group" \| "cron" \| "hook" \| "node" \| "other"` |
| `limit` | `number` | 否 | 最大行数（默认服务器上限，如 200） |
| `activeMinutes` | `number` | 否 | 仅返回 N 分钟内有更新的会话 |
| `messageLimit` | `number` | 否 | 0=不返回消息（默认）；>0=包含每条会话最近 N 条消息 |

### 返回数据格式（Row Shape）

```json
{
  "key": "agent:main:subagent:uuid-xxx",       // 会话唯一 key
  "kind": "main | group | cron | hook | node | other",
  "channel": "whatsapp | telegram | discord | signal | imessage | webchat | internal | unknown",
  "displayName": "xxx",                        // 群组显示名（如有）
  "updatedAt": 1774489747614,                 // 更新时间（毫秒）
  "sessionId": "uuid-xxx",                     // 会话 ID
  "model": "MiniMax-M2.7",
  "contextTokens": 200000,
  "totalTokens": 170234,
  "thinkingLevel": "low",
  "verboseLevel": null,
  "systemSent": true,
  "abortedLastRun": false,
  "sendPolicy": "allow | deny",
  "lastChannel": "feishu",
  "lastTo": "ou_xxx",
  "deliveryContext": { "channel": "feishu", "to": "ou_xxx", "accountId": "default" },
  "transcriptPath": "/root/.openclaw/agents/main/sessions/transcripts/uuid.json",
  "messages?": [...]                           // 仅当 messageLimit > 0 时返回
}
```

### CLI 用法

```bash
# 列出当前 agent 所有会话
openclaw sessions

# JSON 格式输出
openclaw sessions --json

# 仅查看最近 2 小时有活动的会话
openclaw sessions --active 120

# 查看指定 agent 的会话
openclaw sessions --agent canmou

# 跨所有 agent 聚合会话
openclaw sessions --all-agents
```

### 代码示例（Gateway WebSocket RPC）

```bash
openclaw gateway call sessions.list --json --params '{}'
```

---

## 二、sessions_history API

### 用途
获取某个会话的完整对话记录（transcript）。

### 工具名称
`sessions_history`

### 参数（Parameters）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessionKey` | `string` | 是 | 会话 key（如 `agent:main:subagent:uuid`）或 `sessionId` |
| `limit` | `number` | 否 | 最大消息数（服务器限制） |
| `includeTools` | `boolean` | 否 | 是否包含 toolResult 消息（默认 false） |

### 返回数据格式

```json
{
  "sessionKey": "agent:main:subagent:uuid-xxx",
  "messages": [
    {
      "role": "user",
      "content": "...",
      "ts": 1774489716321
    },
    {
      "role": "assistant",
      "content": "...",
      "ts": 1774489716400
    },
    {
      "role": "toolResult",
      "content": "...(已过滤，默认不返回)...",
      "toolUseId": "xxx"
    }
  ]
}
```

### HTTP API（Control UI / Gateway Clients）

```
GET /sessions/{sessionKey}/history
Query params: limit, cursor, includeTools=1, follow=1

# SSE 实时跟踪（follow=1 升级为 SSE 流）
GET /sessions/{sessionKey}/history?follow=1
```

### WebSocket API

```javascript
// 订阅所有会话生命周期和 transcript 事件
{ "method": "sessions.subscribe" }

// 订阅单个会话的 message 事件
{ "method": "sessions.messages.subscribe", "params": { "key": "agent:main:subagent:uuid" } }

// 取消订阅
{ "method": "sessions.messages.unsubscribe", "params": { "key": "agent:main:subagent:uuid" } }
```

---

## 三、sessions_send API

### 用途
向另一个会话发送消息（用于 Agent 间通信）。

### 工具名称
`sessions_send`

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessionKey` | `string` | 是 | 目标会话 key 或 sessionId |
| `message` | `string` | 是 | 发送的消息内容 |
| `timeoutSeconds` | `number` | 否 | 等待回复超时（默认>0；0=发完即弃） |

### 返回数据格式

```json
// 同步等待模式（timeoutSeconds > 0）
{
  "runId": "uuid-xxx",
  "status": "ok",
  "reply": "回复内容"
}

// 超时（继续运行中）
{
  "runId": "uuid-xxx",
  "status": "timeout",
  "error": null
}

// 运行出错
{
  "runId": "uuid-xxx",
  "status": "error",
  "error": "错误描述"
}
```

### 行为说明
- `timeoutSeconds = 0`：入队后立即返回 `{ runId, status: "accepted" }`
- Agent 间消息会注入上下文
- 支持 Reply-back 轮询机制（最多 5 轮，可配置）
- 发送完成后可选择性 Announcement 到目标 Channel

---

## 四、sessions_spawn API

### 用途
在独立会话中启动一个子 Agent（subagent）。

### 工具名称
`sessions_spawn`

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task` | `string` | 是 | 分配给子 Agent 的任务描述 |
| `runtime` | `string` | 否 | `"subagent"`（默认）或 `"acp"` |
| `label` | `string` | 否 | 日志/UI 显示标签 |
| `agentId` | `string` | 否 | 目标 Agent ID（subagent runtime 下） |
| `model` | `string` | 否 | 覆盖子 Agent 模型 |
| `thinking` | `string` | 否 | 覆盖 thinking 级别 |
| `runTimeoutSeconds` | `number` | 否 | 超时自动中止（默认=0=不限） |
| `thread` | `boolean` | 否 | 请求线程绑定路由（默认 false） |
| `mode` | `string` | 否 | `"run"`（默认）或 `"session"` |
| `cleanup` | `string` | 否 | `"keep"`（默认）或 `"delete"` |
| `sandbox` | `string` | 否 | `"inherit"`（默认）或 `"require"` |
| `attachments` | `array` | 否 | 内联文件附件 |

### 返回数据格式

```json
{
  "status": "accepted",
  "runId": "uuid-xxx",
  "childSessionKey": "agent:main:subagent:child-uuid"
}
```

### 关键限制
- 子 Agent **不能**使用 session tools（不能嵌套 spawn）
- 子 Agent 默认不可见父会话的 session tools（sandboxed visibility）
- 新会话 key 格式：`agent:<parentAgentId>:subagent:<uuid>`

---

## 五、subagents 工具（`subagents list`）

### 用途
列出当前 Agent 下所有活跃的 subagent 会话（子进程）。

> 注意：在 OpenClaw 中，"subagent" 是通过 `sessions_spawn` 启动的子会话，在 `sessions_list` 中以 `kind: "other"` 或 session key 包含 `subagent:` 来区分。**没有独立名为 `subagents` 的 Gateway RPC 方法**，所有 subagent 信息都通过 `sessions_list` 或 `status` 命令获取。

### 获取活跃 Subagent 的方法

#### 方法1：通过 `sessions_list` + `kinds` 过滤

```bash
# 列出所有 subagent 会话
# 在返回结果中过滤 key 包含 "subagent:" 的条目
openclaw sessions --json --agent main
```

#### 方法2：通过 `openclaw agents list`

```bash
openclaw agents list --json
```

返回格式：

```json
[
  {
    "id": "main",
    "name": "总指挥",
    "identityName": "Tim",
    "identityEmoji": "😊",
    "workspace": "/root/.openclaw/workspace",
    "agentDir": "/root/.openclaw/agents/main/agent",
    "model": "minimax/MiniMax-M2.7",
    "bindings": 3,
    "isDefault": true
  },
  {
    "id": "canmou",
    "name": "参谋",
    "workspace": "/root/.openclaw/workspace-canmou",
    "model": "minimax/MiniMax-M2.7",
    "bindings": 0,
    "isDefault": false
  }
]
```

#### 方法3：通过 Gateway `status` RPC

```bash
openclaw gateway call status --json
```

返回活跃子 agent 示例：

```json
{
  "sessions": {
    "recent": [
      {
        "key": "agent:main:subagent:99591b3b-0952-4bfd-986a-4e58ec228dc3",
        "kind": "direct",
        "sessionId": "e940d121-c49b-40c7-9a86-669ab290ad00",
        "updatedAt": 1774489716321,
        "age": 46081,
        "abortedLastRun": false,
        "model": "MiniMax-M2.7",
        "contextTokens": 200000,
        "flags": ["id:e940d121-c49b-40c7-9a86-669ab290ad00"]
      }
    ]
  }
}
```

---

## 六、健康状态检查：`gateway call health`

### 用途
获取 Gateway 整体健康状态，包括所有 Agent 和 Channel 的状态。

```bash
openclaw gateway call health --json
```

返回数据格式（核心字段）：

```json
{
  "ok": true,
  "ts": 1774489763205,
  "runtimeVersion": "2026.3.24",
  "heartbeat": {
    "defaultAgentId": "main",
    "agents": [
      { "agentId": "main", "enabled": true, "every": "55m", "everyMs": 3300000 },
      { "agentId": "canmou", "enabled": false, "every": "disabled", "everyMs": null }
    ]
  },
  "channelSummary": [
    "Discord: configured",
    "Feishu: configured"
  ],
  "sessions": {
    "paths": [
      "/root/.openclaw/agents/main/sessions/sessions.json",
      "..."
    ],
    "count": 37,
    "recent": [
      {
        "agentId": "main",
        "key": "agent:main:main",
        "kind": "direct",
        "sessionId": "uuid",
        "updatedAt": 1774489747614,
        "age": 14788,
        "systemSent": true,
        "abortedLastRun": false,
        "inputTokens": 995871,
        "outputTokens": 1232,
        "totalTokens": 170234,
        "remainingTokens": 29766,
        "percentUsed": 85,
        "model": "MiniMax-M2.7",
        "contextTokens": 200000,
        "flags": ["system", "id:uuid"]
      }
    ]
  }
}
```

---

## 七、综合代码示例

### 示例：Node.js 调用 Gateway WebSocket API

```javascript
const WebSocket = require('ws');

const GW_URL = 'ws://127.0.0.1:18789';
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

const ws = new WebSocket(GW_URL, {
  headers: { 'openclaw-auth-token': TOKEN }
});

ws.on('open', () => {
  // 1. 订阅所有 session 变化
  ws.send(JSON.stringify({ method: 'sessions.subscribe' }));
  
  // 2. 发送 RPC 调用：获取健康状态
  ws.send(JSON.stringify({
    id: '1',
    method: 'health',
    params: {}
  }));
  
  // 3. 获取 session 列表
  ws.send(JSON.stringify({
    id: '2', 
    method: 'sessions.list',
    params: { limit: 50 }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', JSON.stringify(msg, null, 2));
});
```

### 示例：获取活跃 Subagent（过滤 sessions_list）

```javascript
// sessions_list 返回后，按 key 过滤 subagent
const subagents = sessions.filter(s => s.key.includes(':subagent:'));
console.log('活跃子Agent:', subagents.map(s => ({
  key: s.key,
  sessionId: s.sessionId,
  updatedAt: new Date(s.updatedAt).toISOString(),
  model: s.model,
  totalTokens: s.totalTokens,
  abortedLastRun: s.abortedLastRun
})));
```

### 示例：向 Subagent 发送任务（sessions_spawn）

```javascript
// 模拟 sessions_spawn 工具调用
const spawnResult = await sessions_spawn({
  task: '调研 OpenClaw API 获取 Agent 状态，输出到文件 /root/.openclaw/workspace/projects/agent-monitor/canmou-research.md',
  label: 'canmou-research-v2',
  runtime: 'subagent',
  agentId: 'canmou',
  runTimeoutSeconds: 300
});

console.log('子Agent已启动:', spawnResult.childSessionKey);
// 后续可用 sessions_history 查看进度
// 可用 sessions_send 向其发送补充信息
```

---

## 八、关键 Session Key 格式

| 类型 | Key 格式 | 示例 |
|------|---------|------|
| 主会话 | `agent:<agentId>:main` | `agent:main:main` |
| 子Agent | `agent:<agentId>:subagent:<uuid>` | `agent:main:subagent:b250e00a-...` |
| Cron任务 | `agent:<agentId>:cron:<jobId>` | `agent:main:cron:cbda26ba-...` |
| Hook | `agent:<agentId>:hook:<uuid>` | `agent:main:hook:xxx` |
| 跨Agent通信 | `agent:<agentId>:main` | 从 main 向 canmou 发送时用 |

> **注意**：`global` 和 `unknown` 是保留值，不会出现在列表中。

---

## 九、权限与安全

- Session tools 默认对 **sandboxed 子Agent 不可见**（spawned-only visibility）
- `sessions_send` 受 `session.sendPolicy` 控制（可按 channel/chatType 配置 allow/deny）
- `sessions_spawn` 跨 Agent 需要 `subagents.allowAgents` 白名单允许
- `runtime: "acp"` 需要 `acp.allowedAgents` 单独授权

---

## 参考资料

- [Session Tools - OpenClaw Docs](https://docs.openclaw.ai/concepts/session-tool)
- [Gateway CLI - OpenClaw Docs](https://docs.openclaw.ai/cli/gateway)
- [Sessions - OpenClaw CLI](https://docs.openclaw.ai/cli/sessions)
- [Session Management](https://docs.openclaw.ai/concepts/session)
