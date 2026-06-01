# Agent Monitor v2 — Phase 3-5 任务清单 + 设计

> 给 DeepSeek 执行用
> 日期: 2026-05-31
> 作者: Claude

---

## ⚠️ 关键约束（必读）

**这些是硬约束，违反任何一条都会导致代码无法运行：**

1. **数据库是 PostgreSQL 17**，不是 SQLite。使用 `pg` 驱动（已在 `packages/server/src/db/client.ts` 中封装为 `getPool()` / `query()` / `queryOne()`）。SQL 必须使用 PG 语法：`gen_random_uuid()`、`JSONB`、`TIMESTAMPTZ`、`to_tsvector`、`$1` 参数化查询。
2. **迁移系统**在 `packages/server/src/db/migrate.ts`，迁移文件放在 `packages/server/src/db/migrations/`，通过 `_migrations` 表追踪版本。新建迁移文件命名为 `002_xxx.sql`。
3. **已有的表不要重建**：`blueprints` / `blueprint_nodes` / `blueprint_edges` / `blueprint_runs` / `blueprint_node_runs` 在 `001_initial.sql` 中已定义。新迁移只做 `ALTER TABLE` 或 `CREATE TABLE IF NOT EXISTS` 新表。
4. **后端框架是 Fastify 5**：路由处理器签名为 `(req: FastifyRequest, reply: FastifyReply) => {}`，不是 `req.reply`。参考现有路由文件 `routes/projects.ts`。
5. **前端是 React 19 + Tailwind v4 + Vite 6 + React Router v7**：CSS 组件类定义在 `index.css`（如 `.content-card`、`.list-row`、`.status-pill`、`.type-badge`、`.empty-state`），直接使用，不要引入 shadcn/Radix。
6. **API 前缀是 `/api/`**，前端通过 Vite proxy 转发到 `http://127.0.0.1:3002`。
7. **中文界面**：所有新增页面的标签、按钮、空状态文案使用中文。
8. **路由注册**：新页面必须在 `App.tsx` 添加路由 + `Layout.tsx` 的 `NAV_ITEMS` 添加导航项。
9. **`index.ts` 路由注册**：新的路由文件必须在 `packages/server/src/index.ts` 中注册到 Fastify 实例。

---

## 已有代码结构（快速参考）

```
packages/server/src/
├── index.ts               # Fastify 入口，已有 routes/projects|outputs|memory|traces 注册
├── config.ts              # YAML 配置加载
├── db/
│   ├── client.ts          # PG 连接池: getPool() / query(sql, params) / queryOne(sql, params)
│   ├── migrate.ts         # 文件迁移执行器
│   └── migrations/
│       └── 001_initial.sql  # 完整 schema (14 表，含 blueprints 系列)
├── adapters/
│   ├── interface.ts       # AgentPlatformAdapter 接口
│   ├── registry.ts        # Adapter 工厂
│   ├── mock/              # Mock adapter
│   ├── manual/            # 手动输入 adapter
│   └── multica/           # Multica adapter
├── services/
│   ├── project-registry.ts       # 项目注册 (已实现)
│   ├── agent-output-collector.ts  # 输出归集 (已实现)
│   └── memory-service.ts          # 记忆服务 (已实现)
└── routes/
    ├── projects.ts        # /api/projects (已实现)
    ├── outputs.ts         # /api/outputs, /api/timeline (已实现)
    ├── memory.ts          # /api/memory (已实现)
    └── traces.ts          # /api/traces, /api/inbox (已实现)

packages/ui/src/
├── App.tsx                # React Router 配置 (已有 6 个路由)
├── index.css              # 设计系统 (CSS 组件类: .content-card / .list-row / .status-pill 等)
├── components/Layout.tsx  # 侧边栏 (NAV_ITEMS 数组控制导航)
├── lib/api.ts             # API client (fetch 封装)
├── stores/index.ts        # zustand store
└── pages/                 # 6 个已实现页面
```

---

## 总览

| Phase | 内容 | 预估 | 优先级 |
|-------|------|------|--------|
| Phase 3 | 蓝图 DAG 引擎 + DAG 编辑器 + 多 Agent 会议 | 5-7 天 | P0 |
| Phase 4 | 记忆增强 + 跨项目上下文注入 | 3-5 天 | P1 |
| Phase 5 | 自主决策 + Always-on 执行 | 3-5 天 | P2 |

---

## Phase 3: 蓝图 DAG 引擎 + 多 Agent 协同

