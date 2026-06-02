import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';

/**
 * 集成测试：mock child_process.spawn，让 claude CLI 输出可控的 stream-json
 * 验证 RunMetricsCollector 真实从 CLI result 事件中提取 5 指标 + cost
 */

class MockChild extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  killed = false;
  signal: string | null = null;

  constructor() {
    super();
    this.stdout = new Readable({ read() {} });
    this.stderr = new Readable({ read() {} });
  }

  kill(sig: string) {
    this.killed = true;
    this.signal = sig;
    this.emit('close', null, sig);
    return true;
  }
}

let mockChild: MockChild;

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    mockChild = new MockChild();
    return mockChild;
  }),
}));

import { createClaudeCodeAdapter } from './claude-code.js';

const STREAM_EVENTS = [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 'test-session', model: 'sonnet' }),
  JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: '你好，主人喵～' }] },
  }),
  JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/tmp/test.txt' } }],
    },
  }),
  JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: ' 文件已读取。' }] },
  }),
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 18000,
    duration_api_ms: 9500,
    ttft_ms: 1200,
    num_turns: 1,
    result: '你好，主人喵～ 文件已读取。',
    total_cost_usd: 0.175,
    usage: { input_tokens: 35000, output_tokens: 50 },
  }),
];

function feedAndClose(events: string[], exitCode: number | null = 0) {
  for (const e of events) {
    mockChild.stdout.push(e + '\n');
  }
  mockChild.stdout.push(null);
  setImmediate(() => mockChild.emit('close', exitCode, null));
}

describe('ClaudeCodeAdapter 真实 spawn 集成', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('解析 stream-json 提取 text / tool_use + 5 指标', async () => {
    const adapter = await createClaudeCodeAdapter();
    const it = adapter.run('hello');
    const runId = it.runId;

    setImmediate(() => feedAndClose(STREAM_EVENTS));

    const messages: any[] = [];
    for await (const msg of it) {
      messages.push(msg);
    }

    const textMsgs = messages.filter(m => m.type === 'text');
    const toolUseMsgs = messages.filter(m => m.type === 'tool_use');

    expect(textMsgs.some(m => m.content?.includes('你好'))).toBe(true);
    expect(toolUseMsgs.length).toBe(1);
    expect(toolUseMsgs[0].tool).toBe('Read');
    expect(toolUseMsgs[0].input?.file_path).toBe('/tmp/test.txt');

    const usage = await adapter.cost(runId);
    expect(usage).not.toBeNull();
    expect(usage!.ttftMs).toBe(1200);
    expect(usage!.inputTokens).toBe(35000);
    expect(usage!.outputTokens).toBe(50);
    expect(usage!.agentSteps).toBe(1);
    expect(usage!.toolLatencyMs).toBe(9500);
    expect(usage!.costCents).toBe(18);
    expect(usage!.model).toBe('claude-sonnet-4-5');
  });

  it('子进程 exit code 非零时 yield error 消息', async () => {
    const adapter = await createClaudeCodeAdapter();
    const it = adapter.run('test');

    setImmediate(() => feedAndClose(STREAM_EVENTS, 1));

    const messages: any[] = [];
    for await (const m of it) {
      messages.push(m);
    }

    const errorMsgs = messages.filter(m => m.type === 'error');
    expect(errorMsgs.length).toBeGreaterThan(0);
    expect(errorMsgs[0].content).toMatch(/exited with code 1/);
  });

  it('cancel() 不存在的 runId 不报错', async () => {
    const adapter = await createClaudeCodeAdapter();
    await expect(adapter.cancel('not_exist')).resolves.not.toThrow();
  });

  it('stream 中非 JSON 行被静默忽略', async () => {
    const adapter = await createClaudeCodeAdapter();
    const it = adapter.run('test');

    const events = [
      'not a json line\n',
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 100,
        duration_api_ms: 80,
        ttft_ms: 50,
        num_turns: 1,
        result: 'OK',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    ];

    setImmediate(() => {
      for (const e of events) mockChild.stdout.push(e);
      mockChild.stdout.push(null);
      setImmediate(() => mockChild.emit('close', 0, null));
    });

    for await (const _ of it) { /* consume */ }

    const usage = await adapter.cost(it.runId);
    expect(usage!.ttftMs).toBe(50);
    expect(usage!.inputTokens).toBe(10);
  });

  it('system/hook 事件 yield 为 system 而非 text', async () => {
    const adapter = await createClaudeCodeAdapter();
    const it = adapter.run('test');

    const events = [
      JSON.stringify({ type: 'system', subtype: 'hook_started', hook_id: 'h1' }),
      JSON.stringify({ type: 'system', subtype: 'hook_response', hook_id: 'h1', output: 'hook output' }),
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: '真实内容' }] },
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '真实内容',
        ttft_ms: 100,
        duration_api_ms: 200,
        num_turns: 1,
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
    ];

    setImmediate(() => {
      for (const e of events) mockChild.stdout.push(e + '\n');
      mockChild.stdout.push(null);
      setImmediate(() => mockChild.emit('close', 0, null));
    });

    const messages: any[] = [];
    for await (const m of it) {
      messages.push(m);
    }

    const textMsgs = messages.filter(m => m.type === 'text');
    const systemMsgs = messages.filter(m => m.type === 'system');
    // text: only from assistant events (result no longer yields text to avoid duplication)
    expect(textMsgs.length).toBe(1);
    // system: hook_started + hook_response + spawn-init = 3
    expect(systemMsgs.length).toBeGreaterThanOrEqual(2);
  });
});
