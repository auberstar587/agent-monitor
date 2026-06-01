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