### Step 1: 数据库迁移

**文件**: `packages/server/src/db/migrations/002_blueprint_enhancements.sql`

已有的 `blueprints` / `blueprint_nodes` / `blueprint_edges` / `blueprint_runs` / `blueprint_node_runs` 表在 `001_initial.sql` 中已定义。**不要重建这些表**，只做增量修改：

```sql
-- 蓝图表增强
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN DEFAULT false;
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual';
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '{}';

-- 蓝图节点增强
ALTER TABLE blueprint_nodes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE blueprint_nodes ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
-- config 内容根据 node_type 不同而不同：
--   agent:    { adapter, agentId, prompt_template, model, max_tokens }
--   manager:  { distribution: "round_robin" | "broadcast", slot_count }
--   slot:     { parallelism }
--   meeting:  { participants, rounds, consensus_rule: "unanimous" | "majority" | "chairman", chairman_agent }
--   condition:{ expression, true_branch, false_branch }
--   summary:  { template }
--   approval: { approver, timeout_ms, auto_approve_below_risk }

-- 会议表（新增）
CREATE TABLE IF NOT EXISTS meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_run_id UUID REFERENCES blueprint_runs(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  participants  JSONB NOT NULL DEFAULT '[]',
  rounds        INTEGER NOT NULL DEFAULT 3,
  consensus_rule TEXT NOT NULL DEFAULT 'majority',
  chairman_agent TEXT,
  result        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  agent_name    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'participant',
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**执行**: 运行迁移 `psql -d agent_monitor -f packages/server/src/db/migrations/002_blueprint_enhancements.sql`

### Step 2: 蓝图引擎服务

**文件**: `packages/server/src/services/blueprint-engine.ts`（新建，~500 行）

使用已有的 `query()` / `queryOne()` 函数（从 `../db/client.js` 导入）。

```typescript
import { query, queryOne } from '../db/client.js';

// 核心接口
interface BlueprintEngine {
  createBlueprint(data: CreateBlueprintDTO): Promise<Blueprint>;
  getBlueprint(id: string): Promise<BlueprintWithGraph>;
  listBlueprints(): Promise<Blueprint[]>;
  updateBlueprint(id: string, data: Partial<Blueprint>): Promise<Blueprint>;
  deleteBlueprint(id: string): Promise<void>;

  runBlueprint(id: string): Promise<BlueprintRun>;
  getRun(runId: string): Promise<BlueprintRunDetail>;
  listRuns(blueprintId: string): Promise<BlueprintRun[]>;
  cancelRun(runId: string): Promise<void>;
}

// 执行核心逻辑
async function runUntilBlockedOrDone(runId: string): Promise<void> {
  // 1. 加载蓝图 nodes + edges
  // 2. 找到所有 ready 节点（所有上游都 completed）
  // 3. 并行执行 ready 节点 (Promise.all)
  // 4. 每个节点完成后更新状态，检查下游是否 ready
  // 5. 遇到 waiting_approval → 暂停，写入 inbox_items
  // 6. 所有节点完成 → 标记 run 为 completed
  // 7. 任何节点失败 → 标记 run 为 failed，写入 inbox_items
}

// 节点执行器（按 node_type 分发）
async function executeNode(node: BlueprintNode, context: RunContext): Promise<NodeResult> {
  switch (node.type) {
    case 'agent':    return executeAgentNode(node, context);
    case 'manager':  return executeManagerNode(node, context);
    case 'slot':     return executeSlotNode(node, context);
    case 'meeting':  return executeMeetingNode(node, context);
    case 'condition':return executeConditionNode(node, context);
    case 'summary':  return executeSummaryNode(node, context);
    case 'approval': return executeApprovalNode(node, context);
  }
}

// Agent 节点执行 — 通过 Adapter 层派发到具体 Agent
async function executeAgentNode(node, context): Promise<NodeResult> {
  const config = node.config;
  const adapter = getAdapter(config.adapter);
  const prompt = renderTemplate(config.prompt_template, context.upstreamOutputs);

  // 方案 1: 通过 adapter 发起任务（multica/openclaw）
  if (adapter) {
    const task = await adapter.createTask({ agentId: config.agentId, prompt });
    const result = await waitForTask(task.id);
    return { status: 'completed', output: result.output };
  }

  // 方案 2: 本地执行（claude-code CLI）
  if (config.adapter === 'claude-code') {
    const result = await execClaudeCode(prompt, config.model);
    return { status: 'completed', output: result };
  }

  // 方案 3: Mock（开发用）
  return { status: 'completed', output: `[Mock] ${prompt}` };
}
```

### Step 3: 会议服务

**文件**: `packages/server/src/services/meeting-service.ts`（新建）

```typescript
import { query, queryOne } from '../db/client.js';

