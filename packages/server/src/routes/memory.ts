import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireUUID } from "./uuid-util.js";
import {
  createMemory, getMemory, searchMemory, listMemory, updateMemory, deleteMemory,
  memoryStats, dreamConsolidation,
} from "../services/memory-service.js";

export async function memoryRoutes(fastify: FastifyInstance) {
  fastify.get("/api/memory/search", async (req: FastifyRequest, reply: FastifyReply) => {
    const { q, project_id, scope, type, limit } = req.query as {
      q?: string; project_id?: string; scope?: string; type?: string; limit?: string;
    };
    if (!q) return reply.code(400).send({ error: "q (query) is required" });
    return searchMemory(q, {
      project_id,
      scope,
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  });

  fastify.get("/api/memory", async (req: FastifyRequest) => {
    const { project_id, scope, limit } = req.query as {
      project_id?: string; scope?: string; limit?: string;
    };
    return listMemory({
      project_id,
      scope,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  });

  fastify.post("/api/memory", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      project_id?: string; scope?: string; type: string;
      key?: string; content: string; source?: string;
      importance?: number; tags?: string[];
    };
    if (!body.type || !body.content) {
      return reply.code(400).send({ error: "type and content are required" });
    }
    return createMemory(body);
  });

  fastify.get("/api/memory/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const mem = await getMemory(id);
    if (!mem) return reply.code(404).send({ error: "memory not found" });
    return mem;
  });

  fastify.put("/api/memory/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const body = req.body as { content?: string; importance?: number; status?: string; tags?: string[] };
    const mem = await updateMemory(id, body);
    if (!mem) return reply.code(404).send({ error: "memory not found" });
    return mem;
  });

  fastify.delete("/api/memory/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const ok = await deleteMemory(id);
    if (!ok) return reply.code(404).send({ error: "memory not found" });
    return { deleted: true };
  });

  // Stats
  fastify.get("/api/memory/stats", async () => {
    return memoryStats();
  });

  // Dream Mode
  fastify.post("/api/memory/dream", async () => {
    return dreamConsolidation();
  });
}
