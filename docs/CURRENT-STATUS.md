# Agent Monitor — 当前项目状态

> 梳理日期: 2026-05-31
> 判断依据: 当前仓库代码、文档、`npm run typecheck`、`npm run build`、`npm test`

---

## 1. 总体结论

Agent Monitor 已经从早期 `dashboard/` / `web/` 原型迁移为 v2 monorepo：

- 后端: `packages/server`，Fastify 5 + TypeScript + PostgreSQL
- 前端: `packages/ui`，Vite 6 + React 19 + Tailwind CSS v4
- 根目录: npm workspaces，统一 `dev` / `build` / `typecheck` / `test`
- 旧实现: 旧 `dashboard/` 和 `web/` 文件已删除，遗留代码进入 `archive/`

当前项目方向已经收敛为本地 AI Agent 管理平台 / Multica 增强层，重点是跨工具记忆、Agent 输出归集、Blueprint 编排、ExecutionTrace、Inbox、自主执行和风险评估。

但它还不是稳定完成态。更准确的状态是：

> v2 主体结构和功能骨架已实施，类型检查已通过；测试体系、端到端链路、真实 Multica 集成仍在收口。

---

## 2. 当前代码结构

### 根目录

- `package.json`: v2 workspace 入口，版本 `2.0.0`
- `pnpm-workspace.yaml`: pnpm workspace 声明
- `SPEC.md`: 当前项目规范，版本 `2.2.0`
- `docs/PRODUCT-REQUIREMENTS.md`: 产品需求，版本 `2.2.0`
- `docs/DESIGN.md`: 设计文档，版本 `2.2.0`
- `archive/`: 旧需求、旧实现和已完成计划归档

### 后端 `packages/server`

主要模块：

- `src/index.ts`: Fastify 入口，注册 projects / outputs / memory / traces / blueprints / meetings / scheduler / decisions / agents / tasks 路由
- `src/db/`: PostgreSQL 连接与迁移
- `src/adapters/`: `mock` / `manual` / `multica` Adapter
- `src/services/project-registry.ts`: 本地项目注册与关系
- `src/services/agent-output-collector.ts`: Agent 输出归集
- `src/services/memory-service.ts`: 共享记忆、检索、Dream 整理
- `src/services/blueprint-engine.ts`: Blueprint DAG CRUD 与执行
- `src/services/meeting-service.ts`: 多 Agent 会议
- `src/services/context-injector.ts`: 项目上下文注入
- `src/services/scheduler.ts`: croner 内存调度
- `src/services/decision-engine.ts`: 风险评估与自动审批判断
- `src/services/task-manager.ts`: 本地任务管理

数据库迁移：

- `001_initial.sql`: 项目、关系、输出、记忆、Trace、Inbox、Blueprint、ContextPack 等基础表
- `002_blueprint_enhancements.sql`: Blueprint 扩展与会议表
- `003_agents.sql`: Agent 持久化注册
- `004_tasks.sql`: 本地任务表

### 前端 `packages/ui`

主要页面：

- `/`: Dashboard 总览
- `/projects`, `/projects/:id`: 项目列表与详情
- `/agents`, `/agents/:id`: Agent 列表与详情
- `/tasks`, `/tasks/:id`: 任务列表与详情
- `/outputs`: 输出时间线
- `/memory`: 记忆搜索与 Dream 操作
- `/inbox`: 待处理事项
- `/blueprints`: Blueprint 列表
- `/blueprints/:id`: Blueprint Studio DAG 编辑器
- `/settings`: 设置

---

## 3. 已实施能力

- v2 monorepo 基础结构
- Fastify API 服务入口
- PostgreSQL schema 与迁移系统
- Adapter 接口与 `mock` / `manual` / `multica` 实现
- 本地项目注册、项目关系、项目上下文 API
- Agent 输出归集与时间线 API
- 共享记忆 CRUD、全文检索、统计、Dream 整理
- ExecutionTrace 列表与详情 API
- Inbox 列表与 resolve API
- Blueprint CRUD、clone、run、runs、cancel
- Blueprint 节点与边保存端点
- 多 Agent meeting API
- Scheduler API 与 croner 内存调度
- Risk assessment API
- Agent 持久化注册与同步 API
- Task CRUD 与状态流转 API
- 前端主要页面和统一 Layout
- Blueprint Studio 可视化编辑器雏形

---

## 4. 当前验证结果

### 类型检查

命令:

```bash
npm run typecheck
```

结果: 通过。

### 构建

命令:

```bash
npm run build
```

结果: 通过。

说明：Vite 提示主 chunk 超过 500 kB，属于后续性能优化项，不阻断当前验收。

### 测试

命令:

```bash
npm test
```

结果: 失败。

实际情况：

- `assessRisk` 的 6 个 Node test 风格用例执行通过。
- Vitest 仍报告两个测试文件没有 Vitest suite：
  - `packages/server/tests/blueprint-engine.test.ts`
  - `packages/server/tests/decision-engine.test.ts`

根因判断：

测试文件使用 `node:test` + `node:assert`，但项目测试命令是 `vitest run`。当前测试风格和测试运行器不一致。

---

## 5. 当前风险与不一致

### P0: 测试体系不统一

这是当前最明确的工程健康阻塞项。建议统一改为 Vitest API，而不是继续让 `npm test` 跑出失败。

### P0: 端到端链路尚未验收

代码骨架已经铺开，但 Project → Task/Output/Memory → Blueprint → Trace/Inbox/Dashboard 的完整链路还需要真实跑一遍。

### P1: Blueprint API 的 UUID 校验不完整

`run` 和 `nodes` 等部分接口已有 `requireUUID`，但 `GET /api/blueprints/:id`、`PUT /api/blueprints/:id`、`DELETE /api/blueprints/:id`、`clone`、`runs`、`runId` 相关接口仍需统一校验。

### P1: Scheduler 当前是内存态

可以用于原型，但重启恢复、失败重试、历史追踪仍需补齐。

### P1: 前端仍有原型交互

部分页面仍使用 `alert()`，错误处理、空态和 toast 体验需要统一。

### P2: 真实集成能力仍需现场验证

Multica Adapter、WebSocket 订阅、真实任务消息同步、Blueprint 真执行链路，都需要端到端实测后才能从“有代码”升级为“可信完成”。

---

## 6. 下一步建议

### Step 1: 恢复工程健康

1. 将 server 测试统一改为 Vitest API。
2. 重新跑通：

```bash
npm run typecheck
npm run build
npm test
```

### Step 2: 做最小端到端验收

1. 启动 PostgreSQL 与后端。
2. 启动前端。
3. 创建 Project。
4. 创建 Task / Output / Memory。
5. 创建 Blueprint。
6. 保存节点与边。
7. 运行 Blueprint。
8. 查看 Trace / Inbox / Dashboard 是否同步。

### Step 3: 收口 QA 报告

1. 把 `docs/QA-REPORT.md` 中每项从待复测改成真实结果。
2. 对未通过项补回错误信息和责任模块。
3. 文档口径统一为“功能骨架已实施，验证收口中”。

### Step 4: 再接 Multica 真实集成

本地 mock 链路稳定后，再切到 Multica Adapter。否则问题会混在一起，定位成本会高。

---

## 7. 当前一句话状态

Agent Monitor v2 已完成主体重构和功能骨架铺设，类型检查已通过；当前关键工作是统一测试运行器、跑通最小端到端链路，再推进真实 Multica 集成。