interface MeetingService {
  createMeeting(data: CreateMeetingDTO): Promise<Meeting>;
  getMeeting(id: string): Promise<MeetingWithMessages>;
  listMeetings(): Promise<Meeting[]>;
  runMeeting(meetingId: string): Promise<MeetingResult>;
}

// 会议执行流程：
// 1. 按顺序让每个 participant 发言
// 2. 每轮发言 = 调用 Agent 的 LLM，传入之前的讨论记录
// 3. 达到 rounds 后，让 chairman 总结共识
// 4. 按 consensus_rule 判断是否达成共识
//    - unanimous: 所有 participant 都同意
//    - majority: 超过半数同意
//    - chairman: chairman 一票决定
```

### Step 4: 蓝图 + 会议 API 路由

**文件**: `packages/server/src/routes/blueprints.ts`（新建）

Fastify 5 路由格式，参考已有的 `routes/projects.ts`：

```
GET    /api/blueprints              — 蓝图列表
POST   /api/blueprints              — 创建蓝图 { name, description, nodes, edges }
GET    /api/blueprints/:id          — 蓝图详情 + nodes + edges
PUT    /api/blueprints/:id          — 更新蓝图
DELETE /api/blueprints/:id          — 删除蓝图
POST   /api/blueprints/:id/run      — 运行蓝图
POST   /api/blueprints/:id/clone    — 克隆蓝图
GET    /api/blueprints/:id/runs     — 运行记录列表
GET    /api/blueprints/runs/:runId  — 运行详情 + node_runs
POST   /api/blueprints/runs/:runId/cancel — 取消运行
```

**文件**: `packages/server/src/routes/meetings.ts`（新建）

```
GET    /api/meetings           — 会议列表
POST   /api/meetings           — 创建会议
GET    /api/meetings/:id       — 会议详情 + 发言记录
POST   /api/meetings/:id/start — 开始会议
```

**必须同时修改**: `packages/server/src/index.ts` — 注册新路由：

```typescript
import blueprintRoutes from './routes/blueprints.js';
import meetingRoutes from './routes/meetings.js';

