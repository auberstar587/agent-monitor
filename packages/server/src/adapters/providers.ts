// providers.ts — 多模型 Provider 路由抽象（Phase 6 收口）
//
// 定位：与 EngineAdapter 平行。EngineAdapter 描述"AI 引擎"（Claude Code / Codex / multica），
// Provider 描述"模型服务方"（Anthropic / OpenAI / DeepSeek / Ollama）。
// 适配器可同时使用 EngineAdapter 跑 prompt + Provider 解析 model 名 / 计算 cost。
//
// 设计原则（KISS）：
// - 不引入任何 SDK，全部用 fetch 包装
// - 接口最小：chat() 流式 + cost() 估算
// - 解析 model 名的 prefix（claude-* / gpt-* / deepseek-* / ollama:*）路由到对应 provider
// - 缺 API key 时抛明确错误（不静默走 mock）
//
// 借鉴：WeSight libs/agentEngine/providers/ 设计思想

export type ProviderId = 'anthropic' | 'openai' | 'deepseek' | 'ollama' | 'mock';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatChunk {
  /** 增量文本（delta）；空字符串表示首包/心跳 */
  delta: string;
  /** 是否流结束 */
  done: boolean;
  /** 终态携带的用量（仅 done=true 时有值） */
  usage?: { inputTokens: number; outputTokens: number };
}

export interface Provider {
  readonly id: ProviderId;
  /** chat 一次，返回异步流（AsyncIterable<ChatChunk>） */
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  /** 估算 cost（USD cents） */
  cost(model: string, inputTokens: number, outputTokens: number): number;
}

// ---------------------------------------------------------------------
// 注册表
// ---------------------------------------------------------------------

const _providerRegistry = new Map<ProviderId, () => Provider>();

export function registerProvider(id: ProviderId, factory: () => Provider): void {
  _providerRegistry.set(id, factory);
}

export function getProvider(id: ProviderId): Provider {
  const f = _providerRegistry.get(id);
  if (!f) throw new Error(`[providers] provider not registered: ${id}`);
  return f();
}

// ---------------------------------------------------------------------
// 公共 cost 表查找：按 key 长度降序匹配 + lowercase model 名
// 返回 null 表示未命中（让调用方决定 fallback 策略）
// ---------------------------------------------------------------------
function costFromTable(
  table: Record<string, { in: number; out: number }>,
  model: string,
): { in: number; out: number } | null {
  const m = model.toLowerCase();
  // 按 key 长度降序，避免 'gpt-4o-mini'.startsWith('gpt-4o') 误命中
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (m.startsWith(k.toLowerCase())) {
      return table[k];
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// 解析 model 名前缀 → 路由到 provider
// 规则：
//   claude-*  → anthropic
//   gpt-* / o1-* / o3-* / o4-*  → openai
//   deepseek-*  → deepseek
//   ollama:* 或 llama* / qwen* / mistral*（无前缀） → ollama
//   其余 → 抛错
// ---------------------------------------------------------------------

export function resolveProvider(model: string): Provider {
  const m = model.toLowerCase();
  if (m.startsWith('claude-')) return getProvider('anthropic');
  if (
    m.startsWith('gpt-') ||
    /^o[1-9](-|$)/.test(m) ||  // o1, o1-mini, o3-mini, o4-preview
    m === 'o1' || m === 'o3' || m === 'o4'
  ) {
    return getProvider('openai');
  }
  if (m.startsWith('deepseek-')) return getProvider('deepseek');
  if (m.startsWith('ollama:') || m.includes('llama') || m.includes('qwen') || m.includes('mistral')) {
    return getProvider('ollama');
  }
  throw new Error(`[providers] cannot resolve provider for model: ${model}`);
}

// ---------------------------------------------------------------------
// 公共：OpenAI 兼容 chat completion 调用（用 fetch 流式）
// Anthropic / DeepSeek / Ollama 走 OpenAI 兼容 endpoint 减少协议数
//   - Ollama 原生支持 /v1/chat/completions
//   - DeepSeek API 兼容 OpenAI（https://api.deepseek.com/v1/chat/completions）
//   - Anthropic 不走 OpenAI 兼容（messages 格式不同），单独实现
// ---------------------------------------------------------------------

interface OpenAICompatChunk {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

// ---------------------------------------------------------------------
// fetch with AbortController 超时（默认 60s）
// 防上游半开连接（建连后无响应）耗光 worker 并发槽位
// ---------------------------------------------------------------------
const DEFAULT_FETCH_TIMEOUT_MS = 60_000;

export function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function* openaiCompatStream(
  endpoint: string,
  apiKey: string,
  req: ChatRequest,
  headers: Record<string, string> = {},
): AsyncIterable<ChatChunk> {
  const body = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 1.0,
    max_tokens: req.maxTokens ?? 4096,
    stream: true,
    stream_options: { include_usage: true },
  };
  const resp = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    throw new Error(`[providers] ${req.model} HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') {
        return;
      }
      try {
        const json = JSON.parse(payload) as OpenAICompatChunk;
        const delta = json.choices?.[0]?.delta?.content ?? '';
        const usage = json.usage
          ? {
              inputTokens: json.usage.prompt_tokens ?? 0,
              outputTokens: json.usage.completion_tokens ?? 0,
            }
          : undefined;
        yield { delta, done: false, usage };
        if (usage) yield { delta: '', done: true, usage };
      } catch {
        // 忽略解析错误（心跳/SSE 注释）
      }
    }
  }
}

// ---------------------------------------------------------------------
// 4 个 Provider 实现
// ---------------------------------------------------------------------

function makeAnthropic(): Provider {
  return {
    id: 'anthropic',
    async *chat(req) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('[providers] ANTHROPIC_API_KEY not set');
      // Anthropic 原生 messages 格式
      const system = req.messages.find((m) => m.role === 'system')?.content;
      const msgs = req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }));
      const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: req.model,
          system,
          messages: msgs,
          max_tokens: req.maxTokens ?? 4096,
          stream: true,
        }),
      });
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        throw new Error(`[providers] anthropic ${req.model} HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let inputTokens = 0;
      let outputTokens = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload) continue;
          try {
            const ev = JSON.parse(payload) as {
              type: string;
              delta?: { type: string; text?: string };
              message?: { usage?: { input_tokens: number; output_tokens: number } };
            };
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              yield { delta: ev.delta.text ?? '', done: false };
            } else if (ev.type === 'message_start' && ev.message?.usage) {
              inputTokens = ev.message.usage.input_tokens ?? 0;
            } else if (ev.type === 'message_delta') {
              const u = (ev as unknown as { usage?: { output_tokens: number } }).usage;
              if (u?.output_tokens !== undefined) outputTokens = u.output_tokens;
            } else if (ev.type === 'message_stop') {
              yield { delta: '', done: true, usage: { inputTokens, outputTokens } };
              return;
            }
          } catch {
            // 忽略
          }
        }
      }
    },
    cost(model, inputTokens, outputTokens) {
      // 2026-06 简表（USD cents per 1k tokens）
      // keys 显式按长前缀在前（防御性）：gpt-4o-mini 已在 gpt-4o 之前；这里 anthropic 无嵌套但保留习惯
      const table: Record<string, { in: number; out: number }> = {
        'claude-opus-4': { in: 15, out: 75 },
        'claude-sonnet-4': { in: 3, out: 15 },
        'claude-haiku-4': { in: 0.8, out: 4 },
      };
      const m = costFromTable(table, model);
      if (!m) {
        console.warn(`[providers] anthropic cost(): unknown model "${model}"，返回 0 避免账单污染`);
        return 0;
      }
      return (inputTokens / 1000) * m.in + (outputTokens / 1000) * m.out;
    },
  };
}

