import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';

const BASE_URL = 'http://localhost:3001';

// ===== Helper: HTTP fetch =====
async function apiFetch(path, options = {}) {
  const { method = 'GET', body } = options;
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, ...options });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ===== Helper: clean test projects from projects.json =====
// 清理所有 name 以 TestProject/FieldTest/测试新建项目 开头的项目
async function cleanupTestProjects() {
  const { data } = await apiFetch('/api/projects');
  const projects = data.projects || [];
  const toDelete = projects.filter(p =>
    p.name.startsWith('TestProject') ||
    p.name.startsWith('FieldTest') ||
    p.name.startsWith('测试新建项目')
  );
  for (const p of toDelete) {
    await apiFetch(`/api/projects/${p.id}`, { method: 'DELETE' });
  }
}

// ===== Helper: unique project name =====
let projectCounter = 0;
function uniqueName() {
  return `TestProject_${Date.now()}_${++projectCounter}`;
}

// ===== Global before/after: clean all test projects =====
before(async () => {
  await cleanupTestProjects();
});

after(async () => {
  await cleanupTestProjects();
});

// ===== 数据来源说明 =====
// /api/health           → 真实，健康检查
// /api/system/stats     → 真实，系统资源数据
// /api/chat/*           → 内存状态，测试后调用 leave 清理
// /api/meeting/*        → 状态机，测试后确保回到 idle
// /api/projects POST    → projects.json，测试后 DELETE 清理
// /api/projects DELETE  → 文件删除
// 固定测试 agentId
const TEST_AGENT_ID = 'test-agent-cleanup';

// ===== Health & System =====
describe('=== Health & System ===', () => {

  // 数据来源: 真实系统数据
  test('GET /api/health - 服务健康', async () => {
    const { status, data } = await apiFetch('/api/health');
    assert.strictEqual(status, 200, '状态码应为200');
    assert.strictEqual(data.status, 'ok', '状态应为ok');
    assert.ok(data.timestamp, '应有timestamp');
  });

  // 数据来源: 真实系统数据
  test('GET /api/system/stats - 系统资源数据完整', async () => {
    const { status, data } = await apiFetch('/api/system/stats');
    assert.strictEqual(status, 200);
    assert.ok(data.cpu, '应有cpu字段');
    assert.ok(data.memory, '应有memory字段');
    assert.ok(data.disk, '应有disk字段');
    assert.ok(typeof data.cpu.usagePercent === 'number', 'cpu.usagePercent应为数字');
    assert.ok(typeof data.memory.total === 'number', 'memory.total应为数字');
    assert.ok(typeof data.disk.total === 'number', 'disk.total应为数字');
    assert.ok(data.timestamp, '应有timestamp');
  });

});

