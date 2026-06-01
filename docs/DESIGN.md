# Agent Monitor v2 — 设计文档

> 版本: 2.2.0
> 更新: 2026-05-31
> 作者: Claude + Auber + Codex
> 状态: v2 架构已落地，正在集成验证与 QA 收口

---

## 1. 设计目标

Agent Monitor v2 解决四个核心问题：

1. **项目关系可见**：本机多个项目可以注册、关联、注入上下文。
2. **Agent 输出归集**：Claude Code / Codex / OpenClaw / 手动输入等来源的输出进入同一时间线。
3. **跨工具记忆连续**：共享记忆可搜索、可整理、可注入，减少反复解释。
4. **多 Agent 编排可追踪**：Blueprint、ExecutionTrace、Inbox、风险评估共同组成可观察、可介入的执行闭环。

核心原则：本地优先，Adapter 模式接入外部平台，不修改 Multica 或其他外部平台核心代码。

---

## 2. 总体架构

```text
┌───────────────────────────────────────────────────────┐
│          packages/ui (Vite 6 + React 19)              │
│                                                       │
│  Dashboard / Projects / Agents / Tasks / Outputs      │
│  Memory / Inbox / Blueprints / Settings               │
└──────────────────────┬────────────────────────────────┘
                       │ REST API (Vite proxy)
┌──────────────────────┴────────────────────────────────┐
│          packages/server (Fastify 5 + TypeScript)     │
│                                                       │
│  ProjectRegistry  AgentOutputCollector  MemoryService │
│  BlueprintEngine  MeetingService        Scheduler     │
│  DecisionEngine   ContextInjector       TaskManager   │
│                                                       │
│  Adapter: mock / manual / multica                     │
└──────────────────────┬────────────────────────────────┘
                       │
              PostgreSQL 17 (agent_monitor)
```

---

## 3. 技术栈

| 层 | 技术 | 当前状态 |
|----|------|----------|
| 后端 | Fastify 5 + TypeScript strict | 已落地 |
| 数据库 | PostgreSQL 17 + `pg` | 已落地 |
| 前端 | Vite 6 + React 19 | 已落地 |
| 样式 | Tailwind CSS v4 + 自定义 CSS tokens | 已落地 |
| 状态 | zustand 5 | 已落地 |
| 路由 | React Router v7 | 已落地 |
| 图编辑 | `@xyflow/react` | 已落地 |
| 定时 | croner | 已落地，当前为内存调度 |
| 实时 | socket.io | 已依赖，尚未完成事件流接入 |

---

## 4. 当前目录结构

```text
agent-monitor/
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── config.ts
│   │   │   ├── db/
│   │   │   │   ├── client.ts
│   │   │   │   ├── migrate.ts
│   │   │   │   └── migrations/001_initial.sql..004_tasks.sql
│   │   │   ├── adapters/
│   │   │   │   ├── interface.ts
│   │   │   │   ├── registry.ts
│   │   │   │   ├── mock/
│   │   │   │   ├── manual/
│   │   │   │   └── multica/
│   │   │   ├── services/
│   │   │   │   ├── project-registry.ts
│   │   │   │   ├── agent-output-collector.ts
│   │   │   │   ├── memory-service.ts
│   │   │   │   ├── blueprint-engine.ts
│   │   │   │   ├── meeting-service.ts
│   │   │   │   ├── scheduler.ts
│   │   │   │   ├── decision-engine.ts
│   │   │   │   ├── context-injector.ts
│   │   │   │   └── task-manager.ts
│   │   │   └── routes/
│   │   │       ├── projects.ts
│   │   │       ├── outputs.ts
│   │   │       ├── memory.ts
│   │   │       ├── traces.ts
│   │   │       ├── blueprints.ts
│   │   │       ├── meetings.ts
│   │   │       ├── scheduler.ts
│   │   │       ├── decisions.ts
│   │   │       ├── agents.ts
│   │   │       └── tasks.ts
│   │   └── tests/
│   └── ui/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── lib/api.ts
│       │   ├── stores/index.ts
│       │   ├── components/Layout.tsx
│       │   └── pages/
│       │       ├── Dashboard.tsx
│       │       ├── Projects.tsx
│       │       ├── ProjectDetail.tsx
│       │       ├── Agents.tsx
│       │       ├── AgentDetail.tsx
│       │       ├── Tasks.tsx
│       │       ├── TaskDetail.tsx
│       │       ├── Outputs.tsx
│       │       ├── Memory.tsx
│       │       ├── Inbox.tsx
│       │       ├── BlueprintList.tsx
│       │       ├── BlueprintStudio.tsx
│       │       └── Settings.tsx
│       └── vite.config.ts
├── docs/
├── archive/
├── SPEC.md
└── package.json
```

