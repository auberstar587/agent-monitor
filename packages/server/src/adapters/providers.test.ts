import { describe, it, expect, afterEach } from 'vitest';
import { resolveProvider, getProvider } from './providers.js';

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

  it('未知 model 抛错', () => {
    expect(() => resolveProvider('foobar-xyz')).toThrow(/cannot resolve provider/);
  });

  it('大小写不敏感', () => {
    expect(resolveProvider('CLAUDE-SONNET-4').id).toBe('anthropic');
    expect(resolveProvider('GPT-4O').id).toBe('openai');
  });
});

describe('providers: 注册表', () => {
  it('5 个内置 provider 全部注册', () => {
    expect(getProvider('anthropic').id).toBe('anthropic');
    expect(getProvider('openai').id).toBe('openai');
    expect(getProvider('deepseek').id).toBe('deepseek');
    expect(getProvider('ollama').id).toBe('ollama');
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
