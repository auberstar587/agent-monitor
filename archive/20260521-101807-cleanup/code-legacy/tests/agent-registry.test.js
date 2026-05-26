import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AgentRegistry } from '../../src/services/agent-registry.js';

describe('AgentRegistry', () => {
  test('默认初始化 5 个 Agent', async () => {
    const registry = new AgentRegistry();
    await registry.start({
      gatewayUrl: 'http://localhost:18789',
      configPath: './agents.json',
    });
    
    const states = registry.getAllStates();
    assert.ok(states.length >= 5, `期望至少5个Agent, 实际${states.length}`);
    
    registry.stop();
  });

  test('心跳超时检测', async () => {
    const registry = new AgentRegistry({
      heartbeatTimeout: 1000,
      checkInterval: 500,
    });
    
    await registry.start();
    
    registry.updateState('test-agent', { name: 'Test', status: 'working' });
    
    // 等待超时
    await new Promise(r => setTimeout(r, 1600));
    
    const state = registry.getState('test-agent');
    assert.strictEqual(state.status, 'away', '超时后应标记为away');
    
    registry.stop();
  });

  test('状态更新触发事件', async () => {
    const registry = new AgentRegistry();
    await registry.start();
    
    let eventFired = false;
    registry.on('stateChange', () => { eventFired = true; });
    
    registry.updateState('test-agent', { name: 'Test', status: 'working' });
    
    assert.ok(eventFired, '状态变更应触发事件');
    
    registry.stop();
  });

  test('getAgentsByStatus 过滤', async () => {
    const registry = new AgentRegistry();
    await registry.start();
    
    registry.updateState('agent-1', { status: 'idle' });
    registry.updateState('agent-2', { status: 'working' });
    registry.updateState('agent-3', { status: 'meeting' });
    
    const working = registry.getAgentsByStatus('working');
    assert.strictEqual(working.length >= 1, true);
    
    registry.stop();
  });
});
