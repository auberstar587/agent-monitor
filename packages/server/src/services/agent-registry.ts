import { query, queryOne, execute } from "../db/client.js";
import { listRuntimes } from "./runtime-service.js";

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
  // 新增字段（v2.4.0 Runtime/Agent 重构）
  runtime_id?: string;
  model?: string;
  engine_id?: string;
  session_id?: string;
  agent_source?: string;
}

/** 注册一个 agent（upsert by id） */
export async function registerAgent(agent: {
  id: string; name: string; platform?: string; role?: string; status?: string; capabilities?: string[];
}): Promise<RegisteredAgent | null> {
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
  );
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

/**
 * v2.4.0 新增：从已同步的 agent_runtimes 自动生成 agent 记录
 *  - 每个 installed=true 的 runtime，对应一个 agent_source='engine' 的 agent
 *  - engine agent 的 id = `agent-${engine_id}`，runtime_id 指向对应 runtime
 *  - runtime 不在线时，标记该 engine agent 为 offline（不删除）
 */
export async function syncAgentsFromRuntimes(): Promise<number> {
  const runtimes = await listRuntimes();
  let count = 0;
  for (const rt of runtimes) {
    if (!rt.installed) {
      // runtime 不在线：标记该 engine agent 为 offline
      await query(
        `UPDATE registered_agents
            SET status = 'offline', updated_at = now()
          WHERE agent_source = 'engine' AND runtime_id = $1`,
        [rt.id],
      );
      continue;
    }
    const agentId = `agent-${rt.engine_id}`;
    await queryOne(
      `INSERT INTO registered_agents (id, name, platform, role, status, runtime_id, engine_id, agent_source, last_seen_at)
       VALUES ($1, $2, 'engine', 'developer', 'online', $3, $4, 'engine', now())
       ON CONFLICT (id) DO UPDATE SET
         status      = 'online',
         runtime_id  = EXCLUDED.runtime_id,
         engine_id   = EXCLUDED.engine_id,
         last_seen_at= now(),
         updated_at  = now()
       RETURNING id`,
      [agentId, rt.engine_id, rt.id, rt.engine_id],
    );
    count++;
  }
  return count;
}

/**
 * v2.4.0 新增：手动注册 Agent（如 OpenClaw bot 等手动接入的 Bot）
 */
export async function registerManualAgent(input: {
  id?: string;
  name: string;
  role?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}): Promise<RegisteredAgent | null> {
  if (!input.name) {
    throw new Error("name is required");
  }
  const id = input.id || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return queryOne<RegisteredAgent>(
    `INSERT INTO registered_agents (id, name, platform, role, status, capabilities, agent_source, metadata, last_seen_at)
     VALUES ($1, $2, 'manual', $3, 'online', $4::jsonb, 'manual', $5::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET
       name        = EXCLUDED.name,
       role        = EXCLUDED.role,
       capabilities= EXCLUDED.capabilities,
       metadata    = EXCLUDED.metadata,
       status      = 'online',
       last_seen_at= now(),
       updated_at  = now()
     RETURNING *`,
    [
      id,
      input.name,
      input.role || 'developer',
      JSON.stringify(input.capabilities || []),
      JSON.stringify(input.metadata || {}),
    ],
  );
}

/**
 * v2.4.0 新增：删除 Agent（只允许删除 agent_source='manual' 的）
 *  - engine agent 禁止删除（会被 syncAgentsFromRuntimes 重新生成）
 */
export async function deleteAgent(id: string): Promise<boolean> {
  const result = await execute(
    "DELETE FROM registered_agents WHERE id = $1 AND agent_source = 'manual'",
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}
