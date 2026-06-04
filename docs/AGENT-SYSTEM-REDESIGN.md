# Agent 系统重构设计文档

> 版本: 1.0.0
> 日期: 2026-06-03
> 作者: Claude
> 状态: **已完成**（Phase 0~8B 全部实施，commit: 03db0d2 / a75f5df / 1b10f24 / ad11c48）

---

## 1. 背景与问题

### 1.1 现状

Agent 页面展示 4 个硬编码 mock agent（Nox/小资/Claude/Copilot），数据来自 `packages/server/src/adapters/mock/index.ts` 的静态常量。不会随实际引擎安装状态变化，spawn 了 Claude 进程执行任务时 Agent 页面无感知。

### 1.2 根因

项目标着"借鉴 Multica"，但实际只抄了 `AgentPlatformAdapter` 接口壳子，核心的 **Runtime/Agent 分层**和 **Presence 推导机制**完全没实现：

| Multica 做了的 | 我们漏了的 |
|---|---|
| Runtime（daemon 心跳 → online/offline） | EngineAdapter 没有"是否在线"的概念 |
| Agent 绑定 Runtime（多 Agent 共享一引擎） | Agent 全靠 mock 硬编，跟引擎没关系 |
| `derivePresence` 纯函数推导状态 | Agent 状态是写死的假数据 |
| 任务状态反馈到 Agent workload | spawn 了进程 Agent 页面无感知 |
| `buildPresenceMap` 批量推导所有 Agent | 每次请求都走 mock 返回固定值 |

### 1.3 目标

借鉴 Multica 的 3 层模型（Runtime → Agent → Presence 推导），适配我们的单机本地系统：

1. Agent 页面展示**真实引擎 Agent + 手动注册的 Bot**
2. 执行任务时 Agent 状态自动变为"忙碌"
3. 引擎安装/卸载后 Agent 自动出现/消失

---

## 2. 架构设计

### 2.1 Multica 模型 → 我们的适配

```
Multica 模型                    我们的适配
─────────────                  ──────────
Daemon 进程（常驻）      →     Fastify 进程（本身就是"daemon"）
Runtime（daemon 注册）   →     EngineAdapter.detectInstalled() 自动发现
Agent（绑定 Runtime）    →     自动生成 Agent 记录 + 手动注册 Bot
Presence（前端推导）     →     后端推导（我们没有 React Query 基础设施）
Task Snapshot            →     runtime_calls + _runningChildren 状态
```

### 2.2 三层模型

```
┌─────────────────────────────────────────┐
│ Runtime（物理运行时）                      │
│ ├── 每个 EngineAdapter 对应一个 Runtime    │
│ ├── claude-code → runtime-claude-code    │
│ ├── reasonix   → runtime-reasonix        │
│ ├── 状态：online / offline                │
│ └── 来源：detectInstalled() 自动发现      │
├─────────────────────────────────────────┤
│ Agent（逻辑实体）                          │
│ ├── 引擎自动生成（agent_source='engine'）  │
│ ├── 手动注册 Bot（agent_source='manual'） │
│ ├── 绑定 Runtime（runtime_id FK）         │
│ └── 状态：online / busy / offline         │
├─────────────────────────────────────────┤
│ Presence（推导，不存储）                    │
│ ├── Availability: online / busy / offline │
│ ├── Workload: working / idle              │
│ ├── 引擎 agent: runtime 状态 + 进程数      │
│ └── 手动 agent: last_seen_at + 任务状态    │
└─────────────────────────────────────────┘
```

### 2.3 Presence 推导规则

对应 Multica 的 `AgentAvailability × Workload`：

| 场景 | Availability | Workload | 显示 |
|------|-------------|----------|------|
| 引擎已安装，无任务 | online | idle | 在线 |
| 引擎已安装，正在执行 | busy | working | 忙碌 |
| 引擎未安装 | offline | idle | 离线 |
| 手动 Bot，最近活跃 | online | idle/working | 在线 |
| 手动 Bot，长期无活动 | offline | idle | 离线 |

---

## 3. 数据库变更

### 3.1 新建 `agent_runtimes` 表

