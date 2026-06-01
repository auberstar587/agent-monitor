# Multica 集成参考

> **MulticaAdapter** 的实现参考。本文档记录 Multica HTTP API 和 WebSocket 协议细节。
> agent-monitor 通过统一的 `AgentPlatformAdapter` 接口调用，不直接依赖 Multica。
> 新增平台时，实现 `AgentPlatformAdapter` 接口即可，参考本文档格式写新的 `<Platform>-INTEGRATION.md`。

---

## 1. Multica 部署（前置条件）

从源码本地原生运行，仅需 PostgreSQL，不需要 Docker。

```bash
# 1. 安装 PostgreSQL（只需一次）
brew install postgresql@17
brew services start postgresql@17
createdb multica

# 2. 启动 Multica（Go 后端 + Next.js 前端，全部本地原生）
cd /Users/hanyongfeng/AI/multica
make dev
```

端口：
- API: `http://localhost:8080`
- Web UI: `http://localhost:3000`

## 2. Multica API Token

所有 API 调用需要 Bearer Token。通过 Multica Web UI (localhost:3000) → Settings → API Tokens 创建。

```bash
# 环境变量
MULTICA_API_URL=http://localhost:8080
MULTICA_API_TOKEN=mpa_xxxxxxxxxxxx
```

---

## 3. HTTP API（我们需要的端点）

### 3.1 Issue / 任务管理

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/issues` | GET | 获取 Issue 列表 → 首页项目总览 |
| `/api/issues` | POST | 创建 Issue → Blueprint Agent 节点 |
| `/api/issues/{id}` | GET | 获取 Issue 详情 |
| `/api/issues/{id}/task-runs` | GET | 获取历史任务执行记录 → Trace 列表 |
| `/api/issues/{id}/active-task` | GET | 当前活跃任务 |
| `/api/issues/{id}/rerun` | POST | 重跑任务 |
| `/api/issues/{id}/timeline` | GET | Issue 时间线 |

**创建 Issue（Blueprint 触发）**:

```json
POST /api/issues
{
  "title": "实现 Agent View 前端页面",
  "description": "基于 SPEC.md v2.0.0 设计...",
  "assignee_id": "agent_nox_xxx",
  "labels": ["frontend", "p0"],
  "project_id": "proj_xxx",
  "priority": "high"
}
```

### 3.2 任务消息（关键！）

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/tasks/{taskId}/messages` | GET | 获取任务执行消息列表 → **ExecutionTrace 核心数据源** |

**响应示例**:

```json
{
  "messages": [
    {
      "seq": 1,
      "type": "text",
      "content": "Let me read the SPEC.md first..."
    },
    {
      "seq": 2,
      "type": "tool_use",
      "tool": "Read",
      "input": {"file_path": "SPEC.md"}
    },
    {
      "seq": 3,
      "type": "tool_result",
      "tool": "Read",
      "output": "200 OK (2.3KB)"
    }
  ]
}
```

**agent-monitor 用法**: trace-collector 定时拉取新消息，解析 tool_use/tool_result，写入 `execution_traces` 表。

### 3.3 Agent / Runtime

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/agents` | GET | 获取 Agent 列表 → Agent View 总览 |
| `/api/agents` | POST | 注册 Agent |

### 3.4 Squad

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/squads` | GET | 获取 Squad 列表 |
| `/api/squads/{id}/members` | GET | Squad 成员 → Blueprint Agent 节点分配参考 |

### 3.5 Project

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/projects` | GET | 获取项目列表 → 首页 |
| `/api/projects/{id}` | GET | 项目详情 |

### 3.6 Autopilot

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/autopilots` | GET/POST | Always-on 定时触发 Blueprint |

---

## 4. WebSocket 事件流