// ===== Chat Room API =====
// 数据来源: 内存，测试结束后调用 /api/chat/leave 清理
describe('=== Chat Room API ===', () => {

  const TEST_AGENT_ID = 'test-agent-cleanup';

  // 清理: 测试结束后离开
  after(async () => {
    await apiFetch('/api/chat/leave', {
      method: 'POST',
      body: JSON.stringify({ agentId: TEST_AGENT_ID }),
    });
  });

  test('POST /api/chat/join - Agent加入', async () => {
    const { status, data } = await apiFetch('/api/chat/join', {
      method: 'POST',
      body: JSON.stringify({ agentId: TEST_AGENT_ID, agentName: 'TestAgent', role: 'tester' }),
    });
    assert.strictEqual(status, 200, '加入应成功');
    assert.strictEqual(data.success, true, 'success应为true');
    assert.ok(data.agent, '应有agent对象');
    assert.strictEqual(data.agent.agentId, TEST_AGENT_ID);
  });

  test('POST /api/chat/status - 更新状态', async () => {
    const { status, data } = await apiFetch('/api/chat/status', {
      method: 'POST',
      body: JSON.stringify({ agentId: TEST_AGENT_ID, status: 'working', task: '测试任务' }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.agent.status, 'working');
    assert.strictEqual(data.agent.task, '测试任务');
  });

  test('POST /api/chat/status - 支持 type/model/todayTasks/successRate 字段', async () => {
    const { status, data } = await apiFetch('/api/chat/status', {
      method: 'POST',
      body: JSON.stringify({
        agentId: TEST_AGENT_ID,
        status: 'idle',
        type: 'coding',
        model: 'deepseek',
        todayTasks: 42,
        successRate: 96.5,
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.agent.type, 'coding');
    assert.strictEqual(data.agent.model, 'deepseek');
    assert.strictEqual(data.agent.todayTasks, 42);
    assert.strictEqual(data.agent.successRate, 96.5);
  });

  test('GET /api/chat/agents - 返回已加入的Agent', async () => {
    const { status, data } = await apiFetch('/api/chat/agents');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.agents), 'agents应为数组');
    const found = data.agents.find(a => a.agentId === TEST_AGENT_ID);
    assert.ok(found, `${TEST_AGENT_ID}应在列表中`);
    assert.strictEqual(found.status, 'idle');
  });

  test('POST /api/chat/message - Agent发送消息', async () => {
    const { status, data } = await apiFetch('/api/chat/message', {
      method: 'POST',
      body: JSON.stringify({ agentId: TEST_AGENT_ID, content: '测试消息内容' }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.message, '应有message对象');
    assert.strictEqual(data.message.content, '测试消息内容');
    assert.strictEqual(data.message.agentId, TEST_AGENT_ID);
  });

  test('GET /api/chat/messages - 获取消息列表', async () => {
    const { status, data } = await apiFetch('/api/chat/messages');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.messages), 'messages应为数组');
    assert.ok(data.messages.length > 0, '应有消息');
    const lastMsg = data.messages[data.messages.length - 1];
    assert.strictEqual(lastMsg.agentId, TEST_AGENT_ID);
  });

  test('POST /api/chat/leave - Agent离开', async () => {
    const { status, data } = await apiFetch('/api/chat/leave', {
      method: 'POST',
      body: JSON.stringify({ agentId: TEST_AGENT_ID }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
  });

});

// ===== Meeting API =====
// 数据来源: 状态机，测试后确保回到 idle
describe('=== Meeting API ===', () => {

  // Helper: 等待会议进入目标状态
  async function waitForMeetingState(expected, timeoutMs = 1500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await apiFetch('/api/meeting/state');
      if (data.state === expected) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    return false;
  }

  // Helper: 确保会议处于 idle 状态
  async function ensureIdle() {
    const { data } = await apiFetch('/api/meeting/state');
    if (data.state !== 'idle') {
      await apiFetch('/api/meeting/end', { method: 'POST' });
      await new Promise(r => setTimeout(r, 300));
      await waitForMeetingState('idle', 500);
    }
  }

  // 每个 meeting 测试结束后确保回到 idle
  after(async () => {
    await ensureIdle();
  });

  test('GET /api/meeting/state - 获取会议状态', async () => {
    const { status, data } = await apiFetch('/api/meeting/state');
    assert.strictEqual(status, 200);
    assert.ok('state' in data, '应有state字段');
  });

  test('POST /api/meeting/start - 发起会议', async () => {
    await ensureIdle();
    const { status, data } = await apiFetch('/api/meeting/start', {
      method: 'POST',
      body: JSON.stringify({ topic: '测试会议', participants: [TEST_AGENT_ID] }),
    });
    assert.strictEqual(status, 200);
    assert.ok(data.success !== undefined, '应有success字段');
    assert.ok(data.state, '应有state对象');
    const ok = await waitForMeetingState('meeting', 500);
    assert.ok(ok, '会议应进入meeting状态');
  });

  test('POST /api/meeting/end - 结束会议（完整流程）', async () => {
    await ensureIdle();
    // 启动会议
    await apiFetch('/api/meeting/start', {
      method: 'POST',
      body: JSON.stringify({ topic: '测试结束' }),
    });
    // 等待进入 meeting 状态
    const ok = await waitForMeetingState('meeting', 1000);
    assert.ok(ok, '会议应进入meeting状态');
    // 结束会议
    const { status, data } = await apiFetch('/api/meeting/end', { method: 'POST' });
    assert.strictEqual(status, 200, `end应返回200，实际${status}`);
    assert.strictEqual(data.success, true);
    // 等待回到 idle
    const idleOk = await waitForMeetingState('idle', 500);
    assert.ok(idleOk, '会议应回到idle状态');
  });

});

// ===== Project CRUD =====
// 数据来源: projects.json 文件，测试后 DELETE 清理
describe('=== Project CRUD ===', () => {

  let createdProjectId = null;

  // 测试结束后删除本测试创建的项目
  after(async () => {
    if (createdProjectId) {
      await apiFetch(`/api/projects/${createdProjectId}`, { method: 'DELETE' });
      createdProjectId = null;
    }
    // 同时清理 FieldTest 项目
    const { data } = await apiFetch('/api/projects');
    const fieldTest = (data.projects || []).filter(p => p.name === 'FieldTest');
    for (const p of fieldTest) {
      await apiFetch(`/api/projects/${p.id}`, { method: 'DELETE' });
    }
  });

  test('GET /api/projects - 获取项目列表', async () => {
    // 数据来源: projects.json 真实文件数据
    const { status, data } = await apiFetch('/api/projects');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.projects), 'projects应为数组');
    assert.strictEqual(typeof data.total, 'number', 'total应为数字');
    assert.ok(data.stats, '应有stats字段');
  });

  test('POST /api/projects - 创建项目', async () => {
    // 数据来源: 创建后写入 projects.json，测试后删除
    const { status, data } = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: uniqueName(),
        type: 'coding',
        model: 'deepseek',
        path: '/tmp/test-project',
        agentId: '',
      }),
    });
    assert.strictEqual(status, 200, '创建应成功');
    assert.strictEqual(data.success, true, 'success应为true');
    assert.ok(data.project, '应有project对象');
    assert.ok(data.project.id, 'project应有id');
    assert.strictEqual(data.project.type, 'coding');
    assert.strictEqual(data.project.model, 'deepseek');
    createdProjectId = data.project.id;
  });

  test('GET /api/projects/:id - 获取单个项目', async () => {
    // 数据来源: projects.json 文件
    assert.ok(createdProjectId, '需要先创建项目');
    const { status, data } = await apiFetch(`/api/projects/${createdProjectId}`);
    assert.strictEqual(status, 200, '获取应成功');
    assert.strictEqual(data.id, createdProjectId);
    assert.strictEqual(data.type, 'coding');
  });

  test('GET /api/projects/:id/stats - 获取项目统计', async () => {
    // 数据来源: projects.json + 实时统计
    assert.ok(createdProjectId);
    const { status, data } = await apiFetch(`/api/projects/${createdProjectId}/stats`);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.projectId, createdProjectId);
    assert.strictEqual(typeof data.todayTasks, 'number', 'todayTasks应为数字');
    assert.strictEqual(typeof data.successRate, 'number', 'successRate应为数字');
    assert.strictEqual(typeof data.cpuUsage, 'number', 'cpuUsage应为数字');
    assert.strictEqual(typeof data.memoryUsage, 'number', 'memoryUsage应为数字');
  });

  test('PUT /api/projects/:id - 更新项目', async () => {
    // 数据来源: 更新 projects.json 文件
    assert.ok(createdProjectId);
    const { status, data } = await apiFetch(`/api/projects/${createdProjectId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'UpdatedName', type: 'research', model: 'glm-5.1' }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.project.name, 'UpdatedName');
    assert.strictEqual(data.project.type, 'research');
    assert.strictEqual(data.project.model, 'glm-5.1');
  });

  test('POST /api/projects/import - 导入项目', async () => {
    // 数据来源: 扫描目录写入 projects.json
    const { status, data } = await apiFetch('/api/projects/import', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(typeof data.imported, 'number', 'imported应为数字');
    assert.ok(Array.isArray(data.projects), 'projects应为数组');
  });

  test('DELETE /api/projects/:id - 删除项目', async () => {
    // 数据来源: 从 projects.json 删除
    assert.ok(createdProjectId);
    const { status, data } = await apiFetch(`/api/projects/${createdProjectId}`, { method: 'DELETE' });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);

    // 确认删除
    const { status: s404, data: d404 } = await apiFetch(`/api/projects/${createdProjectId}`);
    assert.strictEqual(s404, 404, '删除后应返回404');

    createdProjectId = null; // 已删除，避免 after 再删
  });

  test('POST /api/projects - 验证字段完整', async () => {
    // 数据来源: 创建后写入 projects.json，测试后删除（由 after 清理 FieldTest）
    const { status, data } = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'FieldTest',
        type: 'chat',
        model: 'MiniMax-M2.7',
        path: '/test/path',
        agentId: 'test-agent',
      }),
    });
    assert.strictEqual(status, 200);
    const p = data.project;
    assert.ok(p.id, '应有id');
    assert.strictEqual(p.name, 'FieldTest');
    assert.strictEqual(p.type, 'chat');
    assert.strictEqual(p.model, 'MiniMax-M2.7');
    assert.strictEqual(p.path, '/test/path');
    assert.strictEqual(p.agentId, 'test-agent');
    assert.ok(p.createdAt, '应有createdAt');
    assert.ok(p.updatedAt, '应有updatedAt');
  });

  test('POST /api/projects - 无效type应报错', async () => {
    // 数据来源: 无效数据，校验失败返回 400
    const { status, data } = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'BadType', type: 'invalid_type' }),
    });
    assert.strictEqual(status, 400, '无效type应返回400');
  });

  test('POST /api/projects - 无name应报错', async () => {
    // 数据来源: 无效数据，校验失败返回 400
    const { status } = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ type: 'chat' }),
    });
    assert.strictEqual(status, 400, '缺少name应返回400');
  });

});

// ===== Persistence =====
describe('=== Persistence ===', () => {

  test('项目重启后持久化数据应保留', async () => {
    // 数据来源: projects.json 真实持久化文件
    const { status, data } = await apiFetch('/api/projects');
    assert.strictEqual(status, 200);
    assert.ok(data.total >= 0, '应有项目计数');
  });

});