对应 Multica 的 `agent_runtime` 表。

```sql
CREATE TABLE IF NOT EXISTS agent_runtimes (
  id              TEXT PRIMARY KEY,            -- 'runtime-claude-code'
  engine_id       TEXT NOT NULL UNIQUE,        -- FK 到引擎适配器名
  provider        TEXT,                        -- 'anthropic', 'deepseek' 等
  status          TEXT NOT NULL DEFAULT 'offline',
  version         TEXT,                        -- CLI 版本号
  device_name     TEXT DEFAULT '',
  last_seen_at    TIMESTAMPTZ,
  installed       BOOLEAN NOT NULL DEFAULT false,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 扩展 `registered_agents` 表

```sql
ALTER TABLE registered_agents ADD COLUMN IF NOT EXISTS runtime_id TEXT REFERENCES agent_runtimes(id);
ALTER TABLE registered_agents ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE registered_agents ADD COLUMN IF NOT EXISTS engine_id TEXT;
ALTER TABLE registered_agents ADD COLUMN IF NOT EXISTS agent_source TEXT NOT NULL DEFAULT 'engine';
```

### 3.3 `runtime_calls` 加 `agent_id`

```sql
ALTER TABLE runtime_calls ADD COLUMN IF NOT EXISTS agent_id TEXT REFERENCES registered_agents(id);
CREATE INDEX IF NOT EXISTS idx_runtime_calls_agent ON runtime_calls(agent_id);
```

---

## 4. 后端实施

### Phase 1: Runtime 服务

**新建**: `packages/server/src/services/runtime-service.ts`

- 启动时遍历 `getRegisteredEngines()`，调 `detectInstalled()`，upsert `agent_runtimes`
- 定时健康检查（30s），轻量方式（不每次 spawn CLI）
- `getActiveRunCount(engineId)` 查询引擎当前运行进程数

**修改**: EngineAdapter 接口加 `activeRunCount?(): number`
**修改**: `claude-code.ts` 和 `reasonix.ts` 各实现 `activeRunCount()`

### Phase 2: Agent 注册重构

**修改**: `packages/server/src/services/agent-registry.ts`

- 新增 `syncAgentsFromRuntimes()`：对每个在线 runtime，自动创建/更新 agent
- 新增 `registerManualAgent()`：手动注册 OpenClaw bot
- 修复 `registerAgent` 的 ON CONFLICT 问题

### Phase 3: Presence 推导服务

**新建**: `packages/server/src/services/presence-service.ts`

服务端版 `derivePresence()`：
1. 加载所有 agent
2. 引擎 agent → runtime 状态 + activeRunCount → availability/workload
3. 手动 agent → last_seen_at + 任务状态 → availability/workload
4. 更新 `registered_agents.status`

### Phase 4: API 路由重构

**修改**: `packages/server/src/routes/agents.ts`

| 方法 | 路径 | 变化 |
|------|------|------|
| GET | `/api/agents` | 重构：DB + presence 推导，去掉 adapter 交集 |
| GET | `/api/agents/presence` | **新增** |
| POST | `/api/agents` | **新增**：手动注册 |
| POST | `/api/agents/sync` | 重构：syncRuntimes + syncAgents |

**修改**: `packages/server/src/routes/engines.ts` — 修正路由前缀
**修改**: `packages/server/src/routes/tasks.ts` — execute 加 agent_id 归属
**修改**: `packages/server/src/index.ts` — 启动流程改用 runtime + agent 同步

---

## 5. 前端实施

### Phase 5: 页面重构

**修改**: `packages/ui/src/lib/api.ts` — 新增 `getAgentPresence`, `createAgent`
**修改**: `packages/ui/src/stores/index.ts` — store 加 presence 数据
**修改**: `packages/ui/src/pages/Agents.tsx` — 去掉 mock 依赖，真实数据驱动
**修改**: `packages/ui/src/pages/AgentDetail.tsx` — 加 Runtime/Model/来源信息

Agent 卡片布局：
```
┌─────────────────────────────────────┐
│ 🟢  Claude Code                     │
│ claude-code · claude-sonnet-4-5     │
│ v2.0.35 · 引擎自动发现               │
│ 当前任务: 修复登录 Bug               │
└─────────────────────────────────────┘
```

---

## 6. 执行顺序与分工

```
Phase 0: DB Migration
    ↓
