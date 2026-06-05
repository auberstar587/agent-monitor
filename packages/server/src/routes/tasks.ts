import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireUUID } from "./uuid-util.js";
import { createTask, listTasks, getTask, updateTask, transitionTask, deleteTask } from "../services/task-manager.js";
import { queryOne, query } from "../db/client.js";
import { getEngine } from "../adapters/registry.js";
import { buildContext } from "../services/context-injector.js";
import { listAgents } from "../services/agent-registry.js";
import { listPresence } from "../services/presence-service.js";
import { listProjects } from "../services/project-registry.js";

const STOP_WORDS = new Set(["the","a","an","is","for","to","in","of","and","with","on","it","this","that","from","by","at","be","as","or","not","no","do","but","can","will","just","should","now","的","了","在","是","和","与","不","有","这","那","我","你","把","被","让","给","从","到","对","为","以","及","等"]);
const IGNORE_PATH = new Set(["src","lib","node_modules","dist","build","pkg","cmd","internal","app","web","api","ui","packages","test","tests","spec","docs"]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .split(/[\s/\-_.:;,\(\)\[\]\{\}]+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

async function matchProject(title: string, description?: string): Promise<any | null> {
  const projects = await listProjects("active");
  if (projects.length === 0) return null;

  const userTokens = tokenize([title, description || ""].join(" "));
  if (userTokens.length === 0) return null;

  let bestProject: any = null;
  let bestScore = 0;

  for (const proj of projects) {
    const projTokens = new Set([
      ...tokenize(proj.name),
      ...tokenize(proj.path).filter(t => !IGNORE_PATH.has(t)),
      ...tokenize(proj.description || ""),
      ...((proj.tech_stack || []).flatMap((s: string) => tokenize(s))),
      ...((proj.goals || []).flatMap((g: string) => tokenize(g))),
    ]);

    let score = 0;
    for (const token of userTokens) {
      if (projTokens.has(token)) score++;
    }

    if (score > bestScore || (score === bestScore && score > 0 && proj.updated_at > (bestProject?.updated_at || ""))) {
      bestScore = score;
      bestProject = proj;
    }
  }

  return bestScore >= 2 ? bestProject : null;
}

interface AgentRecommendation {
  agent_id: string;
  name: string;
  availability: string;
  score: number;
  reasons: string[];
  engine_id: string | null;  // manual agent 无 engine → null
}

async function scoreAgents(task: any): Promise<AgentRecommendation[]> {
  const agents = await listAgents();
  const presenceList = await listPresence();
  const presenceMap = new Map(presenceList.map((p) => [p.agent_id, p]));

  // 加载项目关键词（注意：local_projects 表没有 labels 列，只用 tech_stack + goals）
  let projectKeywords: string[] = [];
  if (task.project_id) {
    const proj = await queryOne<{ tech_stack: string[]; goals: string[] }>(
      "SELECT tech_stack, goals FROM local_projects WHERE id = $1",
      [task.project_id],
    );
    projectKeywords = [
      ...(proj?.tech_stack || []),
      ...(proj?.goals || []),
    ];
  }
  const taskLabels = task.labels || [];
  const allKeywords = [...projectKeywords, ...taskLabels].map((s) => s.toLowerCase());

  // 加载历史：每个 agent 在该 project 的 completed 任务数
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

  const scored: AgentRecommendation[] = [];

  for (const agent of agents) {
    const presence = presenceMap.get(agent.id);
    const availability = presence?.availability ?? agent.status;

    if (availability === 'offline') continue;

    let score = 0;
    const reasons: string[] = [];

    // 1. 质量分
    const q = agent.quality || { successCount: 0, failCount: 0, avgDurationMs: 0 };
    const total = q.successCount + q.failCount;
    if (total > 0) {
      const successRate = q.successCount / total;
      score += successRate * 40;
      if (successRate > 0.8) reasons.push(`历史成功率 ${(successRate * 100).toFixed(0)}%`);
    } else {
      score += 20;
      reasons.push("无历史，新 agent");
    }

    // 2. 能力匹配
    const caps = (agent.capabilities || []).map((c: string) => c.toLowerCase());
    const matched = caps.filter((c) => allKeywords.includes(c));
    if (matched.length > 0) {
      score += matched.length * 15;
      reasons.push(`能力匹配: ${matched.join(', ')}`);
    }

    // 3. 项目历史
    const hist = histMap.get(agent.id);
    if (hist && hist.cnt > 0) {
      score += Math.min(hist.cnt, 5) * 4;
      if (hist.ok / hist.cnt > 0.7) {
        score += 10;
        reasons.push(`同项目 ${hist.cnt} 次任务，${hist.ok} 成功`);
      }
    }

    // 4. availability 微调
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
      engine_id: agent.engine_id ?? null,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

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

    // 4.5 检测引擎是否已安装（必须在 transitionTask 之前）
    const installed = await engine.detectInstalled().catch(() => false);
    if (!installed) return reply.code(400).send({ error: `Engine not installed: ${engineName}` });

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

    // 8. 写入 execution_traces 起始记录（task_id 是 UNIQUE，使用 ON CONFLICT 幂等）
    let traceId: string | null = null;
    let traceSeq = 0;
    try {
      const inserted = await queryOne<{ id: string }>(
        `INSERT INTO execution_traces
           (task_id, project_id, agent_id, source, status, title, started_at, retry_count)
         VALUES ($1, $2, $3, $4, 'running', $5, now(), 0)
         ON CONFLICT (task_id) DO UPDATE
           SET status = 'running',
               started_at = now(),
               completed_at = NULL,
               updated_at = now()
         RETURNING id`,
        [
          id,
          task.project_id ?? null,
          task.assignee_id ?? engineName, // agent_id NOT NULL，回退到引擎名
          engineName,
          task.title,
        ],
      );
      traceId = inserted?.id ?? null;
    } catch (err: any) {
      // trace 写入失败不阻塞执行，仅记录
      console.error(`[tasks.execute] failed to insert trace: ${err?.message ?? err}`);
    }

    // 9. Hijack + SSE
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // 收集本轮执行统计
    const textChunks: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let model: string | null = null;
    let errorMessage: string | null = null;
    let runStatus: 'completed' | 'failed' = 'completed';

    try {
      sseWrite(res, 'start', { runId: `task_${id}`, taskId: id, traceId });

      const stream = engine.run(prompt, { systemPrompt, workingDir });
      for await (const msg of stream) {
        // 累积文本片段（用于 summary，最多 2000 字）
        if (msg.type === 'text' && typeof msg.content === 'string') {
          textChunks.push(msg.content);
        }

        // 记录工具调用
        if (msg.type === 'tool_use' && traceId) {
          traceSeq += 1;
          try {
            await query(
              `INSERT INTO trace_tool_calls (trace_id, task_id, seq, type, tool_name, tool_input)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                traceId,
                id,
                traceSeq,
                msg.type,
                msg.tool ?? null,
                msg.input ? JSON.stringify(msg.input) : null,
              ],
            );
          } catch (toolErr: any) {
            console.error(`[tasks.execute] failed to insert tool_call #${traceSeq}: ${toolErr?.message ?? toolErr}`);
          }
        }

        // 记录工具结果（绑定到最近一次 tool_use 的 seq）
        if (msg.type === 'tool_result' && traceId && traceSeq > 0) {
          try {
            await query(
              `UPDATE trace_tool_calls
                  SET tool_output = $1,
                      error_text = $2
                WHERE trace_id = $3 AND task_id = $4 AND seq = $5`,
              [
                typeof msg.output === 'string' ? msg.output : (msg.output ? JSON.stringify(msg.output) : null),
                msg.type === 'tool_result' && (msg as any).is_error ? (msg.output ?? 'tool error') : null,
                traceId,
                id,
                traceSeq,
              ],
            );
          } catch (toolErr: any) {
            console.error(`[tasks.execute] failed to update tool_call #${traceSeq}: ${toolErr?.message ?? toolErr}`);
          }
        }

        // 抓取用量（适配器可能在 message 里附带 usage/model）
        const usage = (msg as any).usage;
        if (usage && typeof usage === 'object') {
          if (typeof usage.inputTokens === 'number') inputTokens = usage.inputTokens;
          if (typeof usage.outputTokens === 'number') outputTokens = usage.outputTokens;
          if (typeof usage.model === 'string') model = usage.model;
        }

        if (!sseWrite(res, 'message', msg)) break;
      }

      // 成功完成 → 自动 transition → completed
      await transitionTask(id, "completed");
      runStatus = 'completed';
      sseWrite(res, 'done', { runId: `task_${id}`, taskId: id, finalStatus: "completed" });
    } catch (err: any) {
      // 异常 → 自动 transition → failed
      errorMessage = err?.message ?? String(err);
      runStatus = 'failed';
      try { await transitionTask(id, "failed"); } catch {}
      sseWrite(res, 'error', { error: errorMessage });
      sseWrite(res, 'done', { runId: `task_${id}`, taskId: id, finalStatus: "failed" });
    } finally {
      // 关闭 SSE
      if (!res.writableEnded) res.end();

      // 更新 execution_traces 终态
      if (traceId) {
        const summary = textChunks.join('').slice(0, 2000) || null;
        try {
          await query(
            `UPDATE execution_traces SET
               status = $1,
               completed_at = now(),
               duration_ms = (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int,
               summary = $2,
               error_message = $3,
               input_tokens = $4,
               output_tokens = $5,
               model = $6,
               updated_at = now()
             WHERE id = $7`,
            [
              runStatus,
              summary,
              errorMessage,
              inputTokens,
              outputTokens,
              model,
              traceId,
            ],
          );
        } catch (updErr: any) {
          console.error(`[tasks.execute] failed to finalize trace: ${updErr?.message ?? updErr}`);
        }
      }
    }
  });

  // CORE-03: 任务分配推荐 — 简单打分：项目匹配 + 能力匹配 + 质量分
  fastify.post("/api/tasks/:id/assign-recommend", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;

    const task = await getTask(id);
    if (!task) return reply.code(404).send({ error: "task not found" });

    const recommendations = await scoreAgents(task);
    return { task_id: id, recommendations: recommendations.slice(0, 3) };
  });

  // 智能创建任务：自动匹配项目 + 自动推荐/分配 Agent
  fastify.post("/api/tasks/smart", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      title?: string;
      description?: string;
      project_id?: string;
      assignee_id?: string;
    };

    if (!body.title?.trim()) {
      return reply.code(400).send({ error: "title is required" });
    }

    // 1. Auto-match project
    let matchedProject: any = null;
    let projectId = body.project_id || null;

    if (!projectId) {
      matchedProject = await matchProject(body.title, body.description);
      if (matchedProject) projectId = matchedProject.id;
    }

    // 2. Create task
    const task = await createTask({
      title: body.title,
      description: body.description,
      project_id: projectId || undefined,
      assignee_id: body.assignee_id || undefined,
    });

    if (!task) {
      return reply.code(500).send({ error: "failed to create task" });
    }

    // 3. Auto-recommend and assign agent
    let recommendedAgents: AgentRecommendation[] = [];
    let autoAssigned = false;

    if (!body.assignee_id) {
      recommendedAgents = await scoreAgents(task);
      if (recommendedAgents.length > 0 && recommendedAgents[0].availability !== "offline") {
        await updateTask(task.id, { assignee_id: recommendedAgents[0].agent_id });
        autoAssigned = true;
      }
    }

    // 4. 推荐引擎
    let recommendedEngine: { id: string; label: string; installed: boolean; reason: string } | null = null;
    if (autoAssigned && recommendedAgents[0]?.engine_id) {
      const eng = await getEngine(recommendedAgents[0].engine_id);
      if (eng) {
        recommendedEngine = {
          id: eng.id,
          label: eng.label,
          installed: eng.installed,
          reason: `推荐 Agent ${recommendedAgents[0].name} 使用的引擎`,
        };
      }
    }
    // fallback：遍历已注册引擎，找第一个 installed 的
    if (!recommendedEngine) {
      const engineIds = ['claude-code', 'reasonix', 'codex'];
      for (const eid of engineIds) {
        const eng = await getEngine(eid);
        if (eng?.installed) {
          recommendedEngine = { id: eng.id, label: eng.label, installed: true, reason: '默认可用引擎' };
          break;
        }
      }
    }

    // 5. Return
    const updatedTask = await getTask(task.id);
    return {
      task: updatedTask,
      matched_project: matchedProject,
      recommended_agents: recommendedAgents.slice(0, 3),
      auto_assigned: autoAssigned,
      recommended_engine: recommendedEngine,
    };
  });
}
