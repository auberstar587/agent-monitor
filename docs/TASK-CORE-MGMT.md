# 任务文档：项目管理 / Agent 管理 / 任务管理 优化

> 优先级：P0 | 预计工时：12h | 执行顺序：A → B → C → D
> 蓝图/会议功能本次不动

---

## 现状分析

### 项目管理
- 后端：`GET /api/projects` 列表、`POST` 创建、`GET /:id` 详情、`DELETE` 删除
- **缺失**：无 `PUT /:id` 编辑接口、前端无详情页、项目卡片不可点击
- 关键文件：
  - `packages/server/src/services/project-registry.ts` — 服务层（LocalProject 接口 + CRUD）
  - `packages/server/src/routes/projects.ts` — 路由层（已有 requireUUID 校验）

### Agent 管理
- 后端：`/api/agents` 和 `/api/agents/:id` 是 `index.ts` 内联路由，直接委托 adapter（无 DB 持久化）
- 前端：纯只读列表，卡片链接指向自身，无详情页
- **缺失**：无 agents 表、无服务层、无质量追踪、无持久化
- 关键文件：
  - `packages/server/src/index.ts` 第 53-62 行 — 当前内联 agent 路由
  - `packages/server/src/adapters/registry.ts` — adapter 注册（getAdapter 返回 AgentPlatformAdapter 实例）
  - `packages/ui/src/pages/Agents.tsx` — 前端 Agent 列表页

### 任务管理
- **完全不存在**：无 tasks 表、无路由、无服务、无前端页面
- 现有 `execution_traces` 只是执行日志，不是任务管理

### 数据库
- 迁移文件在 `packages/server/src/db/migrations/`，编号递增（现有 001、002）
- 自动迁移器：`packages/server/src/db/migrate.ts`（按编号顺序执行）
- DB 工具：`packages/server/src/db/client.ts`（`query<T>()` + `queryOne<T>()`）

### 前端架构
- 路由：`packages/ui/src/App.tsx`（React Router，嵌套在 Layout 下）
- 导航：`packages/ui/src/components/Layout.tsx`（NAV_ITEMS 数组）
- API 客户端：`packages/ui/src/lib/api.ts`（`request<T>()` 封装）
- 全局状态：`packages/ui/src/stores/index.ts`（Zustand）
- 样式：`packages/ui/src/index.css`（CSS 变量 + 工具类：`.content-card`、`.list-row`、`.status-pill`、`.button`、`.empty-state`）
- 暗色主题，全中文界面，图标用 lucide-react

---

## Phase A：项目管理增强

### A1. 后端

**修改 `packages/server/src/services/project-registry.ts`**：

新增 `updateProject` 函数：

```typescript
export async function updateProject(
  id: string,
  updates: Partial<Pick<LocalProject, "name" | "description" | "tech_stack" | "goals" | "status">>,
): Promise<LocalProject | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name); }
  if (updates.description !== undefined) { sets.push(`description = $${idx++}`); params.push(updates.description); }
  if (updates.tech_stack !== undefined) { sets.push(`tech_stack = $${idx++}::jsonb`); params.push(JSON.stringify(updates.tech_stack)); }
  if (updates.goals !== undefined) { sets.push(`goals = $${idx++}::jsonb`); params.push(JSON.stringify(updates.goals)); }
  if (updates.status !== undefined) { sets.push(`status = $${idx++}`); params.push(updates.status); }

  if (sets.length === 0) return getProject(id);
  sets.push(`updated_at = now()`);
  params.push(id);

  return queryOne<LocalProject>(
    `UPDATE local_projects SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params,
  );
}
```

**修改 `packages/server/src/routes/projects.ts`**：

在 `delete` 路由之前添加 PUT：

```typescript
fastify.put("/api/projects/:id", async (req: FastifyRequest, reply: FastifyReply) => {
  const { id } = req.params as { id: string };
  if (!requireUUID(id, reply)) return;
  const body = req.body as Partial<Pick<LocalProject, "name" | "description" | "tech_stack" | "goals" | "status">>;
  const project = await updateProject(id, body);
  if (!project) return reply.code(404).send({ error: "project not found" });
  return project;
});
```

别忘了在顶部 import 中加入 `updateProject`。

### A2. 前端

**修改 `packages/ui/src/lib/api.ts`** — 新增方法：

```typescript
updateProject: (id: string, data: any) =>
  request<any>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
