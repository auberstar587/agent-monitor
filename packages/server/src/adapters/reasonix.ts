import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { EngineAdapter, EngineMessage } from './engine.js';
import { startMetrics, getMetrics } from './engine.js';

export interface ReasonixAdapterOptions {
  reasonixPath?: string;
  workingDir?: string;
  timeoutMs?: number;
}

const _runningChildren = new Map<string, ChildProcess>();

export async function createReasonixAdapter(
  options?: ReasonixAdapterOptions,
): Promise<EngineAdapter> {
  const reasonixPath = options?.reasonixPath || 'reasonix';
  const workingDir = options?.workingDir;
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;

  const installed = await detectInstalled(reasonixPath);

  return {
    id: 'reasonix',
    label: 'Reasonix (DeepSeek)',
    installed,

    async detectInstalled() {
      return installed;
    },

    run(prompt: string, opts?: Record<string, unknown>) {
      const runId = `reasonix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const model = (opts?.model as string) || 'deepseek-v4-flash';
      const systemPrompt = opts?.systemPrompt as string | undefined;
      const effort = opts?.effort as string | undefined;
      const budget = opts?.budget as number | undefined;
      const metrics = startMetrics(runId, { model, engineId: 'reasonix', persist: true });

      // pre-spawn 占位，支持 cancel
      _runningChildren.set(runId, null as unknown as ChildProcess);

      async function* gen(): AsyncGenerator<EngineMessage> {
        let seq = 0;
        metrics.recordStep();
        yield {
          seq: ++seq,
          type: 'system',
          content: `[Reasonix] 收到 prompt（${prompt.length} 字符）→ spawn ${reasonixPath}`,
        };

        // 创建临时目录存放 transcript
        const tmpDir = await mkdtemp(join(tmpdir(), 'reasonix-'));
        const transcriptPath = join(tmpDir, 'transcript.jsonl');

        const args: string[] = [
          'run',
          '--transcript', transcriptPath,
          ...(systemPrompt ? ['--system', systemPrompt] : []),
          ...(effort ? ['--effort', effort] : []),
          ...(budget ? ['--budget', String(budget)] : []),
          '--model', model,
          prompt,
        ];

        const child = spawn(reasonixPath, args, {
          cwd: workingDir,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        // 检查是否已被 pre-spawn cancel
        if (!_runningChildren.has(runId)) {
          try { child.kill('SIGKILL'); } catch {}
          await cleanupTmp(tmpDir);
          return;
        }
        _runningChildren.set(runId, child);

        const rl = createInterface({ input: child.stdout! });
        let firstTokenReceived = false;

        try {
          for await (const line of rl) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // 跳过摘要行（以 "—" 或 "transcript:" 开头）
            if (trimmed.startsWith('—') || trimmed.startsWith('transcript:')) continue;

            if (!firstTokenReceived) {
              firstTokenReceived = true;
              metrics.recordFirstToken();
            }
            yield { seq: ++seq, type: 'text', content: trimmed };
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
                ? `reasonix CLI timeout (killed after ${timeoutMs}ms)`
                : `reasonix CLI exited with code ${exitCode}`;
            yield { seq: ++seq, type: 'error', content: msg };
          }

          // 解析 transcript JSONL 提取 usage/cost
          await parseTranscript(transcriptPath, metrics);
        } catch (err: any) {
          yield { seq: ++seq, type: 'error', content: err?.message || 'spawn/parse error' };
        } finally {
          metrics.finish();
          _runningChildren.delete(runId);
          await cleanupTmp(tmpDir);
        }
      }

      const it = gen() as AsyncGenerator<EngineMessage> & { runId: string };
      (it as unknown as { runId: string }).runId = runId;
      return it;
    },

    async approve(_requestId: string) {
      return false; // Reasonix 无审批流
    },

    async cancel(runId: string) {
      const child = _runningChildren.get(runId);
      if (!child) {
        console.log(`[ReasonixAdapter] cancel: no running child for runId=${runId}`);
        return;
      }
      // pre-spawn 占位
      if (child === null) {
        _runningChildren.delete(runId);
        console.log(`[ReasonixAdapter] cancel: pre-spawn cancel for runId=${runId}`);
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
        console.log(`[ReasonixAdapter] cancelled runId=${runId}`);
      } catch (err: any) {
        console.error(`[ReasonixAdapter] cancel error: ${err?.message}`);
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

/** 解析 transcript JSONL，提取 usage 和 cost 更新到 metrics */
async function parseTranscript(
  transcriptPath: string,
  metrics: ReturnType<typeof startMetrics>,
): Promise<void> {
  let content: string;
  try {
    content = await readFile(transcriptPath, 'utf-8');
  } catch {
    // transcript 文件不存在（reasonix 可能没写出）— 静默跳过
    return;
  }

  let maxTurn = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: any;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }

    // 从 assistant_final 提取 token 用量和 cost
    if (record.role === 'assistant_final') {
      if (record.usage?.prompt_tokens !== undefined) {
        metrics.setInputTokens(record.usage.prompt_tokens);
      }
      if (record.usage?.completion_tokens !== undefined) {
        metrics.recordOutputTokens(record.usage.completion_tokens);
      }
      if (typeof record.cost === 'number') {
        // cost 是 USD，转成 cents
        metrics.overrideCost(Math.round(record.cost * 100));
      }
    }

    // 从任意行提取 turn 数
    if (typeof record.turn === 'number' && record.turn > maxTurn) {
      maxTurn = record.turn;
    }
  }

  if (maxTurn > 0) {
    metrics.overrideSteps(maxTurn);
  }
}

async function cleanupTmp(tmpDir: string): Promise<void> {
  try {
    await rm(tmpDir, { recursive: true, force: true });
  } catch {
    // 清理失败不影响主流程
  }
}

async function detectInstalled(reasonixPath: string): Promise<boolean> {
  try {
    const { execFileSync } = await import('child_process');
    execFileSync(reasonixPath, ['--version'], { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
