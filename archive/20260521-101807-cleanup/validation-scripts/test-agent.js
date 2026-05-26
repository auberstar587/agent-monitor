/**
 * Test Agent - 自动化 API 测试
 * 
 * 测试所有核心 API 端点，验证数据完整性和持久化。
 * 发现问题立即输出告警。
 */

import http from 'http';

const BASE_URL = 'http://localhost:3001';
const RESULTS = [];

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`Timeout: ${path}`));
    });
  });
}

async function test(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    RESULTS.push({ name, status: 'PASS', duration, result });
    console.log(`  ✅ ${name} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    RESULTS.push({ name, status: 'FAIL', duration, error: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

async function run() {
  console.log('\n🔍 Agent Monitor API Test');
  console.log('========================');

  // 测试用的临时项目，结束后自动删除
  let tempProjectId = null;

  async function cleanup() {
    if (tempProjectId) {
      await new Promise((resolve) => {
        const req = http.request(new URL(`/api/projects/${tempProjectId}`, BASE_URL), {
          method: 'DELETE'
        }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
        req.on('error', () => resolve()); req.end();
      });
    }
  }

  try {
    // 1. Health check
    await test('GET /api/health', async () => {
      const res = await httpGet('/api/health');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (res.data.status !== 'ok') throw new Error('Status not ok');
    });

    // 2. System stats
    await test('GET /api/system/stats', async () => {
      const res = await httpGet('/api/system/stats');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!res.data.cpu || !res.data.memory || !res.data.disk) throw new Error('Missing fields');
      if (typeof res.data.cpu.usagePercent !== 'number') throw new Error('Invalid cpu.usagePercent');
    });

    // 3. Projects API
    await test('GET /api/projects', async () => {
      const res = await httpGet('/api/projects');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!Array.isArray(res.data.projects)) throw new Error('projects not array');
      if (typeof res.data.total !== 'number') throw new Error('total not number');
    });

    // 4. Projects persistence (创建后删除)
    await test('POST /api/projects (create)', async () => {
      const testName = `TestProject_${Date.now()}`;
      const res = await new Promise((resolve, reject) => {
        const data = JSON.stringify({ name: testName, type: 'chat', model: 'qwen2.5', path: '/tmp/test' });
        const req = http.request(new URL('/api/projects', BASE_URL), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!res.data.success) throw new Error('Not success');
      tempProjectId = res.data.project.id;  // 记录下来后面删除
      return res.data;
    });

    // 5. Project stats
    await test('GET /api/projects/:id/stats', async () => {
      const listRes = await httpGet('/api/projects');
      if (listRes.data.projects.length === 0) throw new Error('No projects');
      const id = listRes.data.projects[0].id;
      const res = await httpGet(`/api/projects/${id}/stats`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (typeof res.data.todayTasks !== 'number') throw new Error('Invalid todayTasks');
      if (typeof res.data.successRate !== 'number') throw new Error('Invalid successRate');
    });

    // 6. Config agents API
    await test('GET /api/config/agents', async () => {
      const res = await httpGet('/api/config/agents');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!Array.isArray(res.data.agents)) throw new Error('agents not array');
    });

    // 7. Chat messages
    await test('GET /api/chat/messages', async () => {
      const res = await httpGet('/api/chat/messages');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });

    // 8. Meeting state
    await test('GET /api/meeting/state', async () => {
      const res = await httpGet('/api/meeting/state');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });

    // Summary
    console.log('\n📊 Test Summary');
    console.log('===============');
    const passed = RESULTS.filter(r => r.status === 'PASS').length;
    const failed = RESULTS.filter(r => r.status === 'FAIL').length;
    console.log(`  Total: ${RESULTS.length} | ✅ ${passed} | ❌ ${failed}`);

    if (failed > 0) {
      console.log('\n⚠️  Failed tests:');
      RESULTS.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
      await cleanup();
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed!');
    }
  } finally {
    await cleanup();  // 确保删除临时项目
  }
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
