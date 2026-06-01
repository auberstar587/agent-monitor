import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireUUID } from "./uuid-util.js";
import { createTask, listTasks, getTask, updateTask, transitionTask, deleteTask } from "../services/task-manager.js";
import { queryOne } from "../db/client.js";

export async function taskRoutes(fastify: FastifyInstance) {
  fastify.get("/api/tasks", async (req: FastifyRequest) => {
    const filter = req.query as Record<string, string>;
    return listTasks(filter);
  });

  fastify.post("/api/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    if (!body.title) return reply.code(400).send({ error: "title is required" });
    return createTask(body);
  });

  fastify.get("/api/tasks/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const task = await getTask(id);
    if (!task) return reply.code(404).send({ error: "task not found" });
    let trace = null;
    if (task.trace_id) {
      trace = await queryOne("SELECT * FROM execution_traces WHERE id = $1", [task.trace_id]);
    }
    return { ...task, trace };
  });

  fastify.put("/api/tasks/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const body = req.body as any;
    const task = await updateTask(id, body);
    if (!task) return reply.code(404).send({ error: "task not found" });
    return task;
  });

  fastify.post("/api/tasks/:id/transition", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const { status } = req.body as { status: string };
    if (!status) return reply.code(400).send({ error: "status is required" });
    try {
      const task = await transitionTask(id, status);
      if (!task) return reply.code(404).send({ error: "task not found" });
      return task;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  fastify.delete("/api/tasks/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const ok = await deleteTask(id);
    if (!ok) return reply.code(404).send({ error: "task not found" });
    return { deleted: true };
  });
}