Phase 1: Runtime Service      ←── Reasonix（后端）
    ↓
Phase 2: Agent Registry
    ↓
Phase 3: Presence Service
    ↓
Phase 4: API Routes
    ↓
Phase 5: Frontend             ←── Hermes（前端）
    ↓
Phase 6: Config Cleanup（独立）
```

**子 Agent 分工**：
- **Reasonix**：Phase 0~4 后端全部
- **Hermes**：Phase 5 前端（等后端 API 就绪后开始）

---

## 7. 关键文件清单

| 操作 | 文件 |
|------|------|
| 新建 | `packages/server/src/db/migrations/006_runtime_agent_refactor.sql` |
| 新建 | `packages/server/src/services/runtime-service.ts` |
| 新建 | `packages/server/src/services/presence-service.ts` |
| 修改 | `packages/server/src/adapters/engine.ts` |
| 修改 | `packages/server/src/adapters/claude-code.ts` |
| 修改 | `packages/server/src/adapters/reasonix.ts` |
| 修改 | `packages/server/src/services/agent-registry.ts` |
| 修改 | `packages/server/src/routes/agents.ts` |
| 修改 | `packages/server/src/routes/engines.ts` |
| 修改 | `packages/server/src/routes/tasks.ts` |
| 修改 | `packages/server/src/index.ts` |
| 修改 | `packages/ui/src/lib/api.ts` |
| 修改 | `packages/ui/src/stores/index.ts` |
| 修改 | `packages/ui/src/pages/Agents.tsx` |
| 修改 | `packages/ui/src/pages/AgentDetail.tsx` |

总计：~800 行改动，15 个文件（3 新建 + 12 修改）。

---

## 8. 验证方案

### Phase 0~1
- `pnpm dev:server` 日志出现 `synced 2 runtimes`
- `SELECT * FROM agent_runtimes` 有 2 行，status=online

### Phase 2~3
- `registered_agents WHERE agent_source='engine'` 有 2 行
- `GET /api/agents/presence` 返回 `[{ availability: 'online' }, ...]`

### Phase 4
- `GET /api/engines` 返回 200（修复 prefix）
- `GET /api/agents` 返回真实引擎 agent
- `POST /api/agents` 可创建手动 agent

### Phase 5
- 浏览器 `/agents` 看到真实引擎 Agent
- 执行任务时 Agent 变"忙碌"，完成后回"在线"
- 同步按钮刷新引擎状态
- 注册 OpenClaw bot 出现在列表

### 回归
```bash
pnpm typecheck && pnpm build && pnpm test
```

---

## 9. 风险与应对

| 风险 | 应对 |
|------|------|
| `detectInstalled()` 较慢（spawn CLI） | 只在启动和手动同步时调用；30s 健康检查用轻量方式 |
| `GET /api/agents` 响应结构变化 | 新字段 additive，旧字段不变 |
| 引擎 agent 误删 | 加保护：`agent_source='engine'` 禁止 DELETE |
| 手动 agent 心跳 | V1 不做，默认 online，后续加 heartbeat 端点 |

---

## 10. Multica 参考（源码路径）

| 概念 | Multica 文件 | 我们的对应 |
|------|-------------|-----------|
| CLI 检测 | `server/internal/daemon/config.go` | `engine.ts` detectInstalled() |
| Runtime 注册 | `server/internal/daemon/daemon.go:716` | runtime-service.ts syncRuntimes() |
| Runtime 表 | `server/migrations/004_agent_runtime_loop.up.sql` | 006 migration |
| Presence 推导 | `packages/core/agents/derive-presence.ts` | presence-service.ts |
| Runtime 健康 | `packages/core/runtimes/derive-health.ts` | 30s 健康检查 |
| Agent 状态类型 | `packages/core/agents/types.ts` | AgentPresence 接口 |
| Agent 前端页面 | `packages/views/agents/components/agents-page.tsx` | Agents.tsx |
