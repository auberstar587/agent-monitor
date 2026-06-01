# Agent Monitor — Phase 1 任务分解

> ⚠️ 已过时 — 本文档为 v1 时代的 Phase 1 计划（Multica 集成为中心）
> v2 已转向平台无关设计（PostgreSQL + Adapter 模式），此文档仅供参考
> 新的任务计划见 docs/NEXT-STEPS.md
>
> Phase 1 原计划: Multica 集成 + Agent View + ExecutionTrace 最小闭环

---

## 前置条件

- [x] Multica 本地部署运行 (`multica setup` → localhost:3001)
- [x] SPEC.md v2.0.0 / DESIGN.md v2.0.0 完成
- [x] MULTICA-INTEGRATION.md / DATABASE-SCHEMA.md 完成

---

## 任务列表

### Task 1.1: 项目脚手架搭建

**目标**: 创建 monorepo + 两个 package 的基本结构。

**产出**:
- `packages/server/` — Fastify + TypeScript + better-sqlite3
- `packages/ui/` — Vite + React 19 + Tailwind v4 + React Router
- workspace root `package.json` (npm workspaces)
- `packages/server/src/adapters/interface.ts` — AgentPlatformAdapter 接口 + DTO 类型定义
- `packages/server/src/adapters/registry.ts` — Adapter 注册表
- `packages/server/src/index.ts` — Hello World API
- `packages/ui/src/App.tsx` — Hello World 页面
- `~/.agent-monitor/config.yaml` — 配置文件模板

**验收**:
- `cd packages/server && npm run dev` → localhost:3002
- `cd packages/ui && npm run dev` → localhost:5173
- 前端能调用后端 `/api/health` 返回 OK

---

### Task 1.2: Multica Adapter 实现

**目标**: 实现 MulticaAdapter，封装 HTTP API 和 WebSocket。

**产出**:
- `packages/server/src/adapters/multica/index.ts` — MulticaAdapter implements AgentPlatformAdapter
- `packages/server/src/adapters/multica/client.ts` — HTTP API 调用封装
  - `getIssues()` / `getIssue(id)` / `createIssue()`
  - `getTaskMessages(taskId)` — 核心数据源
  - `getAgents()` / `getAgent(id)`
  - `getProjects()`
  - `getTaskUsage(taskId)` — 成本数据
- `packages/server/src/adapters/multica/ws.ts` — WebSocket 事件订阅 → 转为 PlatformEventHandler
- `packages/server/src/adapters/multica/events.ts` — Multica 事件 → 统一 TaskEvent/TaskMessageDTO 转换
- 类型定义：`adapters/interface.ts` 中的 TaskDTO、TaskMessageDTO、AgentDTO、TaskEvent 等
- Bearer Token 认证 + 错误处理

**验收**:
- 调用 `getIssues()` 返回 Multica Issue 列表
- 调用 `getTaskMessages(taskId)` 返回消息数组
- API Token 错误时给出明确提示

---

### Task 1.3: 事件订阅与数据同步

**目标**: 通过 MulticaAdapter 订阅事件，写入 SQLite。

**产出**:
- `packages/server/src/services/task-subscriber.ts`
  - 调用 `multicaAdapter.subscribe()` 订阅 `task:*` 事件
  - 解析 `TaskEvent` → 写入 agent_sessions + execution_traces
- `packages/server/src/services/trace-collector.ts`
  - 处理 `TaskMessageDTO` → 写入 trace_tool_calls
  - 拉取 cost → 更新 execution_traces
- Adapter Registry 加载逻辑

**验收**:
- 通过 Multica Adapter 连接后，能在控制台看到 task 事件
- task:message 被正确解析并写入 SQLite

---

### Task 1.4: 数据库初始化

**目标**: 创建 SQLite 数据库和所有表。

**产出**:
- `packages/server/src/db/schema.ts` — CREATE TABLE 语句
- `packages/server/src/db/migrate.ts` — 迁移系统
- `packages/server/src/db/index.ts` — 数据库连接单例
- 以下表完成建表：
  - agent_sessions, execution_traces, trace_tool_calls
  - memory_entries, inbox_items, artifacts
  - blueprints, blueprint_nodes, blueprint_edges
  - projects_cache, agents_cache, context_packs

**验收**:
- 启动服务时自动创建 `~/.agent-monitor/data.db`
- 所有表存在，索引正确

---

### Task 1.5: ExecutionTrace Collector

**目标**: 聚合 Multica task 事件 + 消息 + usage → 完整 execution_traces。

