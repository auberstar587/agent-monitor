import { test, describe } from 'node:test';
import assert from 'node:assert';

const BASE_URL = 'http://localhost:3001';

describe('HTTP API', () => {
  test('GET /api/health - 健康检查', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.status, 'ok');
  });

  test('GET /api/agents - 返回 Agent 列表', async () => {
    const res = await fetch(`${BASE_URL}/api/agents`);
    const data = await res.json();
    
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(data.agents), 'agents应是数组');
    assert.ok(data.agents.length >= 5, '至少5个Agent');
    
    // 验证 Tim 在列表中
    const tim = data.agents.find(a => a.name === 'Tim');
    assert.ok(tim, 'Tim应在列表中');
  });

  test('GET /api/agents/:id - 返回指定 Agent', async () => {
    const res = await fetch(`${BASE_URL}/api/agents/tim`);
    const data = await res.json();
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.name, 'Tim');
    assert.strictEqual(data.role, '主控');
  });

  test('GET /api/stats - 系统统计', async () => {
    const res = await fetch(`${BASE_URL}/api/stats`);
    const data = await res.json();
    
    assert.strictEqual(res.status, 200);
    assert.ok(data.agents, '应有agents统计');
    assert.ok(data.agents.total >= 5, 'total至少5');
  });
});
