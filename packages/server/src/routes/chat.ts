import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { getEngine } from '../adapters/registry.js';
import { buildContext, type ProjectContext } from '../services/context-injector.js';
/** SSE 辅助：写入一条事件，自动检查 writableEnded */
function sseWrite(res: any, event: string, data: object): boolean {
  if (res.writableEnded) return false;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  return true;
}

/** 把 ProjectContext 拼成 systemPrompt 字符串。project 为 null 返回空串。 */
function buildSystemPrompt(ctx: ProjectContext): string {
  if (!ctx.project) return '';
  const p = ctx.project;
  const lines: string[] = [
    `# Project Context`,
    ``,
    `You are working on the project **${p.name}** (path: \`${p.path}\`).`,
  ];
  if (p.description) lines.push(``, p.description);
  if (p.tech_stack && p.tech_stack.length > 0) {
    lines.push(``, `**Tech stack:** ${p.tech_stack.join(', ')}`);
  }
  if (p.goals && p.goals.length > 0) {
    lines.push(``, `**Goals:**`);
    for (const g of p.goals) lines.push(`- ${g}`);
  }
  lines.push(``, `**Status:** ${p.status}`);
  return lines.join('\n');
}

export async function routes(fastify: FastifyInstance, options: FastifyPluginOptions): Promise<void> {

  // POST /run — SSE 流式执行 Prompt
  fastify.post('/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { engine: engineName, prompt, model, workingDir, projectId } = request.body as {
      engine: string;
      prompt: string;
      model?: string;
      workingDir?: string;
      projectId?: string;
    };

    // 获取引擎实例
    const engine = await getEngine(engineName);
    if (!engine) {
      reply.code(404).send({ error: `Engine not found: ${engineName}` });
      return;
    }

    // 接管 raw socket，绕过 Fastify 的响应缓冲
    reply.hijack();

    const res = reply.raw;
    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      // 如果带 projectId，注入项目上下文到 systemPrompt
      let systemPrompt: string | undefined;
      if (projectId) {
        const ctx = await buildContext(projectId);
        const projectPrompt = buildSystemPrompt(ctx);
        if (projectPrompt) systemPrompt = projectPrompt;
        // 注：若以后其他来源也会注入 base systemPrompt（body 字段、middleware 等），
        // 在这里做叠加：systemPrompt = base ? `${base}\n\n${projectPrompt}` : projectPrompt
      }

      // 调用引擎 run 获取消息流（runId 由适配器生成，如 claude_xxx）
      const stream = engine.run(prompt, { model, workingDir, systemPrompt });
      const runId = stream.runId;

      // 发送 start 事件
      sseWrite(res, 'start', { runId });

      for await (const msg of stream) {
        if (!sseWrite(res, 'message', { ...msg })) {
          // 客户端已断连，终止循环
          break;
        }
      }

      // 流结束，发送 done 事件
      sseWrite(res, 'done', { runId });
    } catch (err: any) {
      // 异常时发送 error 事件
      sseWrite(res, 'error', { error: err?.message ?? String(err) });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  // POST /cancel — 取消正在运行的任务
  fastify.post('/cancel', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { engine: engineName, runId } = request.body as {
      engine: string;
      runId: string;
    };

    const engine = await getEngine(engineName);
    if (engine) {
      try {
        await engine.cancel(runId);
      } catch {
        // runId 不存在或已结束，静默忽略
      }
    }

    return { ok: true };
  });

}