```

**新建 `packages/ui/src/pages/ProjectDetail.tsx`**：

页面功能：
- `useParams()` 获取 id，加载项目（`api.getProject`）、关系（`api.getRelations`）、最近输出（`api.listOutputs({ project_id })`）
- 顶部：项目名称（可点击编辑）+ 状态 pill + 路径
- 元数据区：description（可编辑）、tech_stack badges、goals 列表
- 关系列表 + 添加关系表单（选择目标项目 + 关系类型）
- 最近输出列表（复用 Dashboard 输出行的样式）
- 编辑模式：点击字段切换为 input/textarea，失焦或回车保存
- 返回按钮链接到 `/projects`

样式参考现有页面，使用 `.content-card`、`.list-row`、`.button`、`.status-pill` 等现有 CSS 类。

**修改 `packages/ui/src/App.tsx`** — 添加路由：

```tsx
import ProjectDetail from "./pages/ProjectDetail";
// ...
<Route path="projects/:id" element={<ProjectDetail />} />
```

放在 `projects` 路由之后。

**修改 `packages/ui/src/pages/Projects.tsx`** — 项目卡片可点击：

将卡片外层 div 改为 `<Link to={`/projects/${p.id}`}>`（参考 BlueprintList.tsx 的做法）。

---

## Phase B：Agent 管理

### B1. 数据库迁移

**新建 `packages/server/src/db/migrations/003_agents.sql`**：

```sql
-- Agent management: persistent agent registry with quality tracking
CREATE TABLE IF NOT EXISTS registered_agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  platform        TEXT NOT NULL DEFAULT 'unknown',
  role            TEXT NOT NULL DEFAULT 'developer',
  status          TEXT NOT NULL DEFAULT 'offline',
  capabilities    JSONB DEFAULT '[]',
  current_task_id TEXT,
  current_project_id UUID REFERENCES local_projects(id) ON DELETE SET NULL,
  quality         JSONB DEFAULT '{"successCount":0,"failCount":0,"avgDurationMs":0}',
  last_seen_at    TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON registered_agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_platform ON registered_agents(platform);
```

### B2. 后端服务

**新建 `packages/server/src/services/agent-registry.ts`**：

```typescript
import { query, queryOne } from "../db/client.js";

