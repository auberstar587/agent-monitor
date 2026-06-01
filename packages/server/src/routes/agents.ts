import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { listAgents, getAgent, updateAgent, syncAgentsFromAdapter } from "../services/agent-registry.js";
import { getAdapter } from "../adapters/registry.js";
import { loadConfig } from "../config.js";
import { query } from "../db/client.js";

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.get("/api/agents", async () => {
    const dbAgents = await listAgents();
    try {
      const adapter = await getAdapter(loadConfig().adapter);
      if (adapter) {
        const liveAgents = await adapter.getAgents();
        const liveMap = new Map(liveAgents.map((a: any) => [a.id, a]));
        return dbAgents.map(db => {
          const live = liveMap.get(db.id);
          return live ? { ...db, status: live.status, current_task_id: live.currentTaskId, last_seen_at: new Date().toISOString() } : db;
        });
      }
    } catch { /* adapter unavailable */ }
    return dbAgents;
  });

  fastify.get("/api/agents/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const agent = await getAgent(id);
    if (!agent) return reply.code(404).send({ error: "agent not found" });
    const traces = await query("SELECT * FROM execution_traces WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 20", [id]);
    return { ...agent, traces };
  });

  fastify.put("/api/agents/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; role?: string; capabilities?: string[] };
    const agent = await updateAgent(id, body);
    if (!agent) return reply.code(404).send({ error: "agent not found" });
    return agent;
  });

  fastify.post("/api/agents/sync", async () => {
    try {
      const adapter = await getAdapter(loadConfig().adapter);
      if (!adapter) return { synced: 0 };
      const count = await syncAgentsFromAdapter(adapter);
      return { synced: count };
    } catch { return { synced: 0 }; }
  });
}
