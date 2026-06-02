import type { EngineAdapter, EngineMessage, EngineUsage } from '../engine.js';
import { startMetrics, getMetrics } from '../engine.js';
import { createMulticaAdapter } from './index.js';
import type { MulticaAdapterOptions } from './index.js';

/**
 * Multica 作为 EngineAdapter 的实现
 *
 * 复用 createMulticaAdapter 的 HTTP/WS 能力，
 * 把 "run a prompt" 映射为 "createIssue + 监听 WS 消息流"。
 */
export async function createMulticaEngineAdapter(
  options: MulticaAdapterOptions
): Promise<EngineAdapter> {
  // 延迟创建平台适配器（需要它来发任务 + 收消息）
  let _platformAdapter: Awaited<ReturnType<typeof createMulticaAdapter>> | null = null;

  async function getPlatformAdapter() {
    if (!_platformAdapter) {
      _platformAdapter = await createMulticaAdapter(options);
    }
    return _platformAdapter;
  }

  return {
    id: 'multica',
    label: 'Multica',
    installed: true, // Multica 是基座，默认可用

    async detectInstalled() {
      try {
        const pa = await getPlatformAdapter();
        return pa.ping();
      } catch {
        return false;
      }
    },

    run(prompt: string, opts?: Record<string, unknown>) {
      const runId = `multica_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const model = (opts?.model as string) || 'multica-default';
      const metrics = startMetrics(runId, { model, engineId: 'multica', persist: true });

      async function* gen(): AsyncGenerator<EngineMessage> {
        let seq = 0;
        metrics.recordStep();
        yield { seq: ++seq, type: 'system', content: `[Multica] 创建任务：$${prompt.slice(0, 80)}$${prompt.length > 80 ? '...' : ''}` };

        try {
          const pa = await getPlatformAdapter();

          // 用 opts?.projectId 或默认
          const projectId = (opts?.projectId as string) || 'default';
          const task = await pa.createTask({
            title: `AI Prompt: ${prompt.slice(0, 50)}`,
            description: prompt,
            projectId,
          });

          yield { seq: ++seq, type: 'system', content: `[Multica] 任务已创建：$${task.id}` };

          // 订阅 WS 消息流（简化的 mock：等 3 秒后返回完成）
          // TODO: 真实实现 → 连 Multica WS，把 task message 转成 EngineMessage yield 出来
          const startTs = Date.now();
          // mock 模拟 TTFT: 100ms 后首 token
          await new Promise(r => setTimeout(r, 100));
          metrics.recordFirstToken();
          metrics.recordOutputTokens(prompt.length);

          await new Promise(r => setTimeout(r, 2900));
          yield { seq: ++seq, type: 'text', content: `（Mock）Multica 任务 $${task.id} 执行完成。\n\n后续接入真实 WS 后会返回实际输出。` };
          metrics.recordToolLatency(Date.now() - startTs);
          metrics.finish();
        } catch (err: any) {
          yield { seq: ++seq, type: 'error', content: err?.message || 'Unknown error' };
          metrics.finish();
        }
      }

      const it = gen() as AsyncGenerator<EngineMessage> & { runId: string };
      (it as unknown as { runId: string }).runId = runId;
      return it;
    },

    async approve(requestId: string) {
      // Multica 的审批流通过 WS 事件推送，这里简化为直接批准
      console.log(`[MulticaEngine] approve called, requestId=$${requestId}`);
      return true;
    },

    async cancel(runId: string) {
      console.log(`[MulticaEngine] cancel called, runId=$${runId}`);
      // TODO: 通过 Multica API 取消任务
    },

    async cost(runId: string): Promise<EngineUsage | null> {
      const m = getMetrics(runId);
      if (!m) return null;
      return m.snapshot();
    },
  };
}
