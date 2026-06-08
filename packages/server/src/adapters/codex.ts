import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { EngineAdapter, EngineMessage } from './engine.js';
import { startMetrics, getMetrics } from './engine.js';

export interface CodexAdapterOptions {
  codexPath?: string;
  workingDir?: string;
  /** 最大等待时间（ms），默认 5 分钟 */
  timeoutMs?: number;
}

/** Codex CLI JSONL 事件（exec --json 输出） */
interface CodexEvent {
  type: string;
  // thread.started
  thread_id?: string;
  // item.started / item.completed
  item?: {
    type: string; // 'agent_message' | 'command_execution' | 'file_change' | 'mcp_tool_call'
    text?: string;
    command?: string[] | string;
    path?: string;
    // mcp_tool_call
    tool_name?: string;
    tool_input?: unknown;
    tool_output?: string;
  };
  // turn.completed
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cached_input_tokens?: number;
  };
  // error
  message?: string;
}

const _runningChildren = new Map<string, ChildProcess>();

export async function createCodexAdapter(
  options?: CodexAdapterOptions,
): Promise<EngineAdapter> {
  const codexPath = options?.codexPath || 'codex';
  const workingDir = options?.workingDir;
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;

  const installed = await detectInstalled(codexPath);

  return {
    id: 'codex',
    label: 'Codex CLI',
    installed,

    async detectInstalled() {
      return installed;
    },

    run(prompt: string, opts?: Record<string, unknown>) {
      const runId = `codex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const explicitModel = opts?.model as string | undefined;
      const extraArgs = (opts?.extraArgs as string[] | undefined) ?? [];
      const effectiveWorkingDir = (opts?.workingDir as string | undefined) ?? workingDir;
      // CORE-06: 支持 resume 已有 thread (sessionId / nativeSessionId)
      const resumeThreadId = (opts?.sessionId as string | undefined)
        ?? (opts?.nativeSessionId as string | undefined);
      // metrics model: 仅当 caller 显式传入时才记录（不伪造默认值）
      const metricsModel = explicitModel || undefined;
      const metrics = startMetrics(runId, { model: metricsModel, engineId: 'codex', persist: true });

      // pre-spawn 占位，支持 cancel
      _runningChildren.set(runId, null as unknown as ChildProcess);

      // nativeSession 通过 deferred promise 暴露（解析到 thread.started 的 thread_id）
      let nativeSessionResolve: (v: { id: string; kind: string } | undefined) => void;
      let nativeSessionSettled = false;
      const nativeSessionPromise = new Promise<{ id: string; kind: string } | undefined>((resolve) => {
        nativeSessionResolve = (value) => {
          if (nativeSessionSettled) return;
          nativeSessionSettled = true;
          resolve(value);
        };
      });

      async function* gen(): AsyncGenerator<EngineMessage> {
        let seq = 0;
        metrics.recordStep();
        yield {
          seq: ++seq,
          type: 'system',
          content: `[Codex CLI] 收到 prompt（${prompt.length} 字符）→ spawn ${codexPath}`,
        };

        // 构建参数：无 resume 时直接 prompt，有 resume 时 "resume <id> <prompt>"
        const baseArgs: string[] = [
          'exec',
          '--json',
          '--sandbox', 'workspace-write',
          '--color', 'never',
          '-c', 'model_reasoning_effort="high"',
          '--enable', 'web_search_cached',
        ];

        // 仅当 caller 显式传入 model 时才附加 --model（不伪造默认值）
        const modelArg = explicitModel ? ['--model', explicitModel] : [];

        const systemPrompt = opts?.systemPrompt as string | undefined;
        const effectivePrompt = systemPrompt
          ? `${systemPrompt}\n\n---\n\n${prompt}`
          : prompt;
        // 当有 systemPrompt 时 prompt 较长，用 stdin 传入避免命令行参数过长
        const useStdin = !!systemPrompt && effectivePrompt.length > 500;
        const args: string[] = resumeThreadId
          ? [...baseArgs, ...modelArg, 'resume', resumeThreadId, effectivePrompt]
          : useStdin
            ? [...baseArgs, ...modelArg, '-']
            : [...baseArgs, ...modelArg, effectivePrompt];

        const child = spawn(codexPath, args, {
          cwd: effectiveWorkingDir,
          env: process.env,
          stdio: [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        });
        // 通过 stdin 传入长 prompt
        if (useStdin) {
          child.stdin!.write(effectivePrompt);
          child.stdin!.end();
        }

        // 检查是否已被 pre-spawn cancel
        if (!_runningChildren.has(runId)) {
          try { child.kill('SIGKILL'); } catch {}
          return;
        }
        _runningChildren.set(runId, child);

        // 解析 JSONL 流：每行一个 JSON 事件
        const rl = createInterface({ input: child.stdout! });
        let firstTokenReceived = false;

        try {
          for await (const line of rl) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let evt: CodexEvent;
            try {
              evt = JSON.parse(trimmed);
            } catch {
              // 忽略非 JSON 行
              continue;
            }

            // 解析 thread.started 事件，提取 thread_id → nativeSession
            if (evt.type === 'thread.started' && (evt as any).thread_id && nativeSessionResolve) {
              nativeSessionResolve({ id: (evt as any).thread_id, kind: 'codex_thread' });
            }

            yield* handleCodexEvent(evt, metrics, () => {
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                metrics.recordFirstToken();
              }
            }, () => ++seq);
          }

          // 等子进程退出
          const exitCode: number = await new Promise((resolve) => {
            child.once('close', resolve);
            setTimeout(() => {
              try { child.kill('SIGTERM'); } catch {}
              resolve(-1);
            }, timeoutMs).unref?.();
          });

          if (exitCode !== 0) {
            const msg =
              exitCode === -1
                ? `codex CLI timeout (killed after ${timeoutMs}ms)`
                : `codex CLI exited with code ${exitCode}`;
            yield { seq: ++seq, type: 'error', content: msg };
          }
        } catch (err: any) {
          yield { seq: ++seq, type: 'error', content: err?.message || 'spawn/parse error' };
        } finally {
          nativeSessionResolve(undefined);
          metrics.finish();
          _runningChildren.delete(runId);
        }
      }

      const it = gen() as AsyncGenerator<EngineMessage> & {
        runId: string;
        nativeSession: Promise<{ id: string; kind: string } | undefined>;
      };
      (it as unknown as { runId: string }).runId = runId;
      (it as unknown as { nativeSession: Promise<{ id: string; kind: string } | undefined> }).nativeSession = nativeSessionPromise;
      return it;
    },

    async approve(_requestId: string) {
      // codex exec 由 sandbox 策略控制，无审批流
      return false;
    },

    async cancel(runId: string) {
      const child = _runningChildren.get(runId);
      if (!child) {
        console.log(`[CodexAdapter] cancel: no running child for runId=${runId}`);
        return;
      }
      // pre-spawn 占位
      if (child === null) {
        _runningChildren.delete(runId);
        console.log(`[CodexAdapter] cancel: pre-spawn cancel for runId=${runId}`);
        return;
      }
      try {
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
        console.log(`[CodexAdapter] cancelled runId=${runId}`);
      } catch (err: any) {
        console.error(`[CodexAdapter] cancel error: ${err?.message}`);
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

/** 处理单个 Codex JSONL 事件 */
function* handleCodexEvent(
  evt: CodexEvent,
  metrics: ReturnType<typeof startMetrics>,
  onFirstToken: () => void,
  nextSeq: () => number,
): Generator<EngineMessage> {
  // turn.completed: 提取 usage 指标
  if (evt.type === 'turn.completed') {
    if (evt.usage?.input_tokens !== undefined) {
      metrics.setInputTokens(evt.usage.input_tokens);
    }
    if (evt.usage?.output_tokens !== undefined) {
      metrics.recordOutputTokens(evt.usage.output_tokens);
    }
    metrics.recordStep();
    return;
  }

  // item.completed: 根据 item.type yield 对应消息
  if (evt.type === 'item.completed' && evt.item) {
    const item = evt.item;

    switch (item.type) {
      case 'agent_message':
        if (item.text) {
          onFirstToken();
          yield { seq: nextSeq(), type: 'text', content: item.text };
        }
        break;

      case 'command_execution':
        yield {
          seq: nextSeq(),
          type: 'tool_use',
          tool: 'command',
          input: { command: Array.isArray(item.command) ? item.command.join(' ') : (item.command || '') },
        };
        break;

      case 'file_change':
        yield {
          seq: nextSeq(),
          type: 'tool_use',
          tool: 'file_edit',
          input: { path: item.path || '' },
        };
        break;

      case 'mcp_tool_call':
        yield {
          seq: nextSeq(),
          type: 'tool_use',
          tool: item.tool_name || 'mcp_tool',
          input: (item.tool_input as Record<string, unknown>) ?? {},
          output: item.tool_output,
        };
        break;
    }
    return;
  }

  // error 事件
  if (evt.type === 'error' && evt.message) {
    yield { seq: nextSeq(), type: 'error', content: evt.message };
    return;
  }

  // 其他事件（thread.started / turn.started / item.started）不 yield
}

async function detectInstalled(codexPath: string): Promise<boolean> {
  try {
    const { execFileSync } = await import('child_process');
    execFileSync(codexPath, ['--version'], { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch {
    // fallback: 检查 ~/.codex 目录
    try {
      const { homedir } = await import('os');
      const { access } = await import('fs/promises');
      await access(`${homedir()}/.codex`);
      return true;
    } catch {
      return false;
    }
  }
}
