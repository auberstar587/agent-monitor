// EngineAdapter — 引擎级适配器协议（参考 WeSight libs/agentEngine/ 抽象）
//
// 定位：描述一个"能执行 Prompt 并返回消息流"的 AI 引擎。
// 与 AgentPlatformAdapter 的关系：
//   - EngineAdapter = 最小可运行协议（5 方法）
//   - AgentPlatformAdapter = 平台级协议（任务/项目/Agent 管理）
//   - multica.ts 同时实现两者（平台内置引擎）
//   - claude-code.ts / codex.ts 仅实现 EngineAdapter

export interface EngineMessage {
  seq: number;
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'system';
  tool?: string;
  content?: string;
  input?: Record<string, unknown>;
  output?: string;
}

export interface EngineUsage {
  inputTokens: number;
  outputTokens: number;
  ttftMs?: number;         // Time to first token (ms)
  outputTps?: number;       // Output tokens per second
  estimatedModelTps?: number;
  toolLatencyMs?: number;   // Max tool execution latency
  agentSteps?: number;
  costCents?: number;
  model?: string;
}

export interface EngineAdapter {
  readonly id: string;           // 'claude-code' | 'codex' | 'multica' | ...
  readonly label: string;         // 显示名
  readonly installed: boolean;     // 本地是否可用

  // 1. 检测本地是否安装/可用
  detectInstalled(): Promise<boolean>;

  // 2. 执行 Prompt，返回消息流（AsyncIterable）
  //    opts 可包含：projectId / workingDir / model / temperature 等
  run(
    prompt: string,
    opts?: Record<string, unknown>,
  ): AsyncIterable<EngineMessage> & { runId: string };

  // 3. 审批（Approve）一个权限请求
  approve(requestId: string): Promise<boolean>;

  // 4. 取消正在运行的任务
  cancel(runId: string): Promise<void>;

  // 5. 获取最近一次运行的用量
  cost(runId: string): Promise<EngineUsage | null>;

  // 6. (可选) 当前正在运行的进程数 — 用于 Presence 推导
  //    维护 _runningChildren 的适配器（claude-code / reasonix）可实现
  activeRunCount?(): number;
}

// --- 注册表（独立于 AgentPlatformAdapter 注册表）---

const _engineRegistry = new Map<string, () => Promise<EngineAdapter>>();

export function registerEngine(
  name: string,
  factory: () => Promise<EngineAdapter>,
): void {
  _engineRegistry.set(name, factory);
}

export function getRegisteredEngines(): string[] {
  return Array.from(_engineRegistry.keys());
}

export async function getEngine(name: string): Promise<EngineAdapter | null> {
  const factory = _engineRegistry.get(name);
  if (!factory) return null;
  return factory();
}

// =====================================================================
//  RunMetricsCollector — 5 指标采集器（P1: 借鉴 WeSight runtime_calls）
// =====================================================================
//
// 用法（适配器内部）：
//   const metrics = startMetrics(runId, { model: 'claude-opus-4' });
//   metrics.recordFirstToken();        // TTFT
//   metrics.recordOutputTokens(n);     // 累加输出 token
//   metrics.recordStep();              // agent 步数
//   metrics.recordToolLatency(ms);     // 工具延迟
//   metrics.setInputTokens(n);         // 输入 token
//   metrics.finish();                  // 计算 outputTps / estimatedModelTps
//   // cost(runId) 时：
//   const usage = metrics.snapshot();

export interface RunMetricsOptions {
  model?: string;
  /** 引擎 ID（持久化时使用，例 'claude-code'） */
  engineId?: string;
  /** 是否在 finish() 时持久化到 runtime_calls 表（默认 false 保持向后兼容） */
  persist?: boolean;
}

export interface RunMetricsHandle {
  readonly runId: string;
  recordFirstToken(): void;
  recordOutputTokens(n: number): void;
  recordStep(): void;
  recordToolLatency(ms: number): void;
  setInputTokens(n: number): void;
  /** 用 CLI 报告的精确值覆盖 TTFT（适配器用） */
  overrideTtft(ms: number): void;
  /** 用 CLI 报告的精确值覆盖 agentSteps（适配器用） */
  overrideSteps(n: number): void;
  /** 用 CLI 报告的精确值覆盖 toolLatencyMs（适配器用） */
  overrideToolLatency(ms: number): void;
  /** 设置 costCents（适配器用） */
  overrideCost(cents: number): void;
  finish(): void;
  snapshot(): EngineUsage;
}

const _metricsStore = new Map<string, RunMetricsHandle>();