export interface RegisteredAgent {
  id: string;
  name: string;
  platform: string;
  role: string;
  status: string;
  capabilities: string[];
  current_task_id?: string;
  current_project_id?: string;
  quality: { successCount: number; failCount: number; avgDurationMs: number };
  last_seen_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// UPSERT: insert or update on conflict (id)
export async function registerAgent(agent: { id: string; name: string; platform?: string; role?: string; status?: string; capabilities?: string[] }): Promise<RegisteredAgent> {
  return queryOne<RegisteredAgent>(
    `INSERT INTO registered_agents (id, name, platform, role, status, capabilities, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       status = EXCLUDED.status,
       last_seen_at = now(),
       updated_at = now()
     RETURNING *`,
    [agent.id, agent.name, agent.platform || 'unknown', agent.role || 'developer',
     agent.status || 'online', JSON.stringify(agent.capabilities || [])],
  )!;
}

export async function listAgents(filter?: { status?: string; platform?: string }): Promise<RegisteredAgent[]> {
  if (filter?.status) return query<RegisteredAgent>("SELECT * FROM registered_agents WHERE status = $1 ORDER BY name", [filter.status]);
  if (filter?.platform) return query<RegisteredAgent>("SELECT * FROM registered_agents WHERE platform = $1 ORDER BY name", [filter.platform]);
  return query<RegisteredAgent>("SELECT * FROM registered_agents ORDER BY name");
}

export async function getAgent(id: string): Promise<RegisteredAgent | null> {
  return queryOne<RegisteredAgent>("SELECT * FROM registered_agents WHERE id = $1", [id]);
}

export async function updateAgent(id: string, updates: Partial<Pick<RegisteredAgent, "name" | "role" | "capabilities">>): Promise<RegisteredAgent | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name); }
  if (updates.role !== undefined) { sets.push(`role = $${idx++}`); params.push(updates.role); }
  if (updates.capabilities !== undefined) { sets.push(`capabilities = $${idx++}::jsonb`); params.push(JSON.stringify(updates.capabilities)); }
  if (sets.length === 0) return getAgent(id);
  sets.push("updated_at = now()");
  params.push(id);
  return queryOne<RegisteredAgent>(`UPDATE registered_agents SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, params);
}

export async function updateAgentQuality(agentId: string, success: boolean, durationMs: number): Promise<void> {
  await query(
    `UPDATE registered_agents SET
       quality = jsonb_set(
         jsonb_set(
           jsonb_set(quality, '{successCount}', (COALESCE((quality->>'successCount')::int, 0) + $1)::text::jsonb),
           '{failCount}', (COALESCE((quality->>'failCount')::int, 0) + $2)::text::jsonb),
         '{avgDurationMs}', ((COALESCE((quality->>'avgDurationMs')::int, 0) * GREATEST(COALESCE((quality->>'successCount')::int, 0) + COALESCE((quality->>'failCount')::int, 0) - 1, 0) + $3) / GREATEST(COALESCE((quality->>'successCount')::int, 0) + COALESCE((quality->>'failCount')::int, 0), 1))::text::jsonb),
       updated_at = now()
     WHERE id = $4`,
    [success ? 1 : 0, success ? 0 : 1, durationMs, agentId],
  );
}

// Sync all agents from adapter into DB
export async function syncAgentsFromAdapter(adapter: any): Promise<number> {
  const agents = await adapter.getAgents();
  for (const a of agents) {
    await registerAgent({ id: a.id, name: a.name, platform: a.platform, role: a.role, status: a.status, capabilities: a.capabilities });
  }
  return agents.length;
}
```

### B3. 后端路由

**新建 `packages/server/src/routes/agents.ts`**：

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { listAgents, getAgent, updateAgent, syncAgentsFromAdapter } from "../services/agent-registry.js";
import { getAdapter } from "../adapters/registry.js";
import { query } from "../db/client.js";

export async function agentRoutes(fastify: FastifyInstance) {
  // List agents: merge DB data with adapter real-time status
  fastify.get("/api/agents", async () => {
    const dbAgents = await listAgents();
    try {
      const adapter = await getAdapter();
      if (adapter) {
        const liveAgents = await adapter.getAgents();
        // Merge: live status overrides DB, but quality/metadata stays from DB
        const liveMap = new Map(liveAgents.map((a: any) => [a.id, a]));
        return dbAgents.map(db => {
          const live = liveMap.get(db.id);
          return live ? { ...db, status: live.status, current_task_id: live.currentTaskId, last_seen_at: new Date().toISOString() } : db;
        });
      }
    } catch { /* adapter unavailable, return DB data */ }
    return dbAgents;
  });

  // Get agent detail + recent traces
  fastify.get("/api/agents/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const agent = await getAgent(id);
    if (!agent) return reply.code(404).send({ error: "agent not found" });
    // Get recent traces for this agent
    const traces = await query("SELECT * FROM execution_traces WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 20", [id]);
    return { ...agent, traces };
  });

  // Update agent metadata
  fastify.put("/api/agents/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; role?: string; capabilities?: string[] };
    const agent = await updateAgent(id, body);
    if (!agent) return reply.code(404).send({ error: "agent not found" });
    return agent;
  });

  // Manual sync from adapter
  fastify.post("/api/agents/sync", async () => {
    try {
      const adapter = await getAdapter();
      if (!adapter) return { synced: 0 };
      const count = await syncAgentsFromAdapter(adapter);
      return { synced: count };
    } catch { return { synced: 0 }; }
  });
}
```

**修改 `packages/server/src/index.ts`**：

1. 删除第 53-62 行的内联 agent 路由（`fastify.get("/api/agents", ...)` 和 `fastify.get("/api/agents/:id", ...)`）
2. 添加 import：`import { agentRoutes } from "./routes/agents.js";`
3. 在路由注册区添加：`await fastify.register(agentRoutes);`
4. 在 adapter 初始化后添加同步：
   ```typescript
   // Sync agents from adapter to DB on startup
   if (adapter) {
     const { syncAgentsFromAdapter } = await import("./services/agent-registry.js");
     const count = await syncAgentsFromAdapter(adapter);
     console.log(`[server] synced ${count} agents from adapter`);
   }
   ```

### B4. 前端

**修改 `packages/ui/src/lib/api.ts`**：

更新 Agent 相关方法类型，新增 `updateAgent`：

```typescript
updateAgent: (id: string, data: any) =>
  request<any>(`/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
syncAgents: () =>
  request<{ synced: number }>("/agents/sync", { method: "POST" }),
```

**新建 `packages/ui/src/pages/AgentDetail.tsx`**：

页面功能：
- 加载 agent 详情（`api.getAgent(id)` — 注意现有 api.getAgent 返回 adapter 数据，需改为调用新接口）
- Agent 头部：name（可编辑）、platform badge、role（可编辑）、status pill
- 质量指标卡片：成功率、失败次数、平均耗时（从 quality JSONB 读取）
- 最近执行 traces 列表（response 中已包含 traces 数组）
- 内联编辑 name/role
- 返回按钮链接到 `/agents`

**修改 `packages/ui/src/App.tsx`** — 添加路由：

```tsx
import AgentDetail from "./pages/AgentDetail";
// ...
<Route path="agents/:id" element={<AgentDetail />} />
```

**修改 `packages/ui/src/pages/Agents.tsx`** — 卡片可点击：

将卡片改为 `<Link to={`/agents/${a.id}`}>`。

**修改 `packages/ui/src/pages/Dashboard.tsx`** — Agent 状态区链接到详情：

Agent 行的 `Link to="/agents"` 改为 `Link to={`/agents/${agent.id}`}`。

---

## Phase C：任务管理

### C1. 数据库迁移

**新建 `packages/server/src/db/migrations/004_tasks.sql`**：

```sql
-- Task management: local task tracking with state machine
CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     TEXT UNIQUE,
  project_id      UUID REFERENCES local_projects(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL DEFAULT 'general',
  status          TEXT NOT NULL DEFAULT 'pending',
  priority        TEXT NOT NULL DEFAULT 'medium',
  assignee_id     TEXT REFERENCES registered_agents(id) ON DELETE SET NULL,
  reviewer_id     TEXT REFERENCES registered_agents(id) ON DELETE SET NULL,
  labels          JSONB DEFAULT '[]',
  trace_id        UUID REFERENCES execution_traces(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
```

### C2. 后端服务

**新建 `packages/server/src/services/task-manager.ts`**：

```typescript
import { query, queryOne } from "../db/client.js";

export interface Task {
  id: string;
  external_id?: string;
  project_id?: string;
  title: string;
  description?: string;
  type: string;       // general | bug | feature | review | analysis
  status: string;     // pending | in_progress | completed | failed | cancelled
  priority: string;   // urgent | high | medium | low
  assignee_id?: string;
  reviewer_id?: string;
  labels: string[];
  trace_id?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_progress", "cancelled"],
  in_progress: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["in_progress"],
  cancelled: ["in_progress"],
};

export async function createTask(input: {
  title: string; description?: string; type?: string; priority?: string;
  project_id?: string; assignee_id?: string; labels?: string[]; external_id?: string;
}): Promise<Task> {
  return queryOne<Task>(
    `INSERT INTO tasks (title, description, type, priority, project_id, assignee_id, labels, external_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING *`,
    [input.title, input.description || null, input.type || "general",
     input.priority || "medium", input.project_id || null, input.assignee_id || null,
     JSON.stringify(input.labels || []), input.external_id || null],
  )!;
}

export async function listTasks(filter?: { project_id?: string; status?: string; assignee_id?: string; priority?: string }): Promise<Task[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (filter?.project_id) { conds.push(`project_id = $${idx++}`); params.push(filter.project_id); }
  if (filter?.status) { conds.push(`status = $${idx++}`); params.push(filter.status); }
  if (filter?.assignee_id) { conds.push(`assignee_id = $${idx++}`); params.push(filter.assignee_id); }
  if (filter?.priority) { conds.push(`priority = $${idx++}`); params.push(filter.priority); }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  return query<Task>(`SELECT * FROM tasks ${where} ORDER BY priority DESC, created_at DESC`, params);
}

export async function getTask(id: string): Promise<Task | null> {
  return queryOne<Task>("SELECT * FROM tasks WHERE id = $1", [id]);
}

export async function updateTask(id: string, updates: Partial<Pick<Task, "title" | "description" | "type" | "priority" | "assignee_id" | "labels" | "project_id">>): Promise<Task | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (updates.title !== undefined) { sets.push(`title = $${idx++}`); params.push(updates.title); }
  if (updates.description !== undefined) { sets.push(`description = $${idx++}`); params.push(updates.description); }
  if (updates.type !== undefined) { sets.push(`type = $${idx++}`); params.push(updates.type); }
  if (updates.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(updates.priority); }
  if (updates.assignee_id !== undefined) { sets.push(`assignee_id = $${idx++}`); params.push(updates.assignee_id); }
  if (updates.labels !== undefined) { sets.push(`labels = $${idx++}::jsonb`); params.push(JSON.stringify(updates.labels)); }
  if (updates.project_id !== undefined) { sets.push(`project_id = $${idx++}`); params.push(updates.project_id); }
  if (sets.length === 0) return getTask(id);
  sets.push("updated_at = now()");
  params.push(id);
  return queryOne<Task>(`UPDATE tasks SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, params);
}

