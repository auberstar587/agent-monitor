import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireUUID } from "./uuid-util.js";
import { createTask, listTasks, getTask, updateTask, transitionTask, deleteTask } from "../services/task-manager.js";
import { queryOne } from "../db/client.js";
import { getEngine } from "../adapters/registry.js";
import { buildContext } from "../services/context-injector.js";

/** SSE 辅助：写入一条事件，自动检查 writableEnded */
function sseWrite(res: any, event: string, data: object): boolean {
  if (res.writableEnded) return false;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  return true;
}

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

  // CORE-02: 任务执行端点 — SSE 流式执行
  fastify.post("/api/tasks/:id/execute", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;

    // 1. 获取 task
    const task = await getTask(id);
    if (!task) return reply.code(404).send({ error: "task not found" });

    // 2. 验证状态：只有 pending/failed 可以执行
    if (!["pending", "failed"].includes(task.status)) {
      return reply.code(400).send({ error: `cannot execute task in ${task.status} status` });
    }

    // 3. 获取请求参数
    const { engine: engineName } = req.body as { engine: string };
    if (!engineName) return reply.code(400).send({ error: "engine is required" });

    // 4. 获取引擎
    const engine = await getEngine(engineName);
    if (!engine) return reply.code(404).send({ error: `engine not found: ${engineName}` });

    // 5. 自动 transition → in_progress
    await transitionTask(id, "in_progress");

    // 6. 构造 prompt（从 task title + description）
    let prompt = task.title;
    if (task.description) prompt += `\n\n${task.description}`;

    // 7. 注入项目上下文（如果有 project_id）
    let systemPrompt: string | undefined;
    let workingDir: string | undefined;
    if (task.project_id) {
      try {
        const ctx = await buildContext(task.project_id);
        if (ctx.project) {
          const p = ctx.project;
          const lines = [`# Project Context`, ``, `You are working on **${p.name}** (path: \`${p.path}\`).`];
          if (p.description) lines.push(``, p.description);
          if (p.tech_stack?.length) lines.push(``, `**Tech stack:** ${p.tech_stack.join(', ')}`);
          if (p.goals?.length) { lines.push(``, `**Goals:**`); for (const g of p.goals) lines.push(`- ${g}`); }
          lines.push(``, `**Status:** ${p.status}`);
          systemPrompt = lines.join('\n');
          workingDir = p.path;
        }
      } catch { /* 上下文注入失败不阻塞执行 */ }
    }

    // 8. Hijack + SSE
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      sseWrite(res, 'start', { runId: `task_${id}`, taskId: id });

      const stream = engine.run(prompt, { systemPrompt, workingDir });
      for await (const msg of stream) {
        if (!sseWrite(res, 'message', msg)) break;
      }

      // 成功完成 → 自动 transition → completed
      await transitionTask(id, "completed");
      sseWrite(res, 'done', { runId: `task_${id}`, taskId: id, finalStatus: "completed" });
    } catch (err: any) {
      // 异常 → 自动 transition → failed
      try { await transitionTask(id, "failed"); } catch {}
      sseWrite(res, 'error', { error: err?.message ?? String(err) });
      sseWrite(res, 'done', { runId: `task_${id}`, taskId: id, finalStatus: "failed" });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });
}
