import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireUUID } from "./uuid-util.js";
import {
  registerProject, listProjects, getProject, updateProject, deleteProject,
  addRelation, getRelations, removeRelation,
} from "../services/project-registry.js";
import { buildContext } from "../services/context-injector.js";
import { query } from "../db/client.js";

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get("/api/projects", async (req: FastifyRequest) => {
    const { status } = req.query as { status?: string };
    return listProjects(status);
  });

  fastify.post("/api/projects", async (req: FastifyRequest, reply: FastifyReply) => {
    const { path: projectPath, name, description } = req.body as {
      path: string; name?: string; description?: string;
    };
    if (!projectPath) return reply.code(400).send({ error: "path is required" });
    return registerProject(projectPath, name, description);
  });

  fastify.get("/api/projects/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const project = await getProject(id);
    if (!project) return reply.code(404).send({ error: "project not found" });
    return project;
  });

  fastify.put("/api/projects/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const body = req.body as any;
    const project = await updateProject(id, body);
    if (!project) return reply.code(404).send({ error: "project not found" });
    return project;
  });

  fastify.delete("/api/projects/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const ok = await deleteProject(id);
    if (!ok) return reply.code(404).send({ error: "project not found" });
    return { deleted: true };
  });

  fastify.get("/api/projects/:id/relations", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    return getRelations(id);
  });

  fastify.post("/api/projects/:id/relations", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const { target_id, relation_type, description } = req.body as {
      target_id: string; relation_type: string; description?: string;
    };
    if (!target_id || !relation_type) return reply.code(400).send({ error: "target_id and relation_type required" });
    return addRelation(id, target_id, relation_type, description);
  });

  fastify.delete("/api/projects/relations/:relationId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { relationId } = req.params as { relationId: string };
    if (!requireUUID(relationId, reply)) return;
    const ok = await removeRelation(relationId);
    if (!ok) return reply.code(404).send({ error: "relation not found" });
    return { deleted: true };
  });

  // Project context (Phase 4: memory + output injection)
  fastify.get("/api/projects/:id/context", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const ctx = await buildContext(id);
    if (!ctx.project) return reply.code(404).send({ error: "project not found" });
    return ctx;
  });

  // P8-05: 项目统计端点
  fastify.get("/api/projects/:id/stats", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;

    // 聚合 tasks 各状态数量
    const rows = await query<{ status: string; count: number }>("SELECT status, COUNT(*)::int as count FROM tasks WHERE project_id = $1 GROUP BY status", [id]);
    const tasks: Record<string, number> = { total: 0, pending: 0, in_progress: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const r of rows) {
      tasks[r.status] = r.count;
      tasks.total += r.count;
    }

    // 活跃 agent 数（有 assignee_id 且 status = in_progress）
    const activeRows = await query<{ count: number }>("SELECT COUNT(DISTINCT assignee_id)::int as count FROM tasks WHERE project_id = $1 AND status = 'in_progress' AND assignee_id IS NOT NULL", [id]);
    const agents = { assigned: activeRows[0]?.count ?? 0 };

    return { tasks, agents };
  });
}