export async function transitionTask(id: string, newStatus: string): Promise<Task | null> {
  const task = await getTask(id);
  if (!task) return null;
  const allowed = VALID_TRANSITIONS[task.status] || [];
  if (!allowed.includes(newStatus)) throw new Error(`invalid transition: ${task.status} → ${newStatus}`);

  const extraSets: string[] = ["status = $1", "updated_at = now()"];
  const params: unknown[] = [newStatus];
  if (newStatus === "in_progress" && !task.started_at) {
    extraSets.push("started_at = now()");
  }
  if (["completed", "failed", "cancelled"].includes(newStatus)) {
    extraSets.push("completed_at = now()");
  }
  params.push(id);
  return queryOne<Task>(`UPDATE tasks SET ${extraSets.join(", ")} WHERE id = $2 RETURNING *`, params);
}

export async function deleteTask(id: string): Promise<boolean> {
  const result = await query("DELETE FROM tasks WHERE id = $1", [id]);
  return result.length > 0;
}
```

### C3. 后端路由

**新建 `packages/server/src/routes/tasks.ts`**：

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireUUID } from "./uuid-util.js";
import { createTask, listTasks, getTask, updateTask, transitionTask, deleteTask } from "../services/task-manager.js";
import { queryOne } from "../db/client.js";

export async function taskRoutes(fastify: FastifyInstance) {
  fastify.get("/api/tasks", async (req: FastifyRequest) => {
    const filter = req.query as Record<string, string>;
    return listTasks(filter);
  });

  fastify.post("/api/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { title: string; description?: string; type?: string; priority?: string; project_id?: string; assignee_id?: string; labels?: string[] };
    if (!body.title) return reply.code(400).send({ error: "title is required" });
    return createTask(body);
  });

  fastify.get("/api/tasks/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const task = await getTask(id);
    if (!task) return reply.code(404).send({ error: "task not found" });
    // Enrich with trace if linked
    let trace = null;
    if (task.trace_id) {
      trace = await queryOne("SELECT * FROM execution_traces WHERE id = $1", [task.trace_id]);
    }
    return { ...task, trace };
  });

  fastify.put("/api/tasks/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const body = req.body as any;
    const task = await updateTask(id, body);
    if (!task) return reply.code(404).send({ error: "task not found" });
    return task;
  });

  fastify.post("/api/tasks/:id/transition", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const { status } = req.body as { status: string };
    if (!status) return reply.code(400).send({ error: "status is required" });
    try {
      const task = await transitionTask(id, status);
      if (!task) return reply.code(404).send({ error: "task not found" });
      return task;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  fastify.delete("/api/tasks/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const ok = await deleteTask(id);
    if (!ok) return reply.code(404).send({ error: "task not found" });
    return { deleted: true };
  });
}
```

