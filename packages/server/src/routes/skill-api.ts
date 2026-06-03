// Skill API — 外部 Agent HTTP 接口（X-API-Key 认证）
// 用途：让外部 Bot（如 OpenClaw 微信 bot）能查询/创建任务、提交输出
//
// 端点前缀：/api/skill/*
// 认证：Header `X-API-Key: <key>` 与 env SKILL_API_KEY 匹配
//
// 端点清单：
//   POST   /api/skill/tasks              创建任务
//   GET    /api/skill/tasks              查看任务列表
//   GET    /api/skill/tasks/:id          查看任务详情
//   POST   /api/skill/tasks/:id/execute  执行任务
//   GET    /api/skill/agents             查看可用 Agent
//   GET    /api/skill/projects           查看项目列表
//   POST   /api/skill/outputs            提交执行结果

import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from "fastify";
import { createTask, listTasks, getTask, transitionTask } from "../services/task-manager.js";
import { listAgents } from "../services/agent-registry.js";
import { listProjects } from "../services/project-registry.js";
import { queryOne, execute } from "../db/client.js";

const SKILL_API_KEY = process.env.SKILL_API_KEY || "";

/** X-API-Key 校验：未配置 SKILL_API_KEY 时拒绝所有请求（fail-closed） */
function authenticate(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!SKILL_API_KEY) {
    reply.code(503).send({ error: "skill api not configured" });
    return false;
  }
  const key = req.headers["x-api-key"];
  if (key !== SKILL_API_KEY) {
    reply.code(401).send({ error: "invalid api key" });
    return false;
  }
  return true;
}

export async function routes(fastify: FastifyInstance, _opts: FastifyPluginOptions): Promise<void> {
  // 所有路由都需鉴权
  fastify.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/skill/")) return;
    authenticate(req, reply);
  });

  // POST /api/skill/tasks — 创建任务
  fastify.post("/api/skill/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      title: string;
      description?: string;
      project_id?: string;
      type?: string;
      priority?: string;
      labels?: string[];
    };
    if (!body?.title) return reply.code(400).send({ error: "title is required" });
    const task = await createTask({
      title: body.title,
      description: body.description,
      project_id: body.project_id,
      type: body.type,
      priority: body.priority,
      labels: body.labels,
    });
    return reply.code(201).send(task);
  });

  // GET /api/skill/tasks — 查看任务列表
  fastify.get("/api/skill/tasks", async (req: FastifyRequest) => {
    const filter = req.query as Record<string, string>;
    return listTasks(filter);
  });

  // GET /api/skill/tasks/:id — 查看任务详情
  fastify.get("/api/skill/tasks/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const task = await getTask(id);
    if (!task) return reply.code(404).send({ error: "task not found" });
    return task;
  });

  // POST /api/skill/tasks/:id/execute — 执行任务（推进 in_progress，由外部 bot 实际执行）
  fastify.post("/api/skill/tasks/:id/execute", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const task = await getTask(id);
    if (!task) return reply.code(404).send({ error: "task not found" });
    if (!["pending", "failed"].includes(task.status)) {
      return reply.code(400).send({ error: `cannot execute task in ${task.status} status` });
    }
    await transitionTask(id, "in_progress");
    return { ok: true, task_id: id, status: "in_progress" };
  });

  // GET /api/skill/agents — 查看可用 Agent
  fastify.get("/api/skill/agents", async () => {
    return listAgents();
  });

  // GET /api/skill/projects — 查看项目列表
  fastify.get("/api/skill/projects", async () => {
    return listProjects();
  });

  // POST /api/skill/outputs — 提交执行结果
  fastify.post("/api/skill/outputs", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      source: string;
      title: string;
      content: string;
      project_id?: string;
      session_id?: string;
      direction?: string;
      summary?: string;
      tags?: string[];
    };
    if (!body?.source || !body?.title || !body?.content) {
      return reply.code(400).send({ error: "source, title, content are required" });
    }
    const row = await queryOne<{ id: string }>(
      `INSERT INTO agent_outputs (project_id, session_id, source, direction, title, content, summary, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        body.project_id ?? null,
        body.session_id ?? null,
        body.source,
        body.direction ?? "implementation",
        body.title,
        body.content,
        body.summary ?? null,
        JSON.stringify(body.tags ?? []),
      ],
    );
    if (!row) return reply.code(500).send({ error: "failed to insert" });

    // 如果带 taskId（body 含 task_id）且任务还在 in_progress，标记完成
    const taskId = (req.body as any)?.task_id as string | undefined;
    if (taskId) {
      try {
        await transitionTask(taskId, "completed");
      } catch {
        // 状态转换失败不影响 output 入库
      }
    }

    return reply.code(201).send({ id: row.id });
  });

  // 健康检查（无需鉴权，便于外部探测）
  fastify.get("/api/skill/health", async (_req, reply) => {
    return { status: SKILL_API_KEY ? "ok" : "not_configured" };
  });

  // 静默未使用警告
  void execute;
}
