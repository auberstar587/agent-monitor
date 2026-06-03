-- Runtime/Agent 三层模型重构
-- 借鉴 Multica: Runtime (daemon) → Agent (逻辑实体) → Presence (推导)

-- ============================================================
-- agent_runtimes: 物理运行时（每个 EngineAdapter 对应一行）
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_runtimes (
  id              TEXT PRIMARY KEY,                 -- 'runtime-claude-code' / 'runtime-reasonix'
  engine_id       TEXT NOT NULL UNIQUE,             -- FK 到引擎适配器名
  provider        TEXT,                             -- 'anthropic' / 'deepseek' / 'mock'
  status          TEXT NOT NULL DEFAULT 'offline',  -- 'online' / 'offline'
  version         TEXT,                             -- CLI 版本号
  device_name     TEXT DEFAULT '',
  last_seen_at    TIMESTAMPTZ,
  installed       BOOLEAN NOT NULL DEFAULT false,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runtimes_engine ON agent_runtimes(engine_id);
CREATE INDEX IF NOT EXISTS idx_runtimes_status ON agent_runtimes(status);

-- ============================================================
-- 扩展 registered_agents: 关联 Runtime + 引擎 + 来源
-- ============================================================
ALTER TABLE registered_agents ADD COLUMN IF NOT EXISTS runtime_id   TEXT REFERENCES agent_runtimes(id) ON DELETE SET NULL;
ALTER TABLE registered_agents ADD COLUMN IF NOT EXISTS model        TEXT;
ALTER TABLE registered_agents ADD COLUMN IF NOT EXISTS engine_id    TEXT;
ALTER TABLE registered_agents ADD COLUMN IF NOT EXISTS session_id   TEXT;
ALTER TABLE registered_agents ADD COLUMN IF NOT EXISTS agent_source TEXT NOT NULL DEFAULT 'engine';

CREATE INDEX IF NOT EXISTS idx_agents_runtime   ON registered_agents(runtime_id);
CREATE INDEX IF NOT EXISTS idx_agents_engine    ON registered_agents(engine_id);
CREATE INDEX IF NOT EXISTS idx_agents_source    ON registered_agents(agent_source);

-- ============================================================
-- runtime_calls: 关联 Agent
-- ============================================================
ALTER TABLE runtime_calls ADD COLUMN IF NOT EXISTS agent_id TEXT REFERENCES registered_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_runtime_calls_agent ON runtime_calls(agent_id);