**修改 `packages/server/src/index.ts`** — 注册路由：

```typescript
import { taskRoutes } from "./routes/tasks.js";
// ...
await fastify.register(taskRoutes);
```

### C4. 前端

**修改 `packages/ui/src/lib/api.ts`** — 新增 Task 相关方法：

```typescript
// Task interfaces
export interface Task {
  id: string; external_id?: string; project_id?: string;
  title: string; description?: string; type: string;
  status: string; priority: string; assignee_id?: string;
  labels: string[]; trace_id?: string;
  started_at?: string; completed_at?: string;
  created_at: string; updated_at: string;
  trace?: any;
}

// API methods
listTasks: (filter?: Record<string, string>) => {
  const qs = filter ? "?" + Object.entries(filter).filter(([,v]) => v).map(([k,v]) => `${k}=${v}`).join("&") : "";
  return request<Task[]>(`/tasks${qs}`);
},
getTask: (id: string) => request<Task>(`/tasks/${id}`),
createTask: (data: any) => request<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }),
updateTask: (id: string, data: any) => request<Task>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
transitionTask: (id: string, status: string) =>
  request<Task>(`/tasks/${id}/transition`, { method: "POST", body: JSON.stringify({ status }) }),
deleteTask: (id: string) => request<{ deleted: boolean }>(`/tasks/${id}`, { method: "DELETE" }),
```

