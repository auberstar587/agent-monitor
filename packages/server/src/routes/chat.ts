import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { getEngine } from '../adapters/registry.js';
/** SSE 辅助：写入一条事件，自动检查 writableEnded */
function sseWrite(res: any, event: string, data: object): boolean {
  if (res.writableEnded) return false;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  return true;
}

export async function routes(fastify: FastifyInstance, options: FastifyPluginOptions): Promise<void> {

  // POST /run — SSE 流式执行 Prompt
  fastify.post('/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { engine: engineName, prompt, model, workingDir } = request.body as {
      engine: string;
      prompt: string;
      model?: string;
      workingDir?: string;
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
      // 调用引擎 run 获取消息流（runId 由适配器生成，如 claude_xxx）
      const stream = engine.run(prompt, { model, workingDir });
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
