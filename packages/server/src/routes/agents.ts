import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listAgents, getAgent, updateAgent, deleteAgent,
  registerManualAgent,
} from "../services/agent-registry.js";
import { syncRuntimes } from "../services/runtime-service.js";
import { listPresence, getAgentsView } from "../services/presence-service.js";
import { syncAgentsFromRuntimes } from "../services/agent-registry.js";
import { query } from "../db/client.js";

// agents.id 是 TEXT（不是 UUID），独立校验：非空 + 长度 1~64 + 字符集白名单
const AGENT_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
function requireAgentId(id: string, reply: FastifyReply): boolean {
  if (!id || !AGENT_ID_RE.test(id)) {
    reply.code(400).send({ error: "invalid agent id format" });
    return false;
  }
  return true;
}

export async function agentRoutes(fastify: FastifyInstance) {
  // GET /api/agents — 返回 DB agent + presence 推导
  fastify.get("/api/agents", async () => {
    const view = await getAgentsView();
    const presenceMap = new Map(view.presence.map((p) => [p.agent_id, p]));
    const runtimeMap = new Map(view.runtimes.map((r) => [r.id, r]));
    return view.agents.map((a) => {
      const p = presenceMap.get(a.id);
      const rt = a.runtime_id ? runtimeMap.get(a.runtime_id) : null;
      return {
        ...a,
        availability: p?.availability ?? a.status,
        workload: p?.workload ?? 'idle',
        active_run_count: p?.active_run_count ?? 0,
        current_task_id: p?.current_task_id ?? a.current_task_id,
        version: rt?.version,
        provider: rt?.provider,
        runtime_status: rt?.status,
        last_seen_at: a.last_seen_at ?? new Date().toISOString(),
      };
    });
  });

  // GET /api/agents/presence — 新增：返回所有 agent 的 presence
  fastify.get("/api/agents/presence", async () => {
    return listPresence();
  });

  // GET /api/agents/:id
  fastify.get("/api/agents/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireAgentId(id, reply)) return;
    const agent = await getAgent(id);
    if (!agent) return reply.code(404).send({ error: "agent not found" });
    const traces = await query("SELECT * FROM execution_traces WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 20", [id]);
    return { ...agent, traces };
  });

  // PUT /api/agents/:id
  fastify.put("/api/agents/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireAgentId(id, reply)) return;
    const body = req.body as { name?: string; role?: string; capabilities?: string[] };
    const agent = await updateAgent(id, body);
    if (!agent) return reply.code(404).send({ error: "agent not found" });
    return agent;
  });

  // DELETE /api/agents/:id — 只允许删除 manual agent
  fastify.delete("/api/agents/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireAgentId(id, reply)) return;
    const ok = await deleteAgent(id);
    if (!ok) {
      return reply.code(404).send({
        error: "agent not found or cannot delete engine agent",
      });
    }
    return { deleted: true };
  });

  // POST /api/agents — 新增：手动注册 Agent
  fastify.post("/api/agents", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      id?: string; name?: string; role?: string; capabilities?: string[]; metadata?: Record<string, unknown>;
    };
    if (!body?.name) {
      return reply.code(400).send({ error: "name is required" });
    }
    if (body.id && !AGENT_ID_RE.test(body.id)) {
      return reply.code(400).send({ error: "invalid id format" });
    }
    const agent = await registerManualAgent({
      id: body.id,
      name: body.name,
      role: body.role,
      capabilities: body.capabilities,
      metadata: body.metadata,
    });
    return reply.code(201).send(agent);
  });

  // POST /api/agents/sync — 重构：先 syncRuntimes 再 syncAgents
  fastify.post("/api/agents/sync", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const runtimeCount = await syncRuntimes();
      const agentCount = await syncAgentsFromRuntimes();
      return { synced_runtimes: runtimeCount, synced_agents: agentCount };
    } catch (err: any) {
      return reply.code(500).send({ error: err?.message ?? 'sync failed' });
    }
  });
}