**修改 `packages/ui/src/stores/index.ts`** — 新增 tasks 状态：

```typescript
tasks: [] as any[],
fetchTasks: async (filter?: Record<string, string>) => {
  set({ tasks: await api.listTasks(filter) });
},
```

**新建 `packages/ui/src/pages/Tasks.tsx`**：

页面功能：
- 顶部：标题"任务" + 创建按钮
- 筛选栏：状态（全部/待处理/进行中/已完成/失败）、优先级、指派人下拉
- 任务列表：每行显示 status pill + priority badge + title + assignee + 创建时间
- 点击任务跳转 `/tasks/:id`
- 创建任务：展开内联表单（title 必填 + description/type/priority/assignee 可选）
- 分组显示：按状态分组（待处理 → 进行中 → 已完成）

样式参考 Projects.tsx 和 Outputs.tsx，使用 `.content-card`、`.list-row`、`.status-pill`、`.type-badge` 等。

**新建 `packages/ui/src/pages/TaskDetail.tsx`**：

页面功能：
- 任务头部：title（可编辑）+ status pill + priority badge
- 状态流转操作栏（根据当前状态显示有效按钮，如"开始"→"完成/失败"→"重试"）
- 元数据网格：type badge、assignee、project、labels、创建/开始/完成时间
- description 可编辑（textarea）
- 如果有 trace 数据，展示 trace 工具调用时间线