---

## 5. API 清单

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| GET | `/api/health` | 健康检查 | 已实现 |
| GET/POST | `/api/projects` | 项目列表 / 注册 | 已实现 |
| GET/PUT/DELETE | `/api/projects/:id` | 项目详情 / 更新 / 删除 | 已实现 |
| GET/POST | `/api/projects/:id/relations` | 项目关系 | 已实现 |
| GET/POST | `/api/outputs` | 输出列表 / 创建 | 已实现 |
| GET | `/api/timeline` | 输出时间线 | 已实现 |
| GET/POST | `/api/memory` | 记忆列表 / 创建 | 已实现 |
| GET | `/api/memory/search` | 记忆搜索 | 已实现 |
| GET | `/api/memory/stats` | 记忆统计 | 已实现 |
| POST | `/api/memory/dream` | Dream 整理 | 已实现 |
| GET | `/api/traces` | Trace 列表 | 已实现 |
| GET | `/api/traces/:taskId` | Trace 详情 | 已实现 |
| GET/POST | `/api/inbox`, `/api/inbox/:id/resolve` | Inbox 与处理 | 已实现 |
| GET/POST | `/api/blueprints` | Blueprint 列表 / 创建 | 已实现 |
| GET/PUT/DELETE | `/api/blueprints/:id` | Blueprint 详情 / 更新 / 删除 | 已实现，UUID 校验需补齐 |
| POST | `/api/blueprints/:id/clone` | 克隆 Blueprint | 已实现，UUID 校验需补齐 |
| POST | `/api/blueprints/:id/run` | 运行 Blueprint | 已实现 |
| GET | `/api/blueprints/:id/runs` | Blueprint 运行列表 | 已实现，UUID 校验需补齐 |
| GET/POST | `/api/meetings`, `/api/meetings/:id/start` | 会议创建与执行 | 已实现 |
| GET/POST/DELETE | `/api/scheduler` | 调度列表 / 创建 / 删除 | 已实现，当前内存态 |
| POST | `/api/decisions/assess-risk` | 风险评估 | 已实现 |
| GET/POST/PUT | `/api/agents` | Agent 同步与更新 | 已实现 |
| GET/POST/PUT/DELETE | `/api/tasks` | 本地任务管理 | 已实现 |

---

## 6. 前端页面

| 页面 | 路由 | 状态 |
|------|------|------|
| 总览 | `/` | 已实现 |
| 项目 | `/projects` | 已实现 |
| 项目详情 | `/projects/:id` | 已实现 |
| Agents | `/agents` | 已实现 |
| Agent 详情 | `/agents/:id` | 已实现 |
| 任务 | `/tasks` | 已实现 |
| 任务详情 | `/tasks/:id` | 已实现 |
| 输出 | `/outputs` | 已实现 |
| 记忆 | `/memory` | 已实现 |
| 收件箱 | `/inbox` | 已实现 |
| 蓝图列表 | `/blueprints` | 已实现 |
| 蓝图工作室 | `/blueprints/:id` | 已实现 |
| 设置 | `/settings` | 已实现 |

### 6.1 应用外壳结构

```
app-shell (flex, 100vh, padding: 12px, gap: 12px)
├── sidebar-shell (240px / 68px collapsed, 圆角卡片)
│   ├── sidebar-brand — Logo + 标题 + 折叠按钮
│   ├── sidebar-nav — 导航项列表
│   └── sidebar-footer — 系统状态指示灯
└── workspace-shell (flex-1, 大页面卡片)
    ├── page-header — eyebrow + 页面标题(h1 24px) + 描述（无横线分隔）
    └── workspace-main (flex:1, scroll)
        └── workspace-content (内层小页面卡片, 有自己的圆角边框)
            └── <Outlet /> ← 页面组件渲染于此
```

### 6.2 页面内容布局规范

