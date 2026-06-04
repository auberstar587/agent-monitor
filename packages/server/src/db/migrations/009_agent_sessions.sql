-- 009: agent_sessions — 单个 Agent 的工作会话
-- 一个 Agent 同一时间可以有多个会话（如不同 task / 不同 platform）
-- status: running / waiting_user / completed / failed / idle

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  platform TEXT,                  -- openclaw / engine / manual
  status TEXT NOT NULL DEFAULT 'running',
  last_output TEXT,               -- 最近一次输出摘要
  source_ref TEXT,                -- 来源引用（如 trace ID）
  can_reply BOOLEAN DEFAULT false,
  can_pause BOOLEAN DEFAULT false,
  can_stop BOOLEAN DEFAULT false,
  started_at TIMESTAMP DEFAULT now(),
  last_interaction_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_project ON agent_sessions(project_id);