**产出**:
- `packages/server/src/services/trace-collector.ts`
  - 监听 task:queued → 创建 execution_traces 记录
  - 监听 task:dispatched/running/completed/failed → 更新状态
  - 解析 task:message → 写入 trace_tool_calls
  - 拉取 task usage → 更新 input_tokens/output_tokens/cost_cents
- 数据查询：
  - `GET /api/traces/:taskId` — 返回完整 trace + tool_calls

**验收**:
- 一个完整 task 生命周期后，execution_traces 表有完整记录
- trace_tool_calls 表有工具调用序列
- cost_cents 字段有非零值

---

### Task 1.6: Agent View API

**目标**: 提供 Agent 会话列表和详情 API。

**产出**:
- `GET /api/sessions` — 所有活跃会话列表
  - 聚合 agent_sessions + agents_cache
  - 返回: agent 名、状态、项目、任务、最后输出、运行时长
- `GET /api/sessions/:id` — 单个会话详情
  - 包含最近 20 条 trace_tool_calls
  - 关联的项目/任务信息

**验收**:
- 返回的会话列表按状态排序（waiting_user > running > idle）
- 每个会话有 last_output 摘要
- waiting_user 状态的会话有高亮标识

---

### Task 1.7: Agent View 前端页面

**目标**: 实现 Agent View 主页面和会话详情页。

**产出**:
- `packages/ui/src/pages/AgentView.tsx`
  - 会话卡片列表（SessionCard 组件）
  - 状态筛选（全部 / 运行中 / 等待用户 / 已完成）
  - 平台筛选（Claude Code / Codex / OpenClaw）
- `packages/ui/src/pages/SessionDetail.tsx`
  - 工具调用时间线（ToolCallTimeline 组件）
  - 实时进度展示
- `packages/ui/src/components/SessionCard.tsx` — 会话卡片
- `packages/ui/src/components/ToolCallTimeline.tsx` — 工具调用时间线
- `packages/ui/src/hooks/useAgentSessions.ts` — WebSocket 订阅 + 状态管理

**验收**:
- 能看到所有活跃 Agent 会话
- waiting_user 的会话卡片有明显视觉提示
- 点击会话进入详情，能看到工具调用序列

---

### Task 1.8: ExecutionTrace 前端页面

**目标**: 实现任务执行轨迹详情页。

**产出**:
- `packages/ui/src/pages/ExecutionTrace.tsx`
  - 状态时间线
  - 工具调用列表
  - Token/成本统计
  - 文件变更列表（占位，Phase 2 实现 Git 扫描）
- `packages/ui/src/hooks/useTaskTrace.ts` — 数据获取 + 自动刷新

**验收**:
- 能从 Agent View 跳转到对应任务的 Trace 页面
- 能看到完整的状态变化时间线
- 成本数据正确展示

---

### Task 1.9: Inbox API + 前端

**目标**: 实现基础 Inbox（3 种类型先行）。

**产出**:
- `packages/server/src/services/inbox-collector.ts`
  - 任务失败 → inbox_items (failed_task)
  - 任务 waiting_local_directory / 长时间 waiting_user → inbox_items (blocked_task)
- `GET /api/inbox` — Inbox 列表
- `POST /api/inbox/:id/resolve` — 处理
- `packages/ui/src/pages/Inbox.tsx` — Inbox 页面
- `packages/ui/src/components/InboxItemCard.tsx` — Inbox 条目卡片

**验收**:
- 有等待用户输入的任务时，Inbox 页有对应条目
- 能标记为已处理

---

### Task 1.10: 集成测试 + E2E 演示

**目标**: 确保整个链路跑通。

**产出**:
- E2E 测试脚本：创建 Multica Issue → assign Agent → Agent 执行 → agent-monitor 收到事件 → 前端展示
- README 更新：本地开发环境搭建步骤

**验收**:
- 从 Multica 创建 Issue 到 agent-monitor Agent View 展示，全链路无断点
- 文档足以让另一个开发者搭建环境并跑通

---

## Phase 1 完成标准

Phase 1 结束后，用户应该能：

1. ✅ 在 agent-monitor 前端看到 Multica 中所有 Agent 的实时会话状态
2. ✅ 点击某个会话，看到 Agent 正在执行什么工具调用
3. ✅ 查看某个任务的完整执行轨迹（状态变化 + 工具调用 + 成本）
4. ✅ 在 Inbox 中发现需要处理的失败任务和阻塞任务
5. ✅ 整个系统不修改 Multica 一行代码