// 在已有路由注册后面添加
fastify.register(blueprintRoutes);
fastify.register(meetingRoutes);
```

### Step 5: 前端 API + Store 扩展

**文件**: `packages/ui/src/lib/api.ts` 添加蓝图 API：

```typescript
// Blueprint APIs — 追加到 api 对象中
listBlueprints: () => fetch('/api/blueprints').then(r => r.json()),
getBlueprint: (id: string) => fetch(`/api/blueprints/${id}`).then(r => r.json()),
createBlueprint: (data: any) => fetch('/api/blueprints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
updateBlueprint: (id: string, data: any) => fetch(`/api/blueprints/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
deleteBlueprint: (id: string) => fetch(`/api/blueprints/${id}`, { method: 'DELETE' }),
runBlueprint: (id: string) => fetch(`/api/blueprints/${id}/run`, { method: 'POST' }).then(r => r.json()),
listRuns: (blueprintId: string) => fetch(`/api/blueprints/${blueprintId}/runs`).then(r => r.json()),
getRun: (runId: string) => fetch(`/api/blueprints/runs/${runId}`).then(r => r.json()),
cancelRun: (runId: string) => fetch(`/api/blueprints/runs/${runId}/cancel`, { method: 'POST' }),
```

**文件**: `packages/ui/src/stores/index.ts` 添加蓝图状态：

```typescript
blueprints: [] as any[],
fetchBlueprints: async () => { ... },
currentBlueprint: null as any,
setCurrentBlueprint: (bp: any) => set({ currentBlueprint: bp }),
```

### Step 6: 前端蓝图页面

**前置**: 安装 `@xyflow/react`

```bash
cd /Users/hanyongfeng/AI/agent-monitor && pnpm --filter @agent-monitor/ui add @xyflow/react
```

**文件**: `packages/ui/src/pages/BlueprintList.tsx`（新建）

蓝图列表页，参考 Projects.tsx 的列表布局风格。使用 `.list-row` 组件类。

**文件**: `packages/ui/src/pages/BlueprintStudio.tsx`（新建）

DAG 编辑器页面。使用 `@xyflow/react`。

```typescript
import { ReactFlow, Background, Controls, MiniMap, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// 页面布局：
// - 顶栏：蓝图名称 + 运行按钮 + 保存按钮
// - 左侧面板：节点类型列表（可拖拽）
// - 中间：DAG 画布
// - 右侧面板：选中节点的配置编辑器

// 自定义节点组件
const nodeTypes = {
  agent:    AgentNode,     // 蓝色，Bot 图标
  manager:  ManagerNode,   // 紫色，Crown 图标
  slot:     SlotNode,      // 绿色，Parallel 图标
  meeting:  MeetingNode,   // 橙色，MessageSquare 图标
  condition:ConditionNode, // 黄色，GitBranch 图标
  summary:  SummaryNode,   // 青色，Filter 图标
  approval: ApprovalNode,  // 红色，Shield 图标
};

// 节点样式使用 CSS 组件类 .content-card，
// 节点尺寸: 宽 224px，min-height 98px
// 选中态: border-color: var(--accent) + box-shadow: 0 0 0 3px rgba(34,211,238,0.16)
```

### Step 7: 路由 + 导航注册

**文件**: `packages/ui/src/App.tsx` — 添加蓝图路由：

```typescript
import BlueprintList from "./pages/BlueprintList";
import BlueprintStudio from "./pages/BlueprintStudio";

// 在已有路由后添加
<Route path="/blueprints" element={<BlueprintList />} />
<Route path="/blueprints/:id" element={<BlueprintStudio />} />
```

**文件**: `packages/ui/src/components/Layout.tsx` — NAV_ITEMS 添加：

```typescript
import { GitBranch } from "lucide-react";  // 如未导入则添加

// 在 NAV_ITEMS 数组中添加（放在 "输出" 和 "记忆" 之间或 "收件箱" 之前）
{ path: "/blueprints", label: "蓝图", icon: GitBranch },
```

### Phase 3 验收标准

```bash
# 后端
curl http://localhost:3002/api/blueprints                    # 返回 []
curl -X POST http://localhost:3002/api/blueprints -H 'Content-Type: application/json' \
  -d '{"name":"测试蓝图","nodes":[{"type":"agent","config":{"adapter":"mock","prompt_template":"分析 {{project}} 的架构"}}],"edges":[]}'
curl -X POST http://localhost:3002/api/blueprints/:id/run

# 前端
# 访问 http://localhost:5173/blueprints — 蓝图列表
# 创建蓝图 → 进入 DAG 编辑器 → 添加节点 + 连线 → 运行
```

---

## Phase 4: 记忆增强 + 跨项目上下文注入

### Step 1: Dream Mode 记忆合并

**文件**: `packages/server/src/services/memory-service.ts`（扩展已有文件）

新增函数 `dreamConsolidation()`：

```typescript
// 使用已有的 query() 函数
async function dreamConsolidation(): Promise<void> {
  // 1. 获取所有 active 状态的记忆
  const memories = await query('SELECT * FROM shared_memory WHERE status = $1', ['active']);

  // 2. 相似度检测（基于已有的 searchMemory 全文检索）
  for (const mem of memories) {
    const similar = await searchMemory(mem.content, 5);
    const duplicates = similar.filter(s => s.id !== mem.id && s.score > 0.85);
    if (duplicates.length > 0) {
      await mergeMemories(mem, duplicates);
    }
  }

  // 3. 超过 30 天未被 retrieved_at 且 importance < 5 的记忆，降低 importance
  await query(`
    UPDATE shared_memory SET importance = GREATEST(1, importance - 1)
    WHERE (retrieved_at IS NULL OR retrieved_at < now() - interval '30 days')
    AND importance < 5 AND status = 'active'
  `);

  // 4. importance 降到 1 的记忆，标记为 archived
  await query(`
    UPDATE shared_memory SET status = 'archived'
    WHERE importance <= 1 AND status = 'active'
  `);
}
```

### Step 2: 跨项目上下文注入

**文件**: `packages/server/src/services/context-injector.ts`（新建）

```typescript
import { query, queryOne } from '../db/client.js';

export async function buildContext(projectId: string): Promise<ProjectContext> {
  // 查询项目基本信息
  const project = await queryOne('SELECT * FROM local_projects WHERE id = $1', [projectId]);

  // 查询项目关系
  const relations = await query(`
    SELECT pr.relation_type, pr.description, lp.name as target
    FROM project_relations pr JOIN local_projects lp ON pr.target_id = lp.id
    WHERE pr.source_id = $1
  `, [projectId]);

  // 查询最近决策
  const recentDecisions = await query(`
    SELECT content, source, created_at FROM shared_memory
    WHERE (project_id = $1 OR project_id IS NULL) AND type = 'decision' AND status = 'active'
    ORDER BY importance DESC, created_at DESC LIMIT 10
  `, [projectId]);

  // 查询关联项目的最近输出
  const relatedOutputs = await query(`
    SELECT ao.source, ao.title, ao.direction, ao.created_at
    FROM agent_outputs ao
    WHERE ao.project_id = $1
    ORDER BY ao.created_at DESC LIMIT 5
  `, [projectId]);

  return { project, relations, recentDecisions, relatedOutputs };
}
```

### Step 3: API 增强

**文件**: `packages/server/src/routes/memory.ts` — 追加路由：

```
GET  /api/memory/stats           — 记忆统计
POST /api/memory/dream           — 手动触发 Dream Mode
```

**文件**: `packages/server/src/routes/projects.ts` — 追加路由：

```
GET  /api/projects/:id/context   — 项目完整上下文（含记忆注入）
```

### Step 4: 前端增强

- **Memory 页** — 增加筛选（按类型、按重要性、按项目）+ Dream Mode 手动触发按钮
- **Dashboard** — 增加「记忆统计」卡片
- **Projects 页** — 项目详情弹窗增加「上下文预览」

---

## Phase 5: 自主决策 + Always-on 执行

### Step 1: 定时调度器

**文件**: `packages/server/src/services/scheduler.ts`（新建）

```typescript
// 使用 croner 库
import { Cron } from 'croner';
import { query } from '../db/client.js';

// 调度蓝图定期执行
export function scheduleBlueprint(blueprintId: string, cronExpression: string) {
  const job = new Cron(cronExpression, () => runBlueprint(blueprintId));
  return { id: generateId(), blueprintId, cronExpression, job };
}
```

前置：`cd packages/server && pnpm add croner`

### Step 2: 风险评估 + 自动审批

**文件**: `packages/server/src/services/decision-engine.ts`（新建）

```typescript
// 自动审批规则:
// - 修改文件数 < 5 且不涉及核心模块 → autoApprove
// - 修改文件数 >= 5 或涉及 core/ 目录 → 强制人工审批
// - 任何 delete 操作 → 强制人工审批
export function assessRisk(action: ActionDescription): RiskAssessment {
  // ...
}
```

### Step 3: 前端增强

- **BlueprintStudio** — 运行历史 tab
- **Dashboard** — 调度任务状态区域
- **Inbox** — 增加 `approval` 类型

---

## 关键设计参考

### 蓝图节点类型

| 节点类型 | 图标颜色 | config 参数 | 说明 |
|----------|---------|------------|------|
| `agent` | 蓝色 | adapter, agentId, prompt_template, model | 单 Agent 执行 |
| `manager` | 紫色 | distribution, slot_count | 管理分发节点 |
| `slot` | 绿色 | parallelism | 并行执行槽 |
| `meeting` | 橙色 | participants, rounds, consensus_rule | 多 Agent 讨论 |
| `condition` | 黄色 | expression | 条件分支 |
| `summary` | 青色 | template | 汇总上游输出 |
| `approval` | 红色 | approver, timeout_ms | 人工审批门 |

### 蓝图执行状态机

```
节点: pending → ready → running → completed
                                → failed
                                → waiting_approval → approved → completed
                                                   → rejected → failed

运行: queued → running → completed
                       → failed
                       → cancelled
```

### 会议共识规则

| 规则 | 说明 |
|------|------|
| `unanimous` | 所有 participant 必须同意 |
| `majority` | 超过半数同意即通过 |
| `chairman` | chairman 一票决定 |

---

## 需要安装的依赖

```bash
# Phase 3
cd /Users/hanyongfeng/AI/agent-monitor && pnpm --filter @agent-monitor/ui add @xyflow/react

# Phase 5
cd /Users/hanyongfeng/AI/agent-monitor && pnpm --filter @agent-monitor/server add croner
```

---

## 更新记录

| 日期 | 版本 | 作者 | 变更 |
|------|------|------|------|
| 2026-05-31 | 1.0.0 | Claude | 初始版本：Phase 3-5 完整任务清单 + 设计 |
| 2026-05-31 | 1.1.0 | Claude | 增加关键约束章节、已有代码结构参考、明确 PG/Fastify 5 等技术栈 |
