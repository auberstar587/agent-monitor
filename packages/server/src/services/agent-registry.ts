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

export async function syncAgentsFromAdapter(adapter: any): Promise<number> {
  const agents = await adapter.getAgents();
  for (const a of agents) {
    await registerAgent({ id: a.id, name: a.name, platform: a.platform, role: a.role, status: a.status, capabilities: a.capabilities });
  }
  return agents.length;
}