**修改 `packages/ui/src/App.tsx`** — 添加路由：

```tsx
import Tasks from "./pages/Tasks";
import TaskDetail from "./pages/TaskDetail";
// ...
<Route path="tasks" element={<Tasks />} />
<Route path="tasks/:id" element={<TaskDetail />} />
```

**修改 `packages/ui/src/components/Layout.tsx`** — NAV_ITEMS 新增：

```typescript
import { ListTodo } from "lucide-react";  // 加入 import
// NAV_ITEMS 数组中，在 outputs 前插入：
{ path: "/tasks", label: "任务", icon: ListTodo },
```

### C5. 跨页面集成

**ProjectDetail.tsx** — 底部新增"项目任务"区域：

```typescript
// 加载项目任务
const [tasks, setTasks] = useState<any[]>([]);
useEffect(() => { api.listTasks({ project_id: id }).then(setTasks); }, [id]);
```

展示任务列表（title + status pill + priority），点击跳转 `/tasks/:taskId`。

**AgentDetail.tsx** — 底部新增"分配任务"区域：

```typescript
const [tasks, setTasks] = useState<any[]>([]);
useEffect(() => { api.listTasks({ assignee_id: id }).then(setTasks); }, [id]);
```

**Dashboard.tsx** — 统计卡片新增"任务"计数：

```typescript
const [taskStats, setTaskStats] = useState<any>(null);
useEffect(() => {
  api.listTasks().then(tasks => {
    const pending = tasks.filter((t: any) => t.status === 'pending').length;
    const inProgress = tasks.filter((t: any) => t.status === 'in_progress').length;
    setTaskStats({ total: tasks.length, pending, inProgress });
  });
}, []);
```

在 stats 数组中插入一张"任务"卡片（icon: ListTodo）。

---

## Phase D：文档更新

所有文档更新记录必须注明作者。

### D1. `docs/DATABASE-SCHEMA.md`

新增两节：
- **registered_agents** 表：字段、类型、约束、索引说明
- **tasks** 表：字段、类型、约束、索引、状态机说明

### D2. `docs/DESIGN.md`

- API 端点表新增：`PUT /projects/:id`、Agent 管理路由、Task CRUD + transition 路由
- 前端页面表新增：ProjectDetail、AgentDetail、Tasks、TaskDetail
- 目录结构新增文件
- 进度表更新

### D3. `docs/PRODUCT-REQUIREMENTS.md`

- 项目管理：标注"已支持编辑"
- Agent 管理：标注"已持久化，支持质量追踪"
- 任务管理：从 P1 移至 P0，标注"已实现"

### D4. `SPEC.md`

- 更新核心对象定义（5.2 Agent、5.3 Task）

### D5. `docs/QA-REPORT.md`

- 新增 TC-013 ~ TC-020 覆盖新增功能

---

## 验证清单

每个 Phase 完成后执行：

```bash
# 1. 类型检查
pnpm typecheck

# 2. 构建
pnpm build

# 3. 启动服务后测试 API
# Phase A
curl -X PUT http://localhost:3002/api/projects/<ID> -H 'Content-Type: application/json' -d '{"name":"新名称"}'

# Phase B
curl http://localhost:3002/api/agents
curl http://localhost:3002/api/agents/<ID>
curl -X POST http://localhost:3002/api/agents/sync

# Phase C
curl -X POST http://localhost:3002/api/tasks -H 'Content-Type: application/json' -d '{"title":"测试任务","priority":"high"}'
curl http://localhost:3002/api/tasks
curl -X POST http://localhost:3002/api/tasks/<ID>/transition -H 'Content-Type: application/json' -d '{"status":"in_progress"}'
```

---

## 执行顺序

```
A（项目 ~2h）→ B（Agent ~4h）→ C（任务 ~5h）→ D（文档 ~1.5h）
```

B 是 C 的前置依赖（tasks.assignee_id 外键引用 registered_agents.id）。
