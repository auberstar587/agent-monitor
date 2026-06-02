import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { EngineAdapter, EngineMessage } from './engine.js';
import { startMetrics, getMetrics } from './engine.js';

export interface ClaudeCodeAdapterOptions {
  claudePath?: string;
  workingDir?: string;
  /** 最大等待时间（ms），默认 5 分钟 */
  timeoutMs?: number;
}

interface StreamEvent {
  type: string;
  subtype?: string;
  message?: {
    role?: string;
    content?: Array<{ type: string; text?: string; input?: unknown; name?: string }>;
  };
  /** 终态 result 事件携带 5 指标 */
  duration_ms?: number;
  duration_api_ms?: number;
  ttft_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  modelUsage?: Record<
    string,
    {
      inputTokens?: number;
      outputTokens?: number;
      costUSD?: number;
      contextWindow?: number;
    }
  >;
}

const _runningChildren = new Map<string, ChildProcess>();

export async function createClaudeCodeAdapter(
  options?: ClaudeCodeAdapterOptions
): Promise<EngineAdapter> {
  const claudePath = options?.claudePath || 'claude';
  const workingDir = options?.workingDir;
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;

  const installed = await detectInstalled(claudePath);

  return {
    id: 'claude-code',
    label: 'Claude Code',
    installed,

    async detectInstalled() {
      return installed;
    },

    run(prompt: string, opts?: Record<string, unknown>) {
      const runId = `claude_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const model = (opts?.model as string) || 'sonnet';
      const systemPrompt = opts?.systemPrompt as string | undefined;
      const extraArgs = (opts?.extraArgs as string[] | undefined) ?? [];
      const metrics = startMetrics(runId, { model });

      // 先把 runId 标"待启动"，让 cancel() 在 spawn 前也能识别
      // 用 null 占位，spawn 完成后替换为真实 child
      _runningChildren.set(runId, null as unknown as ChildProcess);

      async function* gen(): AsyncGenerator<EngineMessage> {
        let seq = 0;
        metrics.recordStep();
        yield { seq: ++seq, type: 'system', content: `[Claude Code] 收到 prompt（${prompt.length} 字符）→ spawn ${claudePath}` };

        const args: string[] = [
          '--print',
          '--output-format', 'stream-json',
          '--verbose',
          ...(systemPrompt ? ['--append-system-prompt', systemPrompt] : []),
          ...extraArgs,
          prompt,
        ];

        const child = spawn(claudePath, args, {
          cwd: workingDir,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        // 检查是否已被 pre-spawn cancel
        if (!_runningChildren.has(runId)) {
          // 已被取消，立刻 kill 这个孤儿
          try { child.kill('SIGKILL'); } catch {}
          return; // 不 yield 任何东西，generator 结束
        }
        _runningChildren.set(runId, child);

        // 解析 stream-json：每行一个 JSON 事件
        const rl = createInterface({ input: child.stdout! });
        let firstTokenReceived = false;

        try {
          for await (const line of rl) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let evt: StreamEvent;
            try {
              evt = JSON.parse(trimmed);
            } catch {
              // 忽略非 JSON 行（兼容性）
              continue;
            }

            yield* handleStreamEvent(evt, metrics, () => {
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                metrics.recordFirstToken();
              }
            }, () => ++seq);
          }

          // 等子进程退出
          const exitCode: number = await new Promise((resolve) => {
            child.once('close', resolve);
            // 超时保护
            setTimeout(() => {
              try { child.kill('SIGTERM'); } catch {}
              resolve(-1);
            }, timeoutMs).unref?.();
          });

          if (exitCode !== 0 && exitCode !== -1) {
            yield { seq: ++seq, type: 'error', content: `claude CLI exited with code ${exitCode}` };
          }
        } catch (err: any) {
          yield { seq: ++seq, type: 'error', content: err?.message || 'spawn/parse error' };
        } finally {
          metrics.finish();
          _runningChildren.delete(runId);
        }
      }

      const it = gen() as AsyncGenerator<EngineMessage> & { runId: string };
      (it as unknown as { runId: string }).runId = runId;
      return it;
    },

    async approve(requestId: string) {
      // Claude Code CLI 目前无审批流协议，暂不支持
      return false;
    },

    async cancel(runId: string) {
      const child = _runningChildren.get(runId);
      if (!child) {
        console.log(`[ClaudeCodeAdapter] cancel: no running child for runId=${runId}`);
        return;
      }
      // null 占位 = 还没 spawn，标记"已取消"即可
      if (child === null) {
        _runningChildren.delete(runId);
        console.log(`[ClaudeCodeAdapter] cancel: pre-spawn cancel for runId=${runId}`);
        return;
      }
      try {
        // 先注册 close handler（避免 SIGTERM 触发 close 后 handler 还没注册）
        const closePromise = new Promise<void>((resolve) => {
          const t = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
            resolve();
          }, 2000);
          child.once('close', () => {
            clearTimeout(t);
            resolve();
          });
        });
        child.kill('SIGTERM');
        await closePromise;
        console.log(`[ClaudeCodeAdapter] cancelled runId=${runId}`);
      } catch (err: any) {
        console.error(`[ClaudeCodeAdapter] cancel error: ${err?.message}`);
      } finally {
        _runningChildren.delete(runId);
      }
    },

    async cost(runId: string) {
      const m = getMetrics(runId);
      if (!m) return null;
      return m.snapshot();
    },
  };
}

/** 处理单个 stream-json 事件，yield 对应 EngineMessage 并更新指标 */
function* handleStreamEvent(
  evt: StreamEvent,
  metrics: ReturnType<typeof startMetrics>,
  onFirstToken: () => void,
  nextSeq: () => number,
): Generator<EngineMessage> {
  // 终态 result 事件：5 指标的权威来源
  if (evt.type === 'result') {
    if (typeof evt.ttft_ms === 'number') {
      // CLI 报告的 TTFT 比我们 setTimeout 测的更准，覆盖
      metrics.overrideTtft(evt.ttft_ms);
      onFirstToken();
    }
    if (evt.usage?.input_tokens !== undefined) {
      metrics.setInputTokens(evt.usage.input_tokens);
    }
    if (evt.usage?.output_tokens !== undefined) {
      metrics.recordOutputTokens(evt.usage.output_tokens);
    }
    if (typeof evt.num_turns === 'number') {
      metrics.overrideSteps(evt.num_turns);
    }
    if (typeof evt.duration_api_ms === 'number') {
      metrics.overrideToolLatency(evt.duration_api_ms);
    }
    if (typeof evt.total_cost_usd === 'number') {
      metrics.overrideCost(Math.round(evt.total_cost_usd * 100));
    }
    yield {
      seq: nextSeq(),
      type: evt.is_error ? 'error' : 'text',
      content: evt.result || `(result: ${evt.subtype || 'completed'})`,
    };
    return;
  }

  // assistant 消息：text / tool_use 块
  if (evt.type === 'assistant' && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block.type === 'text' && block.text) {
        onFirstToken();
        yield { seq: nextSeq(), type: 'text', content: block.text };
      } else if (block.type === 'tool_use' && block.name) {
        yield {
          seq: nextSeq(),
          type: 'tool_use',
          tool: block.name,
          input: block.input as Record<string, unknown>,
        };
      }
    }
    return;
  }

  // system 事件（init / hook_started 等）— 不 yield，只记录
  // type:system 的 content 字段保留向后兼容
  if (evt.type === 'system') {
    yield {
      seq: nextSeq(),
      type: 'system',
      content: `[claude:${evt.subtype || 'system'}]`,
    };
  }
}

async function detectInstalled(claudePath: string): Promise<boolean> {
  try {
    const { execFileSync } = await import('child_process');
    execFileSync(claudePath, ['--version'], { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch {
    // fallback: 检查 ~/.claude 目录
    try {
      const { homedir } = await import('os');
      const { access } = await import('fs/promises');
      await access(`${homedir()}/.claude`);
      return true;
    } catch {
      return false;
    }
  }
}
