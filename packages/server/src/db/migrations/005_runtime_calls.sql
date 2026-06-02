-- Runtime calls: per-run metric snapshot, aligned with WeSight runtime_calls 5 指标
-- 一行 = 一次 EngineAdapter.run() 的完整指标快照
-- 1 个 run 可对应 1 行（同步调用）或 1 个 run 多个 turn（流式）→ 当前版本先 1 行/run

CREATE TABLE IF NOT EXISTS runtime_calls (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               TEXT NOT NULL UNIQUE,
  engine_id            TEXT NOT NULL,                 -- 'claude-code' / 'codex' / 'multica' / 'mock'
  model                TEXT,                          -- 'claude-sonnet-4-5' / 'gpt-4o' / 'deepseek-reasoner' ...
  provider             TEXT,                          -- 'anthropic' / 'openai' / 'deepseek' / 'ollama' / 'mock'

  -- 5 指标（SPEC v2.3.0 §1.3 锁定字段）
  ttft_ms              INTEGER,                       -- Time to first token
  output_tps           REAL,                          -- Output tokens per second (from snapshot)
  est_model_tps        REAL,                          -- Estimated model TPS
  tool_latency_ms      INTEGER,                       -- Max tool execution latency
  agent_steps          INTEGER,                       -- 步数

  -- 计量
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  cost_cents           REAL,                          -- USD cents (REAL 避免 BIGINT 微分)

  -- 时间
  started_at           TIMESTAMPTZ,
  finished_at          TIMESTAMPTZ,
  duration_ms          INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runtime_calls_engine ON runtime_calls(engine_id);
CREATE INDEX IF NOT EXISTS idx_runtime_calls_provider ON runtime_calls(provider);
CREATE INDEX IF NOT EXISTS idx_runtime_calls_model ON runtime_calls(model);
CREATE INDEX IF NOT EXISTS idx_runtime_calls_created ON runtime_calls(created_at);
