# Agent Monitor v2 — 数据库 Schema

> PostgreSQL 17，独立数据库 `agent_monitor`
> 迁移文件：`packages/server/src/db/migrations/`（001-004）

---

## 1. 表结构总览

```
local_projects           — 本地项目注册（区别于外部平台的项目缓存）
project_relations         — 项目关系图（depends_on / related_to / fork_of / integrates）
agent_outputs             — 跨 Agent 输出归集（解决"谁做了什么"的问题）
shared_memory             — 共享记忆（跨项目、跨 Agent，支持全文检索）
execution_traces          — 执行追踪（从 adapter 层收集）
trace_tool_calls          — 工具调用记录
inbox_items               — 待处理事项（审批、通知、失败任务）
blueprints                — 蓝图（DAG 工作流）
blueprint_nodes           — 蓝图节点
blueprint_edges           — 蓝图边
blueprint_runs            — 蓝图执行记录
blueprint_node_runs       — 蓝图节点执行记录
context_packs             — 项目上下文包
registered_agents         — Agent 持久化注册（含质量指标）
tasks                     — 本地任务管理（含状态机）
```

---

## 2. 核心表定义

### 2.1 local_projects

本地项目注册表。通过 `POST /api/projects` 注册，自动检测 `package.json` / `go.mod` 等识别技术栈。