export function startMetrics(
  runId: string,
  opts: RunMetricsOptions = {},
): RunMetricsHandle {
  const start = Date.now();
  const state: EngineUsage = {
    inputTokens: 0,
    outputTokens: 0,
    ttftMs: undefined,
    outputTps: undefined,
    estimatedModelTps: undefined,
    toolLatencyMs: 0,
    agentSteps: 0,
    costCents: undefined,
    model: opts.model,
  };
  let firstTokenAt: number | null = null;
  let finished = false;

  const handle: RunMetricsHandle = {
    runId,
    recordFirstToken() {
      if (firstTokenAt === null) {
        firstTokenAt = Date.now();
        // 如果 overrideTtft 已经设过精确值（如 CLI 报告的 ttft_ms），不要覆盖
        if (state.ttftMs === undefined) {
          state.ttftMs = firstTokenAt - start;
        }
      }
    },
    recordOutputTokens(n: number) {
      state.outputTokens += n;
    },
    recordStep() {
      state.agentSteps = (state.agentSteps ?? 0) + 1;
    },
    recordToolLatency(ms: number) {
      if (ms > (state.toolLatencyMs ?? 0)) {
        state.toolLatencyMs = ms;
      }
    },
    setInputTokens(n: number) {
      state.inputTokens = n;
    },
    overrideTtft(ms: number) {
      if (ms >= 0) state.ttftMs = ms;
    },
    overrideSteps(n: number) {
      if (n >= 0) state.agentSteps = n;
    },
    overrideToolLatency(ms: number) {
      if (ms >= 0) state.toolLatencyMs = ms;
    },
    overrideCost(cents: number) {
      if (cents >= 0) state.costCents = cents;
    },
    finish() {
      if (finished) return;
      finished = true;
      const elapsedMs = Date.now() - start;
      const outputPhaseMs =
        firstTokenAt !== null ? elapsedMs - (firstTokenAt - start) : elapsedMs;
      if (outputPhaseMs > 0 && state.outputTokens > 0) {
        state.outputTps = (state.outputTokens / outputPhaseMs) * 1000;
        state.estimatedModelTps = state.outputTps * 1.05;
      }
      // 持久化（fire-and-forget，错误不抛给调用方）
      if (opts.persist) {
        void persistRunMetrics(runId, opts.engineId ?? 'unknown', start, elapsedMs, state);
      }
    },
    snapshot() {
      return { ...state };
    },
  };

  _metricsStore.set(runId, handle);
  setTimeout(() => _metricsStore.delete(runId), 5 * 60 * 1000).unref?.();
  return handle;
}

export function getMetrics(runId: string): RunMetricsHandle | null {
  return _metricsStore.get(runId) ?? null;
}

export function clearMetrics(runId: string): void {
  _metricsStore.delete(runId);
}

// ---------------------------------------------------------------------
// 持久化：fire-and-forget 写 runtime_calls 表
// 用动态 import 避免 adapter 层强耦合 db 模块（保持纯协议层可独立测试）
// ---------------------------------------------------------------------
async function persistRunMetrics(
  runId: string,
  engineId: string,
  startedAtMs: number,
  durationMs: number,
  state: EngineUsage,
): Promise<void> {
  try {
    const { query } = await import("../db/client.js");
    const { resolveProvider } = await import("./providers.js");
    // P0-2 兜底：未知 model 不让整行丢失。provider 字段写 null，row 仍入库
    // 运维可监控 "WHERE provider IS NULL" 发现未识别的 model
    let provider: { id: string } | null = null;
    if (state.model) {
      try {
        provider = resolveProvider(state.model);
      } catch {
        console.warn(
          `[engine] persistRunMetrics: unknown model "${state.model}" for runId=${runId}, provider column will be NULL`,
        );
      }
    }
    await query(
      `INSERT INTO runtime_calls
        (run_id, engine_id, model, provider, ttft_ms, output_tps, est_model_tps,
         tool_latency_ms, agent_steps, input_tokens, output_tokens, cost_cents,
         started_at, finished_at, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, to_timestamp($13/1000.0), to_timestamp($14/1000.0), $15)
       ON CONFLICT (run_id) DO NOTHING`,
      [
        runId,
        engineId,
        state.model ?? null,
        provider?.id ?? null,
        state.ttftMs ?? null,
        state.outputTps ?? null,
        state.estimatedModelTps ?? null,
        state.toolLatencyMs ?? null,
        state.agentSteps ?? null,
        state.inputTokens,
        state.outputTokens,
        state.costCents ?? null,
        startedAtMs,
        startedAtMs + durationMs,
        durationMs,
      ],
    );
  } catch (err) {
    // 持久化失败不影响主流程
    console.error(`[engine] persistRunMetrics failed for runId=${runId}:`, (err as Error).message);
  }
}
