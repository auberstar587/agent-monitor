import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireUUID } from "./uuid-util.js";
import { createTask, listTasks, getTask, updateTask, transitionTask, deleteTask } from "../services/task-manager.js";
import { queryOne, query } from "../db/client.js";
import { getEngine } from "../adapters/registry.js";
import { buildContext } from "../services/context-injector.js";
import { listAgents } from "../services/agent-registry.js";
import { listPresence } from "../services/presence-service.js";

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

  // CORE-03: 任务分配推荐 — 简单打分：项目匹配 + 能力匹配 + 质量分
  fastify.post("/api/tasks/:id/assign-recommend", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;

    const task = await getTask(id);
    if (!task) return reply.code(404).send({ error: "task not found" });

    const agents = await listAgents();
    const presenceList = await listPresence();
    const presenceMap = new Map(presenceList.map((p) => [p.agent_id, p]));

    // 加载项目标签
    let projectLabels: string[] = [];
    if (task.project_id) {
      const proj = await queryOne<{ labels: string[]; tech_stack: string[] }>(
        "SELECT labels, tech_stack FROM local_projects WHERE id = $1",
        [task.project_id],
      );
      projectLabels = [
        ...(proj?.labels || []),
        ...(proj?.tech_stack || []),
      ];
    }
    const taskLabels = task.labels || [];
    const allKeywords = [...projectLabels, ...taskLabels].map((s) => s.toLowerCase());

    // 加载历史：每个 agent 在该 project 的 completed 任务数（成功率代理）
    const history = await query<{ assignee_id: string; cnt: number; ok: number }>(
      `SELECT assignee_id,
              COUNT(*)::int AS cnt,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS ok
         FROM tasks
        WHERE assignee_id IS NOT NULL AND ($1::uuid IS NULL OR project_id = $1::uuid)
        GROUP BY assignee_id`,
      [task.project_id ?? null],
    );
    const histMap = new Map(history.map((h) => [h.assignee_id, h]));

    type Score = {
      agent_id: string;
      name: string;
      availability: string;
      score: number;
      reasons: string[];
    };
    const scored: Score[] = [];

    for (const agent of agents) {
      const presence = presenceMap.get(agent.id);
      const availability = presence?.availability ?? agent.status;

      // 跳过 offline 或 busy（不希望推荐繁忙的）
      if (availability === 'offline') continue;

      let score = 0;
      const reasons: string[] = [];

      // 1. 质量分（基于 quality JSONB）
      const q = agent.quality || { successCount: 0, failCount: 0, avgDurationMs: 0 };
      const total = q.successCount + q.failCount;
      if (total > 0) {
        const successRate = q.successCount / total;
        score += successRate * 40;
        if (successRate > 0.8) reasons.push(`历史成功率 ${(successRate * 100).toFixed(0)}%`);
      } else {
        score += 20; // 全新 agent 给个基线
        reasons.push("无历史，新 agent");
      }

      // 2. 能力匹配：agent.capabilities ∩ project/tech keywords
      const caps = (agent.capabilities || []).map((c) => c.toLowerCase());
      const matched = caps.filter((c) => allKeywords.includes(c));
      if (matched.length > 0) {
        score += matched.length * 15;
        reasons.push(`能力匹配: ${matched.join(', ')}`);
      }

      // 3. 项目历史：曾在同 project 完成的加分
      const hist = histMap.get(agent.id);
      if (hist && hist.cnt > 0) {
        score += Math.min(hist.cnt, 5) * 4;
        if (hist.ok / hist.cnt > 0.7) {
          score += 10;
          reasons.push(`同项目 ${hist.cnt} 次任务，${hist.ok} 成功`);
        }
      }

      // 4. availability 状态微调
      if (availability === 'online') {
        score += 10;
        reasons.push("在线");
      } else if (availability === 'busy') {
        score -= 20;
        reasons.push("忙碌中（仍可推荐但降权）");
      }

      scored.push({
        agent_id: agent.id,
        name: agent.name,
        availability,
        score: Math.round(score * 10) / 10,
        reasons,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return { task_id: id, recommendations: scored.slice(0, 3) };
  });
}
