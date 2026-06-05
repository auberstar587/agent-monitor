// Presence Service — 服务端 Agent 状态推导
// 借鉴 Multica derivePresence()：
//   - 引擎 agent → runtime 状态 + activeRunCount → availability/workload
//   - 手动 agent → last_seen_at + 任务状态 → availability/workload
//
// Availability: 'online' | 'busy' | 'offline'
// Workload: 'working' | 'idle'

import { query, queryOne, execute } from "../db/client.js";
import { listAgents, type RegisteredAgent } from "./agent-registry.js";
import { getActiveRunCount, listRuntimes } from "./runtime-service.js";

export type Availability = 'online' | 'busy' | 'offline';
export type Workload = 'working' | 'idle';

export interface AgentPresence {
  agent_id: string;
  name: string;
  availability: Availability;
  workload: Workload;
  runtime_id?: string;
  engine_id?: string;
  agent_source: string;
  active_run_count: number;
  current_task_id?: string;
  last_seen_at?: string;
}

/** 推算单个 agent 的 presence */
export async function derivePresence(agent: RegisteredAgent): Promise<AgentPresence> {
  const activeRunCount = agent.engine_id
    ? await getActiveRunCount(agent.engine_id)
    : 0;

  // 当前任务优先看正式 task 指派，其次看 execute 路由写入的运行中 session。
  const currentTask = await queryOne<{ id: string }>(
    `SELECT id::text AS id
       FROM tasks
      WHERE assignee_id = $1 AND status = 'in_progress'
      UNION ALL
     SELECT task_id AS id
       FROM agent_sessions
      WHERE agent_id = $1 AND status = 'running' AND task_id IS NOT NULL
      ORDER BY id
      LIMIT 1`,
    [agent.id],
  );

  const availability: Availability = deriveAvailability(agent, activeRunCount);
  const workload: Workload = deriveWorkload(agent, activeRunCount, !!currentTask);

  return {
    agent_id: agent.id,
    name: agent.name,
    availability,
    workload,
    runtime_id: agent.runtime_id,
    engine_id: agent.engine_id,
    agent_source: agent.agent_source || 'engine',
    active_run_count: activeRunCount,
    current_task_id: currentTask?.id,
    last_seen_at: agent.last_seen_at,
  };
}

function deriveAvailability(agent: RegisteredAgent, activeRuns: number): Availability {
  // 引擎 agent
  if (agent.agent_source === 'engine' || agent.engine_id) {
    if (!agent.runtime_id) return 'offline';
    if (activeRuns > 0) return 'busy';
    // 引擎 agent: runtime 在但 last_seen_at 超过 1h → 视为 offline
    if (agent.last_seen_at) {
      const lastSeen = new Date(agent.last_seen_at).getTime();
      if (Date.now() - lastSeen > 60 * 60 * 1000) return 'offline';
    }
    return 'online';
  }
  // 手动 agent
  if (agent.last_seen_at) {
    const lastSeen = new Date(agent.last_seen_at).getTime();
    if (Date.now() - lastSeen > 24 * 60 * 60 * 1000) return 'offline';
  }
  return 'online';
}

function deriveWorkload(_agent: RegisteredAgent, activeRuns: number, hasCurrentTask: boolean): Workload {
  return activeRuns > 0 || hasCurrentTask ? 'working' : 'idle';
}

/** 批量推导所有 agent 的 presence，并同步更新 registered_agents.status */
export async function listPresence(): Promise<AgentPresence[]> {
  const agents = await listAgents();
  const results: AgentPresence[] = [];
  for (const agent of agents) {
    const presence = await derivePresence(agent);
    results.push(presence);
    // 同步 availability 到 registered_agents.status
    try {
      await execute(
        "UPDATE registered_agents SET status = $1, updated_at = now() WHERE id = $2",
        [presence.availability, agent.id],
      );
    } catch (err) {
      console.warn(`[presence-service] status update failed for ${agent.id}:`, (err as Error).message);
    }
  }
  return results;
}

/** 加载所有 runtimes + agents 的整体视图（用于 /api/agents 端点） */
export async function getAgentsView(): Promise<{
  agents: RegisteredAgent[];
  presence: AgentPresence[];
  runtimes: Awaited<ReturnType<typeof listRuntimes>>;
}> {
  const [agents, presence, runtimes] = await Promise.all([
    listAgents(),
    listPresence(),
    listRuntimes(),
  ]);
  return { agents, presence, runtimes };
}

// 抑制未使用导入警告（query 保留供未来任务统计扩展）
void query;
