import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startMetrics,
  getMetrics,
  clearMetrics,
  type RunMetricsHandle,
} from './engine.js';

describe('RunMetricsCollector', () => {
  let runId: string;
  let m: RunMetricsHandle;

  beforeEach(() => {
    runId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    m = startMetrics(runId, { model: 'test-model' });
  });

  afterEach(() => {
    clearMetrics(runId);
  });

  it('初值: 0 tokens, 0 steps, no TTFT', () => {
    const s = m.snapshot();
    expect(s.inputTokens).toBe(0);
    expect(s.outputTokens).toBe(0);
    expect(s.ttftMs).toBeUndefined();
    expect(s.outputTps).toBeUndefined();
    expect(s.toolLatencyMs).toBe(0);
    expect(s.agentSteps).toBe(0);
    expect(s.model).toBe('test-model');
  });

  it('recordFirstToken 只记一次', async () => {
    await new Promise(r => setTimeout(r, 10));
    m.recordFirstToken();
    const first = m.snapshot().ttftMs!;
    expect(first).toBeGreaterThanOrEqual(10);

    await new Promise(r => setTimeout(r, 10));
    m.recordFirstToken(); // 第二次应无效
    expect(m.snapshot().ttftMs).toBe(first);
  });

  it('recordOutputTokens 累加', () => {
    m.recordOutputTokens(50);
    m.recordOutputTokens(30);
    expect(m.snapshot().outputTokens).toBe(80);
  });

  it('recordStep 累加', () => {
    m.recordStep();
    m.recordStep();
    m.recordStep();
    expect(m.snapshot().agentSteps).toBe(3);
  });

  it('recordToolLatency 取最大值', () => {
    m.recordToolLatency(100);
    m.recordToolLatency(50);
    m.recordToolLatency(200);
    expect(m.snapshot().toolLatencyMs).toBe(200);
  });

  it('finish 后 outputTps / estimatedModelTps 计算正确', async () => {
    m.recordFirstToken();
    m.recordOutputTokens(100);
    await new Promise(r => setTimeout(r, 100)); // 100ms 输出阶段
    m.finish();

    const s = m.snapshot();
    expect(s.outputTps).toBeGreaterThan(0);
    // 100 token 在 100ms 左右输出，TPS 大约 1000（受 setTimeout 精度影响允许 ±30%）
    expect(s.outputTps!).toBeGreaterThan(700);
    expect(s.outputTps!).toBeLessThan(1300);
    // estimatedModelTps = outputTps * 1.05
    expect(s.estimatedModelTps!).toBeCloseTo(s.outputTps! * 1.05, 5);
  });

  it('finish 幂等（多次调用只生效一次）', () => {
    m.recordOutputTokens(10);
    m.finish();
    const first = m.snapshot();
    m.finish();
    const second = m.snapshot();
    expect(first.outputTps).toBe(second.outputTps);
  });

  it('setInputTokens 正确', () => {
    m.setInputTokens(1234);
    expect(m.snapshot().inputTokens).toBe(1234);
  });

  it('getMetrics 返回注册过的 handle', () => {
    const fetched = getMetrics(runId);
    expect(fetched).toBe(m);
  });

  it('getMetrics 找不到时返回 null', () => {
    expect(getMetrics('not_exist')).toBeNull();
  });

  it('clearMetrics 移除后 getMetrics 返回 null', () => {
    clearMetrics(runId);
    expect(getMetrics(runId)).toBeNull();
  });

  it('finish 之前 outputTps 为 undefined', () => {
    m.recordOutputTokens(100);
    expect(m.snapshot().outputTps).toBeUndefined();
  });
});

describe('EngineUsage snapshot 完整性', () => {
  it('snapshot 返回新对象（不共享引用）', () => {
    const runId = `test_snap_${Date.now()}`;
    const m = startMetrics(runId);
    const s1 = m.snapshot();
    m.recordOutputTokens(50);
    const s2 = m.snapshot();
    expect(s1.outputTokens).toBe(0);
    expect(s2.outputTokens).toBe(50);
    expect(s1).not.toBe(s2);
    clearMetrics(runId);
  });
});