`.workspace-content > div` 自动应用 `display: flex; flex-direction: column; gap: 20px;`，
**页面组件内顶层区块禁止 `mb-*` 系列 class**，统一由父容器 gap 控制间距。

**标题不再出现在页面组件内**——由 Layout 的 `page-header` 统一渲染，通过 `PAGE_META` 配置。
`page-header` 位于大页面(workspace-shell)内、小页面(workspace-content)外，无横线分隔。
页面组件直接从操作按钮或内容卡片开始。

页面组成区块（按典型顺序）：

| 区块 | CSS 类 / 模式 | 说明 |
|------|---------------|------|
| 页面标题 | `page-header`（Layout 层） | eyebrow + h1(24px) + desc，仅此一处，无横线分隔 |
| 操作栏 | `flex justify-end` | 注册/创建/添加等 primary 按钮 |
| 通知横幅 | `.toast.toast-{success\|error\|info}` | 操作反馈，4s 自动消失 |
| 工具栏 | `.content-card` 包裹 | 搜索、筛选、统计合并到一个卡片 |
| 内容表单 | `.content-card` 包裹 | 可折叠，2 列 grid |
| 列表 | `.list-row` + `.space-y-2` | 统一卡片行样式 |
| 空态 | `.empty-state` | 虚线边框 + 图标 + 引导文案 |

### 6.3 设计 Token

所有颜色、间距、圆角通过 CSS 变量管理（`index.css` `:root`），
组件内通过 `style={{ color: "var(--text)" }}` 消费，不硬编码颜色值。

三套主题变体：
- `:root`（深色默认）— 深蓝黑背景 + cyan accent
- `:root[data-theme="dim"]` — 更深的对比变体
- `:root[data-theme="light"]` — 浅色背景 + 蓝色 accent

---

## 7. 数据库

详见 `docs/DATABASE-SCHEMA.md`。

当前迁移文件覆盖：

- `001_initial.sql`: 项目、关系、输出、记忆、Trace、Inbox、Blueprint、ContextPack 等基础表
- `002_blueprint_enhancements.sql`: Blueprint 扩展与会议表
- `003_agents.sql`: registered_agents
- `004_tasks.sql`: tasks

---

## 8. 配置

配置文件位于 `~/.agent-monitor/config.yaml`，首次启动自动生成。

默认服务：

- API: `http://127.0.0.1:3002`
- UI: `http://localhost:5173`
- DB: `postgresql://localhost:5432/agent_monitor`

---

## 9. 验证状态

| 项目 | 结果 | 说明 |
|------|------|------|
| `npm run typecheck` | 通过 | server + ui TypeScript 均通过 |
| `npm run build` | 通过 | Vite 提示主 chunk 超过 500 kB，当前不是阻断 |
| `npm test` | 未通过 | 测试文件使用 `node:test`，运行器是 Vitest |

当前设计文档里的“已实现”表示代码结构和主要接口已经存在，不等于端到端体验已经稳定。

---

## 10. 实施进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 0 | 项目清理 + PostgreSQL 基础设施 | 已实施 |
| Phase 1 | 数据层 + 项目注册 + Adapter + 输出归集 + 记忆服务 | 已实施 |
| Phase 2 | 统一前端页面 + 设计系统 | 已实施 |
| Phase 3 | Blueprint DAG 引擎 + 编辑器 + 多 Agent 会议 | 已实施，待 E2E 验证 |
| Phase 4 | Dream Mode + Context Injector | 已实施，待跨工具场景验证 |
| Phase 5 | Scheduler + Risk Assessment + UI 通铺 | 已实施，待测试体系收口 |

---

## 11. 更新记录

| 日期 | 版本 | 作者 | 变更 |
|------|------|------|------|
| 2026-05-31 | 2.0.0 | Claude | v2 完整重写：PG、项目注册、输出归集、记忆服务、前端工作台 |
| 2026-05-31 | 2.1.0 | DeepSeek | Phase 3-5 功能骨架补齐 |
| 2026-05-31 | 2.2.0 | Codex | 根据当前代码和验证结果校正状态，区分已实施与已验证 |
| 2026-06-01 | 2.2.1 | Claude | 补充 §6.1-6.3 前端布局规范；重构外壳嵌套（大页面嵌套小页面）；记忆库页面重设计（消除双重间距、统一工具栏卡片、搜索框对齐修复） |
