import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireUUID } from "./uuid-util.js";
import { createTask, listTasks, getTask, updateTask, transitionTask, deleteTask, finalizeTaskStatus } from "../services/task-manager.js";
import { queryOne, query } from "../db/client.js";
import { getEngine } from "../adapters/registry.js";
import { buildContext } from "../services/context-injector.js";
import { buildProjectKnowledge } from "../services/project-knowledge.js";
import { listAgents, getAgent } from "../services/agent-registry.js";
import { listPresence } from "../services/presence-service.js";
import { listProjects } from "../services/project-registry.js";
import { loadConfig } from "../config.js";

const execFileAsync = promisify(execFile);

const STOP_WORDS = new Set(["the","a","an","is","for","to","in","of","and","with","on","it","this","that","from","by","at","be","as","or","not","no","do","but","can","will","just","should","now","的","了","在","是","和","与","不","有","这","那","我","你","把","被","让","给","从","到","对","为","以","及","等"]);
const IGNORE_PATH = new Set(["src","lib","node_modules","dist","build","pkg","cmd","internal","app","web","api","ui","packages","test","tests","spec","docs"]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .split(/[\s/\-_.:;,\(\)\[\]\{\}]+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

const ACTION_TASK_PATTERNS = [
  /优化/,
  /调整/,
  /修改/,
  /改(一下|造|进|掉|成)?/,
  /修复/,
  /修(一下|掉|好)?/,
  /添加/,
  /新增/,
  /实现/,
  /开发/,
  /重构/,
  /完善/,
  /更新/,
  /接入/,
  /集成/,
  /\b(ui|ux)\b/i,
  /\b(fix|bug|implement|add|update|refactor|improve|optimi[sz]e|polish|build)\b/i,
];

const WRITE_TOOL_PATTERNS = [
  /edit/i,
  /write/i,
  /multi.?edit/i,
  /file.?edit/i,
  /apply.?patch/i,
  /patch/i,
  /create/i,
];

function requiresImplementationActivity(task: any): boolean {
  if (["feature", "bug"].includes(task.type)) return true;
  const text = [task.title, task.description || "", ...(task.labels || [])].join(" ");
  return ACTION_TASK_PATTERNS.some((pattern) => pattern.test(text));
}

function isWriteLikeTool(tool?: string): boolean {
  if (!tool) return false;
  return WRITE_TOOL_PATTERNS.some((pattern) => pattern.test(tool));
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

async function getImplementationSnapshot(workingDir?: string): Promise<string | null> {
  if (!workingDir) return null;
  try {
    await execFileAsync("git", ["-C", workingDir, "rev-parse", "--is-inside-work-tree"], {
      timeout: 5000,
    });
    const [status, diff, stagedDiff] = await Promise.all([
      execFileAsync("git", ["-C", workingDir, "status", "--porcelain=v1", "-z"], {
        timeout: 10000,
        maxBuffer: 5 * 1024 * 1024,
      }),
      execFileAsync("git", ["-C", workingDir, "diff", "--binary"], {
        timeout: 10000,
        maxBuffer: 20 * 1024 * 1024,
      }),
      execFileAsync("git", ["-C", workingDir, "diff", "--cached", "--binary"], {
        timeout: 10000,
        maxBuffer: 20 * 1024 * 1024,
      }),
    ]);
    return [
      status.stdout,
      diff.stdout,
      stagedDiff.stdout,
    ].join("\n--- implementation-snapshot ---\n");
  } catch {
    return null;
  }
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

async function getLatestTaskTrace(taskId: string, traceId?: string | null, taskStatus?: string): Promise<any | null> {
  let trace = null;
  if (traceId) {
    trace = await queryOne("SELECT * FROM execution_traces WHERE id = $1", [traceId]);
  }
  if (!trace) {
    trace = await queryOne(
      "SELECT * FROM execution_traces WHERE task_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 1",
      [taskId],
    );
  }
  if (!trace) return null;

  if (trace && taskStatus && ["completed", "failed", "cancelled"].includes(taskStatus) && (trace as any).status === "running") {
    const reconciledStatus = taskStatus === "completed" ? "completed" : "failed";
    const updated = await queryOne(
      `UPDATE execution_traces
          SET status = $1,
              completed_at = COALESCE(completed_at, now()),
              error_message = CASE
                WHEN $1 = 'failed' AND error_message IS NULL THEN 'Task reached terminal state before trace finalization completed.'
                ELSE error_message
              END,
              updated_at = now()
        WHERE id = $2
        RETURNING *`,
      [reconciledStatus, (trace as any).id],
    );
    if (updated) trace = updated;
  }

  const toolCalls = await query(
    "SELECT * FROM trace_tool_calls WHERE trace_id = $1 ORDER BY seq",
    [(trace as any).id],
  );
  return { ...(trace as Record<string, unknown>), tool_calls: toolCalls };
}

async function ensureTaskExecutionSession(input: {
  task: any;
  engineName: string;
  sessionId?: string;
  traceId: string | null;
  status: "running" | "completed" | "failed";
  lastOutput?: string | null;
}): Promise<string | null> {
  if (!input.traceId) return null;
  const agentId = input.task.assignee_id ?? `agent-${input.engineName}`;

  if (input.sessionId) {
    const updated = await queryOne<{ id: string }>(
      `UPDATE agent_sessions
          SET status = $1,
              agent_id = $2,
              project_id = $3,
              task_id = $4,
              platform = COALESCE(platform, 'engine'),
              last_output = $5,
              source_ref = $6,
              completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN now() ELSE NULL END,
              last_interaction_at = now(),
              updated_at = now(),
              metadata = COALESCE(metadata, '{}'::jsonb) || $7::jsonb
        WHERE id = $8
        RETURNING id`,
      [
        input.status,
        agentId,
        input.task.project_id ?? null,
        input.task.id,
        input.lastOutput ?? null,
        input.traceId,
        JSON.stringify({ engine: input.engineName, title: input.task.title }),
        input.sessionId,
      ],
    );
    if (updated?.id) return updated.id;
  }

  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM agent_sessions WHERE source_ref = $1 ORDER BY created_at DESC LIMIT 1",
    [input.traceId],
  );

  if (existing?.id) {
    await query(
      `UPDATE agent_sessions
          SET status = $1,
              agent_id = $2,
              project_id = $3,
              task_id = $4,
              platform = 'engine',
              last_output = COALESCE($5, last_output),
              last_interaction_at = now(),
              completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $6`,
      [
        input.status,
        agentId,
        input.task.project_id ?? null,
        input.task.id,
        input.lastOutput ?? null,
        existing.id,
      ],
    );
    return existing.id;
  }

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO agent_sessions (
       agent_id, project_id, task_id, platform, status, last_output, source_ref,
       can_reply, can_pause, can_stop, metadata
     ) VALUES ($1,$2,$3,'engine',$4,$5,$6,false,false,false,$7::jsonb)
     RETURNING id`,
    [
      agentId,
      input.task.project_id ?? null,
      input.task.id,
      input.status,
      input.lastOutput ?? null,
      input.traceId,
      JSON.stringify({ engine: input.engineName }),
    ],
  );
  return inserted?.id ?? null;
}

async function finalizeExecutionState(input: {
  taskId: string;
  traceId: string | null;
  sessionId: string | null;
  status: "completed" | "failed";
  summary: string | null;
  errorMessage: string | null;
  inputTokens: number;
  outputTokens: number;
  model: string | null;
}): Promise<void> {
  await finalizeTaskStatus(input.taskId, input.status);

  if (input.traceId) {
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
        input.status,
        input.summary,
        input.errorMessage,
        input.inputTokens,
        input.outputTokens,
        input.model,
        input.traceId,
      ],
    );
  }

  if (input.sessionId) {
    await query(
      `UPDATE agent_sessions
          SET status = $1,
              last_output = COALESCE($2, last_output),
              completed_at = now(),
              last_interaction_at = now(),
              updated_at = now()
        WHERE id = $3`,
      [input.status, input.errorMessage ?? input.summary, input.sessionId],
    );
  }
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
    const trace = await getLatestTaskTrace(id, task.trace_id, task.status);
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
    const { engine: engineName, session_id, native_session_id } = req.body as { engine: string; session_id?: string; native_session_id?: string };
    if (!engineName) return reply.code(400).send({ error: "engine is required" });

    // 4. 获取引擎
    const engine = await getEngine(engineName);
    if (!engine) return reply.code(404).send({ error: `engine not found: ${engineName}` });

    // 4.5 检测引擎是否已安装（必须在 transitionTask 之前）
    const installed = await engine.detectInstalled().catch(() => false);
    if (!installed) return reply.code(400).send({ error: `Engine not installed: ${engineName}` });

    // 5. 自动 transition → in_progress
    await transitionTask(id, "in_progress");
    const executionAgentId = task.assignee_id ?? `agent-${engineName}`;

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

    // 7.6 fallback: 无项目上下文时，注入项目列表让 Agent 自行判断
    if (!systemPrompt) {
      try {
        const projects = await listProjects();
        const activeProjects = projects.filter((p: any) => p.status === 'active');
        if (activeProjects.length > 0) {
          const lines = [
            '# Available Projects',
            '',
            'No project was automatically matched. Here are the available active projects:',
            '',
          ];
          for (const p of activeProjects) {
            let desc = `- **${p.name}** (\`${p.path}\`)`;
            if (p.description) desc += ` — ${p.description}`;
            if (p.tech_stack?.length) desc += ` [${p.tech_stack.join(', ')}]`;
            lines.push(desc);
          }
          lines.push('', 'Determine which project is most relevant to the task and work in that directory.');
          systemPrompt = lines.join('\n');
          // workingDir 不设，让 Agent 自己通过 -C 或 cd 选择
          // 但为了兼容引擎不支持自动 cd 的情况，用第一个项目作为 fallback
          if (!workingDir && activeProjects.length === 1) {
            workingDir = activeProjects[0].path;
          }
        }
      } catch { /* fallback 失败不阻塞执行 */ }
    }

    // 7.5 注入 Agent 执行守则：避免 Agent 卡在"出方案等用户选"，让任务直接闭环
    //    适用于通过 monitor 发起的非显式规划类任务。Blueprint 类流程不经过此端点不受影响。
    const executionGuidelines = [
      ``,
      `# Execution Guidelines`,
      ``,
      `You are running as a worker agent invoked by the user via an automated task monitor.`,
      `Follow these rules so the task reaches a terminal state without manual approval:`,
      ``,
      `## 决策原则`,
      `- **方向已经明显的事不要列方案让用户选**。能确认就直接动手，做错了大不了 revert 重新来。`,
      `- **真正需要用户拍板的情况才停下来问**：涉及凭据/付费/外部账号，或多个方案有显著不同的代价且无法 revert。`,
      `- 等价方案（N 个差不多）→ 自己选 1 个执行，简短说明选择理由（1 行），继续。`,
      `- 任务模糊 → 最小合理假设 + 1 行注记 + 继续。`,
      ``,
      `## 输出风格`,
      `- 不要输出 A/B/C 并列方案 + "请问选哪个"。`,
      `- 不要用"如果你希望...可以..."这种甩锅句式。`,
      `- 决策结论前置，理由用 1-2 行说清，然后直接做。`,
      ``,
      `## 唯一允许停下等批准的情况`,
      `- 需要凭据 / 付费 / 外部账号`,
      `- 用户显式说 \`只给方案，不要实施\` / \`只要建议\` / \`列出方案我看看\``,
      `- 不可逆的破坏性操作（删分支、force push、rm -rf 等）`,
    ].join('\n');
    if (systemPrompt) {
      systemPrompt = `${systemPrompt}\n${executionGuidelines}`;
    } else {
      systemPrompt = executionGuidelines;
    }

    // 7.7 注入项目领域知识（MEMORY.md / CLAUDE.md 等）
    if (task.project_id) {
      try {
        const projectKnowledge = await buildProjectKnowledge(task.project_id);
        if (projectKnowledge) {
          systemPrompt = systemPrompt
            ? `${systemPrompt}\n\n${projectKnowledge}`
            : projectKnowledge;
        }
      } catch { /* 知识注入失败不阻塞执行 */ }
    }

    // 8. 写入 execution_traces 起始记录（task_id 是 UNIQUE，使用 ON CONFLICT 幂等）
    let traceId: string | null = null;
    let executionSessionId: string | null = null;
    let traceSeq = 0;
    try {
      const inserted = await queryOne<{ id: string }>(
        `INSERT INTO execution_traces
           (task_id, project_id, agent_id, source, status, title, description, started_at, completed_at, error_message, summary, retry_count)
         VALUES ($1, $2, $3, $4, 'running', $5, $6, now(), NULL, NULL, NULL, 0)
         ON CONFLICT (task_id) DO UPDATE
           SET status = 'running',
               project_id = EXCLUDED.project_id,
               agent_id = EXCLUDED.agent_id,
               source = EXCLUDED.source,
               title = EXCLUDED.title,
               description = EXCLUDED.description,
               started_at = now(),
               completed_at = NULL,
               error_message = NULL,
               summary = NULL,
               duration_ms = 0,
               input_tokens = 0,
               output_tokens = 0,
               model = NULL,
               retry_count = execution_traces.retry_count + 1,
               updated_at = now()
         RETURNING id`,
        [
          id,
          task.project_id ?? null,
          executionAgentId,
          engineName,
          task.title,
          task.description ?? null,
        ],
      );
      traceId = inserted?.id ?? null;
      if (traceId) {
        await query(
          "UPDATE tasks SET trace_id = $1, assignee_id = COALESCE(assignee_id, $2), updated_at = now() WHERE id = $3",
          [traceId, executionAgentId, id],
        );
        executionSessionId = await ensureTaskExecutionSession({
          task: { ...task, assignee_id: executionAgentId },
          engineName,
          sessionId: session_id,
          traceId,
          status: "running",
          lastOutput: "任务执行已开始",
        });
      }
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
    const implementationRequired = requiresImplementationActivity(task);
    const implementationSnapshotBefore = implementationRequired
      ? await getImplementationSnapshot(workingDir)
      : null;
    let toolUseCount = 0;
    let writeLikeToolCount = 0;
    // nativeSession 支持：在 try 之前声明，catch 也能访问
    let nativeSession: Promise<{ id: string; kind: string } | undefined> | undefined;
    let nativeSessionResolved: { id: string; kind: string } | undefined;
    let lastTraceProgressAt = 0;

    try {
      sseWrite(res, 'start', { runId: `task_${id}`, taskId: id, traceId });

      const runOpts: Record<string, unknown> = { systemPrompt, workingDir };
      if (session_id) runOpts.sessionId = session_id;
      if (native_session_id) runOpts.nativeSessionId = native_session_id;

      const stream = engine.run(prompt, runOpts);
      nativeSession = (stream as any).nativeSession as Promise<{ id: string; kind: string } | undefined> | undefined;

      for await (const msg of stream) {
        // 累积文本片段；运行中定期落库，详情页轮询时能看到当前输出。
        if (msg.type === 'text' && typeof msg.content === 'string') {
          textChunks.push(msg.content);
          const now = Date.now();
          if (traceId && now - lastTraceProgressAt > 1000) {
            lastTraceProgressAt = now;
            const currentSummary = textChunks.join('');
            void query(
              `UPDATE execution_traces
                  SET summary = $1,
                      updated_at = now()
                WHERE id = $2`,
              [currentSummary || null, traceId],
            ).catch((traceErr: any) => {
              console.error(`[tasks.execute] failed to update trace summary: ${traceErr?.message ?? traceErr}`);
            });
          }
          if (executionSessionId) {
            const lastOutput = textChunks.join('').slice(-1000);
            void query(
              `UPDATE agent_sessions
                  SET last_output = $1,
                      last_interaction_at = now(),
                      updated_at = now()
                WHERE id = $2`,
              [lastOutput, executionSessionId],
            ).catch((sessionErr: any) => {
              console.error(`[tasks.execute] failed to update session output: ${sessionErr?.message ?? sessionErr}`);
            });
          }
        }

        if (msg.type === 'tool_use') {
          toolUseCount += 1;
          if (isWriteLikeTool(msg.tool)) writeLikeToolCount += 1;
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

        sseWrite(res, 'message', msg);
      }

      const implementationSnapshotAfter = implementationRequired
        ? await getImplementationSnapshot(workingDir)
        : null;
      const workspaceChanged = implementationSnapshotBefore !== null
        && implementationSnapshotAfter !== null
        && implementationSnapshotBefore !== implementationSnapshotAfter;
      const noImplementationActivity = implementationRequired
        && toolUseCount === 0
        && writeLikeToolCount === 0
        && !workspaceChanged;
      if (noImplementationActivity) {
        errorMessage = [
          "No implementation activity detected for an action-oriented task.",
          "The agent returned text, but no tool events or workspace changes were detected, so the task was not marked completed.",
        ].join(" ");
        runStatus = 'failed';
        sseWrite(res, 'error', { error: errorMessage, reason: "no_implementation_activity" });
        sseWrite(res, 'done', { runId: `task_${id}`, taskId: id, finalStatus: "failed", nativeSession: nativeSessionResolved });
        return;
      }

      // 成功完成 → 自动 transition → completed
      // 等待 nativeSession 解析（如果存在）
      if (nativeSession) {
        try {
          nativeSessionResolved = await nativeSession;
          if (nativeSessionResolved) {
            sseWrite(res, 'native_session', nativeSessionResolved);
          }
        } catch { /* nativeSession 解析失败不阻塞完成 */ }
      }

      runStatus = 'completed';
      sseWrite(res, 'done', { runId: `task_${id}`, taskId: id, finalStatus: "completed", nativeSession: nativeSessionResolved });
    } catch (err: any) {
      // 异常 → 自动 transition → failed
      // 错误路径也尝试解析 nativeSession（可能已在错误前解析）
      if (nativeSession) {
        try {
          nativeSessionResolved = await nativeSession;
          if (nativeSessionResolved) {
            sseWrite(res, 'native_session', nativeSessionResolved);
          }
        } catch { /* 错误路径下不阻塞 */ }
      }

      errorMessage = err?.message ?? String(err);
      runStatus = 'failed';
      sseWrite(res, 'error', { error: errorMessage });
      sseWrite(res, 'done', { runId: `task_${id}`, taskId: id, finalStatus: "failed", nativeSession: nativeSessionResolved });
    } finally {
      // 关闭 SSE
      if (!res.writableEnded) res.end();

      const summary = textChunks.join('') || null;
      try {
        await finalizeExecutionState({
          taskId: id,
          traceId,
          sessionId: executionSessionId,
          status: runStatus,
          summary,
          errorMessage,
          inputTokens,
          outputTokens,
          model,
        });
      } catch (updErr: any) {
        console.error(`[tasks.execute] failed to finalize execution state: ${updErr?.message ?? updErr}`);
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
    // 4a. 用户手动选了 agent → 从 agent 的 engine_id 取引擎
    if (body.assignee_id && !recommendedEngine) {
      const agent = await getAgent(body.assignee_id);
      if (agent?.engine_id) {
        const eng = await getEngine(agent.engine_id);
        if (eng?.installed) {
          recommendedEngine = {
            id: eng.id,
            label: eng.label,
            installed: true,
            reason: `用户选择的 Agent 使用的引擎`,
          };
        }
      }
    }
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
    // fallback：按配置选择 Router / smart-task 默认引擎，找第一个 installed 的
    if (!recommendedEngine) {
      const cfg = loadConfig();
      const engineIds = uniq([
        cfg.workflow.router_engine_id,
        ...cfg.workflow.router_fallback_engine_ids,
      ]);
      for (const eid of engineIds) {
        const eng = await getEngine(eid);
        if (eng?.installed) {
          recommendedEngine = {
            id: eng.id,
            label: eng.label,
            installed: true,
            reason: eid === cfg.workflow.router_engine_id
              ? '配置的 Router 默认引擎'
              : '配置的 Router fallback 引擎',
          };
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
