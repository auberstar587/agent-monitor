# Agent Monitor — 需求文档

> 项目: Agent Monitor
> 版本: 2.2.0
> 更新: 2026-05-31
> 状态: v2 功能骨架已实施，正在集成验证与 QA 收口

---

## 1. 产品定位

Agent Monitor 是个人 AI Agent 统一管理平台，也是 Multica 的本地增强层。

它不重复实现 Multica 已经覆盖的基础项目管理、Agent runtime、Issue 看板、Squad 和 Autopilots，而是补齐个人高频使用 AI 工具时最缺的几件事：

- 跨 Claude Code / Codex / OpenClaw / 手动输入等工具的输出归集
- 本地项目注册、关系图和上下文包
- 白盒共享记忆，让工具切换时上下文不断
- Blueprint DAG 编排与 Always-on 执行
- ExecutionTrace、Inbox、风险评估，让后台 Agent 可追溯、可介入、可纠正

当前 v2 已从旧 `dashboard/` / `web/` 原型迁移为 `packages/server` + `packages/ui` monorepo。文档口径以“功能骨架已实施，仍需验证收口”为准，不再宣称稳定完成态。

---

## 2. 当前实现基线

### 已实施

| 模块 | 当前状态 |
|------|----------|
| v2 monorepo | 根目录 npm workspaces，`packages/server` + `packages/ui` |
| 后端 | Fastify 5 + TypeScript + PostgreSQL，启动时自动执行迁移 |
| 前端 | Vite 6 + React 19 + Tailwind CSS v4，暗色中文工作台 |
| 数据库 | PostgreSQL schema 覆盖项目、输出、记忆、Trace、Inbox、Blueprint、Agent、Task |
| Adapter | `mock` / `manual` / `multica` 接口与实现 |
| 项目管理 | 本地项目注册、项目关系、项目上下文 API |
| Agent 输出 | 输出创建、时间线、方向筛选、来源归集 |
| 共享记忆 | CRUD、搜索、统计、Dream 整理 |
| ExecutionTrace / Inbox | Trace 列表与详情、Inbox 列表与 resolve |
| Blueprint | CRUD、clone、run、runs、cancel、节点与边保存 |
| Meeting | 多 Agent 会议 API 与轮次共识服务 |
| Scheduler | croner 内存调度 Blueprint |
| Decision | `assessRisk` 风险评估与自动审批判断 |
| UI 页面 | Dashboard、Projects、ProjectDetail、Agents、AgentDetail、Tasks、TaskDetail、Outputs、Memory、Inbox、BlueprintList、BlueprintStudio、Settings |

### 已验证

| 验证项 | 结果 | 日期 |
|--------|------|------|
| `npm run typecheck` | 通过 | 2026-05-31 |
| `npm run build` | 通过，有 Vite chunk size warning | 2026-05-31 |
| `npm test` | 未通过 | 2026-05-31 |

测试失败不是业务断言失败，而是测试运行器不一致：`packages/server/tests/*.test.ts` 使用 `node:test`，当前脚本使用 `vitest run`，Vitest 报告没有 Vitest suite。

---

## 3. P0 需求

| 需求 | 当前实现 | 仍需收口 |
|------|----------|----------|
| **统一入口** | Dashboard + 项目、Agent、任务、输出、记忆、Inbox、蓝图页面已存在 | 数据刷新、空态、错误态和真实运行体验需 E2E 验证 |
| **Agent View** | Agents / AgentDetail 可展示 adapter 同步的 Agent 状态 | 真实会话 peek、回复、暂停、终止能力依赖 adapter 后续增强 |
| **ExecutionTrace** | Trace 表、tool calls 表、列表与详情 API 已存在 | 需要从真实任务执行链路持续写入并前端化详情页 |
| **Inbox** | Inbox API 与页面已存在，支持 resolve | 类型覆盖、来源触发和处理后事件记录需端到端复测 |
| **白盒共享记忆** | shared_memory、搜索、统计、Dream、项目 context API 已存在 | 需要验证跨工具任务接续时的自动注入效果 |
| **Blueprint 编排** | 7 类节点、DAG 编辑器、运行记录、节点保存已存在 | Condition / Approval / Meeting 的真实分支行为需场景验收 |
| **Always-on 执行** | croner 调度和 Dashboard 调度展示已存在 | 当前为内存调度，重启恢复和失败重试仍需设计/实现 |
| **风险评估** | `assessRisk` 已实现并有纯逻辑测试 | 测试运行器统一后纳入常规 CI |

---

## 4. P1 需求

| 需求 | 当前状态 |
|------|----------|
| **Artifact Review** | 数据模型仍偏 Trace / Output / Task，独立 Artifact 审查闭环未完成 |
| **Git/Worktree** | 规范中保留，当前代码未形成完整任务级 worktree 管理 |
| **Context Pack** | `context_packs` schema 与 `getProjectContext` 已有雏形 |
| **Handoff** | 作为产品能力保留，尚未形成专门 API 和页面 |
| **真实 Multica 集成** | Adapter 代码已存在，仍需真实 Multica 环境端到端验证 |
| **通知/实时同步** | `socket.io` 已依赖但尚未完成实时数据流接入 |

---

## 5. Multica 已覆盖的范围

增强层不重复开发：

- Workspace / Issue / Kanban 基础项目管理
- Agent runtime daemon 与多 CLI 管理
- Squad 小队协作
- Autopilots 基础设施
- 用户认证、授权、组织管理
- CI/CD 和远程协作基础能力

Agent Monitor 只在这些基础能力之上做本地增强、可观测、记忆和编排。

---

## 6. 近期验收标准

当前最小验收不再按“Phase 1-5 全完成”计算，而按 v2 收口链路计算：

1. `npm run typecheck` 通过。
2. `npm run build` 通过。
3. `npm test` 通过，测试文件统一到 Vitest 或测试命令切到 Node runner。
4. 本地 PostgreSQL + server + UI 可启动。
5. 能完成一条端到端链路：创建 Project → 创建 Task/Output/Memory → 创建 Blueprint → 保存节点边 → 运行 Blueprint → 查看 Trace/Inbox/Dashboard 更新。
6. UUID 参数非法时关键 API 返回 400，不出现 500。
7. 文档、QA 报告、实际验证结果一致。

---

## 7. 暂不做

- 企业权限系统
- 多人协作账户体系
- 云同步
- 复杂像素会议室作为主链路
- 全自动高风险 Git 操作
- 在本地 mock 链路稳定前强行接真实 Multica

---

## 8. 更新记录

| 日期 | 版本 | 作者 | 变更 |
|------|------|------|------|
| 2026-05-29 | 2.0.0 | Nox | Multica 增强层定位重塑，Phase 1-5 优先级重排 |
| 2026-05-31 | 2.1.0 | DeepSeek | Phase 3-5 功能骨架补齐，更新状态 |
| 2026-05-31 | 2.2.0 | Codex | 根据当前代码与验证结果校正口径：骨架已实施，测试仍需收口 |
