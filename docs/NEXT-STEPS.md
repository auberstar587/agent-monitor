# Agent Monitor v2 — 下一步计划

> 更新: 2026-05-31
> 当前状态: 功能骨架已实施，集成验证未完成
> 归档参考: `archive/20260531-completed/NEXT-STEPS.md`

---

## 0. 现在不要再做什么

- 不要继续堆新 Phase。
- 不要把“代码里有模块”写成“稳定完成”。
- 不要在本地 mock 链路没跑通前，把问题混到真实 Multica 集成里。

当前目标只有一个：把 v2 从“铺开了”收成“可信可用”。

---

## 1. P0: 恢复测试健康

### 问题

`npm run typecheck` 已通过，但 `npm test` 失败。

失败原因：server 测试文件使用 `node:test` + `node:assert`，项目脚本使用 `vitest run`，Vitest 报告没有 Vitest suite。

### 任务

1. 将 `packages/server/tests/blueprint-engine.test.ts` 改为 Vitest API。
2. 将 `packages/server/tests/decision-engine.test.ts` 改为 Vitest API。
3. 重新执行：

```bash
npm test
```

### 验收

- `npm test` 退出码为 0。
- `assessRisk` 现有用例继续通过。
- `blueprint-engine.test.ts` 不再出现 `No test suite found`。

---

## 2. P0: 最小端到端验收

### 任务

在本地 PostgreSQL 环境下完成一条主链路：

1. 启动后端和前端。
2. 创建 Project。
3. 创建 Task。
4. 创建 Output。
5. 创建 Memory。
6. 创建 Blueprint。
7. 保存 Blueprint 节点和边。
8. 运行 Blueprint。
9. 查看 Dashboard / Trace / Inbox 是否出现对应变化。

### 验收

- UI 无白屏。
- API 无 500。
- 数据刷新后仍存在。
- 失败时能定位到具体 API 或页面。

---

## 3. P1: QA 报告复测

### 任务

按 `docs/QA-REPORT.md` 逐项复测，不再保留空的“已修复但未复测”口径。

重点项：

- 前端 build
- scheduler 列表
- memory 重要度标签
- UUID 非法参数
- Dashboard 输出方向中文
- Inbox 类型标签
- Blueprint 节点删除
- Blueprint 节点保存持久化
- 会议创建与执行
- 蓝图定时面板

### 验收

- 每个测试项标注通过 / 失败 / 未执行。
- 失败项写明真实错误和下一步修复位置。

---

## 4. P1: API 边界收紧

### 任务

统一 UUID 参数校验，尤其是 Blueprint 路由：

- `GET /api/blueprints/:id`
- `PUT /api/blueprints/:id`
- `DELETE /api/blueprints/:id`
- `POST /api/blueprints/:id/clone`
- `GET /api/blueprints/:id/runs`
- `GET /api/blueprints/runs/:runId`
- `POST /api/blueprints/runs/:runId/cancel`

### 验收

- 非 UUID 参数返回 400。
- 不把非法 ID 传进数据库查询。

---

## 5. P1: Artifact / Git / Handoff 定义收口

这些能力仍是产品主链路的一部分，但当前实现还不完整。下一轮只做最小定义：

- Artifact: 建独立审查对象，连接 Task / Trace / Output。
- Git/Worktree: 先读状态和记录 diff，不自动执行高风险操作。
- Handoff: 从 failed / blocked task 生成交接摘要。

### 验收

- SPEC 和数据库 schema 对齐。
- UI 至少有入口或明确待实现标记。

---

## 6. P2: 真实 Multica 集成

等本地 mock 链路稳定后再接真实 Multica。

### 任务

1. 配置 `~/.agent-monitor/config.yaml` 的 Multica adapter。
2. 验证 HTTP API。
3. 验证 WebSocket 事件订阅。
4. 把 Multica task / agent / message 同步成 Agent Monitor 的 Task / Agent / Trace / Output。

### 验收

- 不修改 Multica 源码。
- 真实 Multica 中的任务状态能在 Agent Monitor 看到。
- 失败和等待用户输入能产生 Inbox。