```sql
CREATE TABLE local_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  path          TEXT NOT NULL UNIQUE,        -- 本地路径
  description   TEXT,
  tech_stack    JSONB DEFAULT '[]',          -- ["Node.js", "Go"]
  goals         JSONB DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'active',  -- active | paused | archived
  source        TEXT NOT NULL DEFAULT 'manual',  -- manual | auto-detected
  last_activity TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.2 project_relations

项目间关系图。

```sql
CREATE TABLE project_relations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID NOT NULL REFERENCES local_projects(id) ON DELETE CASCADE,
  target_id       UUID NOT NULL REFERENCES local_projects(id) ON DELETE CASCADE,
  relation_type   TEXT NOT NULL,             -- depends_on | related_to | fork_of | integrates
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, target_id, relation_type)
);
```

### 2.3 agent_outputs

跨 Agent 输出归集。所有 Agent 的输出统一写入此表。

```sql
CREATE TABLE agent_outputs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES local_projects(id) ON DELETE SET NULL,
  session_id    TEXT,                        -- adapter 提供的 session 标识
  source        TEXT NOT NULL,               -- claude-code | openclaw | codex | doubao | yuanbao | manual
  direction     TEXT NOT NULL DEFAULT 'implementation',  -- analysis | implementation | decision | review | question
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  summary       TEXT,
  tags          JSONB DEFAULT '[]',
  parent_id     UUID REFERENCES agent_outputs(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outputs_project ON agent_outputs(project_id);
CREATE INDEX idx_outputs_source ON agent_outputs(source);
CREATE INDEX idx_outputs_direction ON agent_outputs(direction);
CREATE INDEX idx_outputs_created ON agent_outputs(created_at);
```

### 2.4 shared_memory

跨项目共享记忆。支持 PostgreSQL 全文检索。

```sql
CREATE TABLE shared_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES local_projects(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL DEFAULT 'project',  -- global | project | session
  type          TEXT NOT NULL,              -- decision | rule | context | preference | experience
  key           TEXT,
  content       TEXT NOT NULL,
  source        TEXT,
  importance    INTEGER NOT NULL DEFAULT 5,  -- 1-10
  status        TEXT NOT NULL DEFAULT 'active',
  tags          JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  retrieved_at  TIMESTAMPTZ
);

-- Full-text search
CREATE INDEX idx_memory_content_fts ON shared_memory
  USING gin(to_tsvector('simple', content));
```

### 2.5 execution_traces

```sql
CREATE TABLE execution_traces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       TEXT NOT NULL UNIQUE,
  project_id    UUID REFERENCES local_projects(id) ON DELETE SET NULL,
  agent_id      TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'unknown',
  status        TEXT NOT NULL DEFAULT 'queued',
  title         TEXT,
  description   TEXT,
  summary       TEXT,
  error_message TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_cents    INTEGER NOT NULL DEFAULT 0,
  model         TEXT,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.6 trace_tool_calls

```sql
CREATE TABLE trace_tool_calls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id      UUID NOT NULL REFERENCES execution_traces(id) ON DELETE CASCADE,
  task_id       TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  type          TEXT NOT NULL,              -- text | tool_use | tool_result | error
  tool_name     TEXT,
  tool_input    TEXT,
  tool_output   TEXT,
  error_text    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.7 inbox_items

```sql
CREATE TABLE inbox_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES local_projects(id) ON DELETE SET NULL,
  task_id       TEXT,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  priority      TEXT NOT NULL DEFAULT 'medium',
  resolved_by   TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.8 blueprints / blueprint_nodes / blueprint_edges

蓝图 DAG 工作流定义。节点类型：`agent` | `manager` | `slot` | `meeting` | `condition` | `summary` | `approval`。

### 2.9 blueprint_runs / blueprint_node_runs

蓝图执行记录。

### 2.10 context_packs

项目上下文包（goals、tech_stack、key_dirs、commands、coding_rules、decisions、risks）。

### 2.11 registered_agents

Agent 持久化注册。Adapter 同步的 Agent 数据写入此表，支持质量追踪和历史记录。

```sql
CREATE TABLE registered_agents (
  id              TEXT PRIMARY KEY,           -- adapter 提供的 Agent ID
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
```

### 2.12 tasks

本地任务管理。支持状态机流转：`pending → in_progress → completed/failed/cancelled`。

```sql
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     TEXT UNIQUE,                -- adapter 任务 ID（如 Multica issue ID）
  project_id      UUID REFERENCES local_projects(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL DEFAULT 'general',  -- general | bug | feature | review | analysis
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending | in_progress | completed | failed | cancelled
  priority        TEXT NOT NULL DEFAULT 'medium',    -- urgent | high | medium | low
  assignee_id     TEXT REFERENCES registered_agents(id) ON DELETE SET NULL,
  reviewer_id     TEXT REFERENCES registered_agents(id) ON DELETE SET NULL,
  labels          JSONB DEFAULT '[]',
  trace_id        UUID REFERENCES execution_traces(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 3. 数据关系图

```
local_projects ──< project_relations >── local_projects
      │
      ├──< agent_outputs
      │
      ├──< shared_memory (全文检索)
      │
      ├──< execution_traces ──< trace_tool_calls
      │
      ├──< inbox_items
      │
      ├──< blueprints ──< blueprint_nodes ── blueprint_edges
      │                    └── blueprint_runs ──< blueprint_node_runs
      │
      ├──< context_packs (1:1)
      │
      ├──< registered_agents ──< tasks
      │
      └──< tasks
```

---

## 4. 迁移策略

使用文件化迁移，位于 `packages/server/src/db/migrations/`：

```
001_initial.sql              — 完整 schema (14 表)
002_blueprint_enhancements.sql — 蓝图扩展 + 会议表
003_agents.sql               — registered_agents 表
004_tasks.sql                 — tasks 表
```

迁移执行器在 `packages/server/src/db/migrate.ts`，通过 `_migrations` 表追踪已执行的版本。

---

## 更新记录

| 日期 | 版本 | 作者 | 变更 |
|------|------|------|------|
| 2026-05-31 | 2.0.0 | Claude | v2 完整重写：SQLite → PostgreSQL 17，新增 local_projects/project_relations/agent_outputs/shared_memory |
| 2026-05-31 | 2.1.0 | DeepSeek | 新增 registered_agents、tasks 表 |
| 2026-05-29 | 1.0.0 | Claude | 初始 schema (SQLite) |
