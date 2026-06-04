-- Artifact 可审查产物表
-- 状态机：draft → submitted → accepted / rejected
CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT,
  task_id TEXT,
  agent_id TEXT,
  source_output_id TEXT,
  type TEXT NOT NULL DEFAULT 'code',
  title TEXT NOT NULL,
  content TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  review_comment TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  git_branch TEXT,
  git_commit TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
