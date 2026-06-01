-- Agent Monitor v2 — Blueprint enhancements + Meetings
-- Phase 3: DAG engine & multi-agent collaboration

-- ============================================================
-- Blueprint enhancements
-- ============================================================
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN DEFAULT false;
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual';
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '{}';

-- blueprint_nodes already has config column, add description
ALTER TABLE blueprint_nodes ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================
-- Meetings
-- ============================================================
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
