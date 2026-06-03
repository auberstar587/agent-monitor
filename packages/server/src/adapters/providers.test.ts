import { describe, it, expect, afterEach } from 'vitest';
import { resolveProvider, getProvider, fetchWithTimeout } from './providers.js';

describe('providers: resolveProvider', () => {
  it('claude-* → anthropic', () => {
    expect(resolveProvider('claude-sonnet-4').id).toBe('anthropic');
    expect(resolveProvider('claude-opus-4').id).toBe('anthropic');
  });

  it('gpt-* / o1-* / o3-* / o4-* → openai', () => {
    expect(resolveProvider('gpt-4o').id).toBe('openai');
    expect(resolveProvider('gpt-4o-mini').id).toBe('openai');
    expect(resolveProvider('o1').id).toBe('openai');
    expect(resolveProvider('o3-mini').id).toBe('openai');
    expect(resolveProvider('o4-preview').id).toBe('openai');
  });

  it('deepseek-* → deepseek', () => {
    expect(resolveProvider('deepseek-chat').id).toBe('deepseek');
    expect(resolveProvider('deepseek-reasoner').id).toBe('deepseek');
  });

  it('ollama: / llama / qwen / mistral → ollama', () => {
    expect(resolveProvider('ollama:qwen2.5:7b').id).toBe('ollama');
    expect(resolveProvider('llama3.1').id).toBe('ollama');
    expect(resolveProvider('qwen2.5').id).toBe('ollama');
    expect(resolveProvider('mistral-7b').id).toBe('ollama');
  });

  it('gemini-* → gemini', () => {
    expect(resolveProvider('gemini-2.0-flash').id).toBe('gemini');
    expect(resolveProvider('gemini-2.5-pro').id).toBe('gemini');
  });

  it('qwen-* → qwen（带连字符走阿里云 API）', () => {
    expect(resolveProvider('qwen-plus').id).toBe('qwen');
    expect(resolveProvider('qwen-max').id).toBe('qwen');
    expect(resolveProvider('qwen-turbo').id).toBe('qwen');
  });

  it('moonshot-* → moonshot', () => {
    expect(resolveProvider('moonshot-v1-8k').id).toBe('moonshot');
    expect(resolveProvider('moonshot-v1-32k').id).toBe('moonshot');
  });

  it('未知 model 抛错', () => {
    expect(() => resolveProvider('foobar-xyz')).toThrow(/cannot resolve provider/);
  });

  it('大小写不敏感', () => {
    expect(resolveProvider('CLAUDE-SONNET-4').id).toBe('anthropic');
    expect(resolveProvider('GPT-4O').id).toBe('openai');
  });
});

describe('providers: 注册表', () => {
  it('9 个内置 provider 全部注册', () => {
    expect(getProvider('anthropic').id).toBe('anthropic');
    expect(getProvider('openai').id).toBe('openai');
    expect(getProvider('deepseek').id).toBe('deepseek');
    expect(getProvider('ollama').id).toBe('ollama');
    expect(getProvider('gemini').id).toBe('gemini');
    expect(getProvider('qwen').id).toBe('qwen');
    expect(getProvider('moonshot').id).toBe('moonshot');
    expect(getProvider('custom-openai').id).toBe('custom-openai');
    expect(getProvider('mock').id).toBe('mock');
  });

  it('未注册的 provider 抛错', () => {
    // @ts-expect-error 测试错误调用
    expect(() => getProvider('not-exist')).toThrow(/provider not registered/);
  });
});