### 4.1 连接

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');
// Multica 使用自定义认证协议，具体参考 Multica 源码
```

### 4.2 我们订阅的关键事件

#### Task 事件（ExecutionTrace 核心）

| 事件 | 触发时机 | agent-monitor 动作 |
|------|---------|-------------------|
| `task:queued` | 任务入队 | 创建 trace 记录 |
| `task:dispatched` | Daemon 认领 | 更新 trace 状态 |
| `task:running` | Agent 开始执行 | 更新 trace 状态 + session |
| `task:progress` | 进度更新 | 更新 trace 进度 |
| `task:message` | Agent 消息（每次工具调用/输出） | **写入 agent_sessions + execution_traces** |
| `task:completed` | 任务完成 | 更新 trace + 触发 memory 提取 + Artifact 关联 |
| `task:failed` | 任务失败 | 更新 trace + InboxItem(失败) |
| `task:cancelled` | 任务取消 | 更新 trace |

#### Agent 事件

| 事件 | 触发时机 | agent-monitor 动作 |
|------|---------|-------------------|
| `agent:status` | Agent 状态变化 | 更新 agent_sessions |
| `agent:created` | 新 Agent 注册 | 更新 Agent 列表 |
| `agent:archived` | Agent 归档 | 清理 sessions |

#### Inbox 事件

| 事件 | agent-monitor 动作 |
|------|-------------------|
| `inbox:new` | 同步到增强层 Inbox |

#### Daemon 事件

| 事件 | agent-monitor 动作 |
|------|-------------------|
| `daemon:heartbeat` | Agent 在线状态更新 |
| `daemon:task_available` | 可选：触发新任务通知 |

### 4.3 Task Message 协议细节

```typescript
// 来自 Multica server/pkg/protocol/messages.go
interface TaskMessagePayload {
  task_id: string;          // Multica task UUID
  issue_id?: string;        // 关联 Issue
  seq: number;              // 消息序号
  type: "text" | "tool_use" | "tool_result" | "error";
  tool?: string;            // 工具名（tool_use/tool_result 时）
  content?: string;         // 文本内容
  input?: Record<string, unknown>;  // 工具输入参数
  output?: string;          // 工具输出
}
```

### 4.4 Task Usage 协议

```typescript
// POST /api/daemon/tasks/{taskId}/usage → 写入 task_usage 表
interface TaskUsagePayload {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  model?: string;
}
```

agent-monitor 通过查询 `/api/tasks/{taskId}/usage` 获取成本数据，写入 `execution_traces.cost`。

---

## 5. agent-monitor HTTP API（提供给前端）

| 端点 | 说明 |
|------|------|
| `GET /api/sessions` | Agent 会话列表（聚合 Multica task:message + agent:status） |
| `GET /api/sessions/:id` | 单个会话详情 + 工具调用时间线 |
| `GET /api/traces/:taskId` | 任务执行轨迹 |
| `GET /api/inbox` | Inbox 列表 |
| `POST /api/inbox/:id/resolve` | 处理 InboxItem |
| `GET /api/memory` | 跨工具记忆列表 `?project_id=xxx&limit=10` |
| `POST /api/memory` | 创建记忆条目 |
| `PATCH /api/memory/:id` | 编辑记忆 |
| `DELETE /api/memory/:id` | 删除记忆 |
| `GET /api/blueprints` | Blueprint 列表 |
| `POST /api/blueprints` | 创建 Blueprint |
| `POST /api/blueprints/:id/run` | 启动 Blueprint 执行 |
| `GET /api/artifacts` | 产物列表 |
| `POST /api/artifacts/:id/review` | 审查产物 |

---

## 6. 启动顺序

```
1. Multica:
   cd /Users/hanyongfeng/AI/multica && make dev → http://localhost:3000 (UI) / http://localhost:8080 (API)

2. agent-monitor 后端:
   cd packages/server && npm run dev → http://localhost:3002

3. agent-monitor 前端:
   cd packages/ui && npm run dev → http://localhost:5173
```

确保 `~/.agent-monitor/config.yaml` 中 Multica API URL 和 Token 正确。