function makeOpenAI(): Provider {
  return {
    id: 'openai',
    chat(req) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('[providers] OPENAI_API_KEY not set');
      return openaiCompatStream('https://api.openai.com/v1/chat/completions', apiKey, req);
    },
    cost(model, inputTokens, outputTokens) {
      // 长前缀在前是 hard requirement：gpt-4o-mini 必须在 gpt-4o 之前
      const table: Record<string, { in: number; out: number }> = {
        'gpt-4o-mini': { in: 0.15, out: 0.6 },
        'o3-mini': { in: 1.1, out: 4.4 },
        'gpt-4o': { in: 2.5, out: 10 },
        'o1': { in: 15, out: 60 },
      };
      const m = costFromTable(table, model);
      if (!m) {
        console.warn(`[providers] openai cost(): unknown model "${model}"，返回 0 避免账单污染`);
        return 0;
      }
      return (inputTokens / 1000) * m.in + (outputTokens / 1000) * m.out;
    },
  };
}

function makeDeepSeek(): Provider {
  return {
    id: 'deepseek',
    chat(req) {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error('[providers] DEEPSEEK_API_KEY not set');
      return openaiCompatStream('https://api.deepseek.com/v1/chat/completions', apiKey, req);
    },
    cost(model, inputTokens, outputTokens) {
      const table: Record<string, { in: number; out: number }> = {
        'deepseek-reasoner': { in: 0.55, out: 2.19 },
        'deepseek-chat': { in: 0.14, out: 0.28 },
      };
      const m = costFromTable(table, model);
      if (!m) {
        console.warn(`[providers] deepseek cost(): unknown model "${model}"，返回 0 避免账单污染`);
        return 0;
      }
      return (inputTokens / 1000) * m.in + (outputTokens / 1000) * m.out;
    },
  };
}

function makeOllama(): Provider {
  return {
    id: 'ollama',
    chat(req) {
      // Ollama 本地默认无 key；endpoint 可通过 env 改
      const endpoint = process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434/v1/chat/completions';
      // 模型名支持 ollama: 前缀（如 ollama:qwen2.5:7b）— 剥掉前缀
      const model = req.model.replace(/^ollama:/, '');
      return openaiCompatStream(endpoint, 'ollama', { ...req, model });
    },
    cost() {
      // 本地模型 cost = 0（电费不计）
      return 0;
    },
  };
}

function makeMock(): Provider {
  // 给单测用：永远不调真实 API
  return {
    id: 'mock',
    async *chat() {
      yield { delta: '[mock]', done: true, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    cost() {
      return 0;
    },
  };
}

// 启动时注册 5 个 provider
registerProvider('anthropic', makeAnthropic);
registerProvider('openai', makeOpenAI);
registerProvider('deepseek', makeDeepSeek);
registerProvider('ollama', makeOllama);
registerProvider('mock', makeMock);