describe('providers: cost 估算（不调 API）', () => {
  it('anthropic claude-sonnet-4 估算 cost', () => {
    const p = getProvider('anthropic');
    const cents = p.cost('claude-sonnet-4', 1000, 500);
    expect(cents).toBeGreaterThan(0);
    // 1000 input * 0.003 + 500 output * 0.015 = 3 + 7.5 = 10.5 cents
    expect(cents).toBeCloseTo(10.5, 1);
  });

  it('openai gpt-4o-mini 不命中 gpt-4o 价（长前缀优先）', () => {
    const p = getProvider('openai');
    const cents = p.cost('gpt-4o-mini', 1000, 1000);
    // 1k * 0.0015 + 1k * 0.006 = 0.15 + 0.6 = 0.75 cents（mini 价）
    // 不是 1k * 0.025 + 1k * 0.1 = 12.5 cents（gpt-4o 价，16x 偏差）
    expect(cents).toBeCloseTo(0.75, 2);
  });

  it('openai gpt-4o 价格正确（确认 prefix 排序没改坏）', () => {
    const p = getProvider('openai');
    const cents = p.cost('gpt-4o', 1000, 1000);
    expect(cents).toBeCloseTo(12.5, 1);
  });

  it('cost() 大小写不敏感（与 resolveProvider 一致）', () => {
    const p = getProvider('anthropic');
    const upper = p.cost('CLAUDE-OPUS-4', 1000, 1000);
    const lower = p.cost('claude-opus-4', 1000, 1000);
    expect(upper).toBe(lower);
    expect(upper).toBeCloseTo(90, 0); // 1k * 15 + 1k * 75
  });

  it('未知 model 返回 0 + warn（P1-7 修回退掩盖）', () => {
    const p = getProvider('openai');
    const cents = p.cost('gpt-99-future-model', 100000, 100000);
    expect(cents).toBe(0);
  });

  it('deepseek-chat 估算 cost（DeepSeek API 价）', () => {
    const p = getProvider('deepseek');
    const cents = p.cost('deepseek-chat', 1000, 1000);
    // 1k * 0.00014 + 1k * 0.00028 = 0.14 + 0.28 = 0.42 cents
    expect(cents).toBeCloseTo(0.42, 2);
  });

  it('ollama 本地模型 cost=0', () => {
    const p = getProvider('ollama');
    expect(p.cost('qwen2.5', 100000, 50000)).toBe(0);
  });

  it('mock cost=0', () => {
    const p = getProvider('mock');
    expect(p.cost('anything', 100, 100)).toBe(0);
  });

  it('gemini-2.0-flash 估算 cost', () => {
    const p = getProvider('gemini');
    const cents = p.cost('gemini-2.0-flash', 1000, 1000);
    // 1k * 0.075/1000 + 1k * 0.30/1000 = 0.075 + 0.30 = 0.375 cents
    expect(cents).toBeCloseTo(0.375, 3);
  });

  it('qwen-plus 估算 cost', () => {
    const p = getProvider('qwen');
    const cents = p.cost('qwen-plus', 1000, 1000);
    // 1k * 0.80/1000 + 1k * 2.40/1000 = 0.80 + 2.40 = 3.2 cents
    expect(cents).toBeCloseTo(3.2, 1);
  });

  it('moonshot-v1-8k 估算 cost', () => {
    const p = getProvider('moonshot');
    const cents = p.cost('moonshot-v1-8k', 1000, 1000);
    // 1k * 1.0/1000 + 1k * 1.0/1000 = 1.0 + 1.0 = 2.0 cents
    expect(cents).toBeCloseTo(2.0, 1);
  });

  it('custom-openai 无定价返回 0', () => {
    const p = getProvider('custom-openai');
    expect(p.cost('gpt-4o', 1000, 1000)).toBe(0);
  });
});

describe('providers: mock chat 流', () => {
  it('mock.chat 返回 [mock] 文本并 done', async () => {
    const p = getProvider('mock');
    const chunks: string[] = [];
    for await (const c of p.chat({ model: 'mock', messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(c.delta);
      if (c.done) break;
    }
    expect(chunks.join('')).toBe('[mock]');
  });
});

describe('providers: 缺 API key 抛错（不静默走 mock）', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('openai 缺 OPENAI_API_KEY 抛错', () => {
    delete process.env.OPENAI_API_KEY;
    const p = getProvider('openai');
    expect(() => p.chat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] })).toThrow(/OPENAI_API_KEY/);
  });

  it('deepseek 缺 DEEPSEEK_API_KEY 抛错', () => {
    delete process.env.DEEPSEEK_API_KEY;
    const p = getProvider('deepseek');
    expect(() => p.chat({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] })).toThrow(/DEEPSEEK_API_KEY/);
  });

  it('anthropic 缺 ANTHROPIC_API_KEY 抛错（async generator 首次 next 抛）', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const p = getProvider('anthropic');
    const it = p.chat({ model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] })[Symbol.asyncIterator]();
    await expect(it.next()).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('ollama 不需要 key（走默认 endpoint）', () => {
    // ollama 即使没 env 也不应抛 key 错
    const p = getProvider('ollama');
    expect(p.id).toBe('ollama');
  });
});

describe('providers: P0-4 fetch 超时', () => {
  // 起一个永不响应的 HTTP server，验证 fetchWithTimeout 在指定 timeoutMs 内抛 AbortError
  it('永不响应的 server 在 timeoutMs 内抛 AbortError', async () => {
    const http = await import('node:http');
    const server = http.createServer(() => {
      // 故意不调用 res.end()，模拟半开连接
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/`;
    try {
      const start = Date.now();
      await expect(
        fetchWithTimeout(url, { method: 'GET' }, 500),
      ).rejects.toThrow();
      const elapsed = Date.now() - start;
      // 500ms timeout + 一些调度开销，断言在 1500ms 内 abort
      expect(elapsed).toBeLessThan(1500);
    } finally {
      server.close();
    }
  });

  it('正常响应的 server 在 timeoutMs 内返回', async () => {
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const resp = await fetchWithTimeout(
        `http://127.0.0.1:${port}/`,
        { method: 'GET' },
        2000,
      );
      expect(resp.status).toBe(200);
    } finally {
      server.close();
    }
  });
});
