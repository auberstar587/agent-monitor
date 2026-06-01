-- Agent Monitor v2 — Initial Schema (PostgreSQL 17)

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Local project registry
-- ============================================================
CREATE TABLE local_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  path          TEXT NOT NULL UNIQUE,
  description   TEXT,
  tech_stack    JSONB DEFAULT '[]',
  goals         JSONB DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'active',
  source        TEXT NOT NULL DEFAULT 'manual',
  last_activity TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Project relationship graph
-- ============================================================
CREATE TABLE project_relations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID NOT NULL REFERENCES local_projects(id) ON DELETE CASCADE,
  target_id       UUID NOT NULL REFERENCES local_projects(id) ON DELETE CASCADE,
  relation_type   TEXT NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, target_id, relation_type)
);

-- ============================================================
-- Cross-agent output collection (who did what)
-- ============================================================
CREATE TABLE agent_outputs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES local_projects(id) ON DELETE SET NULL,
  session_id    TEXT,
  source        TEXT NOT NULL,
  direction     TEXT NOT NULL DEFAULT 'implementation',
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
CREATE INDEX idx_outputs_session ON agent_outputs(session_id);

-- ============================================================
-- Shared memory (cross-project, cross-agent)
-- ============================================================
CREATE TABLE shared_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES local_projects(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL DEFAULT 'project',
  type          TEXT NOT NULL,
  key           TEXT,
  content       TEXT NOT NULL,
  source        TEXT,
  importance    INTEGER NOT NULL DEFAULT 5,
  status        TEXT NOT NULL DEFAULT 'active',
  tags          JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  retrieved_at  TIMESTAMPTZ
);

CREATE INDEX idx_memory_project ON shared_memory(project_id);
CREATE INDEX idx_memory_scope ON shared_memory(scope);
CREATE INDEX idx_memory_type ON shared_memory(type);
CREATE INDEX idx_memory_status ON shared_memory(status);
CREATE INDEX idx_memory_key ON shared_memory(key);

-- Full-text search support
CREATE INDEX idx_memory_content_fts ON shared_memory USING gin(to_tsvector('simple', content));

-- ============================================================
-- Execution traces
-- ============================================================
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

CREATE INDEX idx_traces_project ON execution_traces(project_id);
CREATE INDEX idx_traces_status ON execution_traces(status);
CREATE INDEX idx_traces_agent ON execution_traces(agent_id);
CREATE INDEX idx_traces_created ON execution_traces(created_at);

-- ============================================================
-- Trace tool calls
-- ============================================================
CREATE TABLE trace_tool_calls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id      UUID NOT NULL REFERENCES execution_traces(id) ON DELETE CASCADE,
  task_id       TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  type          TEXT NOT NULL,
  tool_name     TEXT,
  tool_input    TEXT,
  tool_output   TEXT,
  error_text    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tool_calls_trace ON trace_tool_calls(trace_id);
CREATE INDEX idx_tool_calls_task_seq ON trace_tool_calls(task_id, seq);

-- ============================================================
-- Inbox items
-- ============================================================
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

CREATE INDEX idx_inbox_status ON inbox_items(status);
CREATE INDEX idx_inbox_type ON inbox_items(type);
CREATE INDEX idx_inbox_project ON inbox_items(project_id);

-- ============================================================
-- Blueprints (DAG workflows)
-- ============================================================
CREATE TABLE blueprints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES local_projects(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_blueprints_project ON blueprints(project_id);

-- ============================================================
-- Blueprint nodes
-- ============================================================
CREATE TABLE blueprint_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id  UUID NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  name          TEXT NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}',
  position_x    REAL NOT NULL DEFAULT 0,
  position_y    REAL NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bp_nodes_blueprint ON blueprint_nodes(blueprint_id);

-- ============================================================
-- Blueprint edges
-- ============================================================
CREATE TABLE blueprint_edges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id    UUID NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  source_node_id  UUID NOT NULL REFERENCES blueprint_nodes(id) ON DELETE CASCADE,
  target_node_id  UUID NOT NULL REFERENCES blueprint_nodes(id) ON DELETE CASCADE,
  source_handle   TEXT,
  target_handle   TEXT,
  condition       TEXT,
  label           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bp_edges_blueprint ON blueprint_edges(blueprint_id);

-- ============================================================
-- Blueprint runs
-- ============================================================
CREATE TABLE blueprint_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id  UUID NOT NULL REFERENCES blueprints(id),
  snapshot      JSONB,
  status        TEXT NOT NULL DEFAULT 'running',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bp_runs_blueprint ON blueprint_runs(blueprint_id);
CREATE INDEX idx_bp_runs_status ON blueprint_runs(status);

-- ============================================================
-- Blueprint node runs
-- ============================================================
CREATE TABLE blueprint_node_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_run_id UUID NOT NULL REFERENCES blueprint_runs(id) ON DELETE CASCADE,
  node_id         UUID NOT NULL REFERENCES blueprint_nodes(id),
  task_id         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  output          TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bp_node_runs_run ON blueprint_node_runs(blueprint_run_id);

-- ============================================================
-- Context packs (per-project context)
-- ============================================================
CREATE TABLE context_packs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL UNIQUE REFERENCES local_projects(id) ON DELETE CASCADE,
  goals         JSONB DEFAULT '[]',
  tech_stack    JSONB DEFAULT '{}',
  key_dirs      JSONB DEFAULT '[]',
  commands      JSONB DEFAULT '{}',
  coding_rules  TEXT,
  decisions     JSONB DEFAULT '[]',
  risks         JSONB DEFAULT '[]',
  prohibitions  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
