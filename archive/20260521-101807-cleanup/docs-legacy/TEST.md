# Agent Monitor 测试计划 (TEST.md)

> 版本: 1.0.0
> 更新: 2026-03-26

---

## 1. 测试策略

### 1.1 测试金字塔

```
        /\
       /E2E\         ← 少量: 关键路径 (Playwright)
      /─────\
     /Integr\        ← 中量: API 集成测试
    /────────\
   /Unit Tests\      ← 大量: 单元测试 (Node.js assert)
  /────────────\
```

### 1.2 测试范围

| 层级 | 工具 | 覆盖范围 |
|------|------|----------|
| 单元测试 | Node.js assert | AgentRegistry, MessageCapture |
| 集成测试 | fetch + assert | HTTP API 端点 |
| E2E 测试 | Playwright | WebSocket + 浏览器交互 |

---

## 2. 单元测试

### 2.1 AgentRegistry 测试

```javascript
// tests/unit/agent-registry.test.js

import { test } from 'node:test';
import assert from 'node:assert';

// Test cases
test('AgentRegistry - 默认初始化 5 个 Agent', async () => {
  const registry = new AgentRegistry();
  await registry.start();
  
  const states = registry.getAllStates();
  assert.ok(states.length >= 5, `期望至少5个Agent, 实际${states.length}`);
});

test('AgentRegistry - 心跳超时检测', async () => {
  const registry = new AgentRegistry({
    heartbeatTimeout: 1000, // 1秒超时
    checkInterval: 500,      // 0.5秒检查
  });
  
  registry.updateState('test-agent', { name: 'Test', status: 'working' });
  
  // 等待超时
  await new Promise(r => setTimeout(r, 1500));
  
  const state = registry.getState('test-agent');
  assert.strictEqual(state.status, 'away', '超时后应标记为away');
});

test('AgentRegistry - 状态更新触发事件', async () => {
  const registry = new AgentRegistry();
  
  let eventFired = false;
  registry.on('stateChange', () => { eventFired = true; });
  
  registry.updateState('test-agent', { status: 'working' });
  
  assert.ok(eventFired, '状态变更应触发事件');
});
```

### 2.2 MessageCapture 测试

```javascript
// tests/unit/message-capture.test.js

import { test } from 'node:test';
import assert from 'node:assert';

test('MessageCapture - 消息队列限制', async () => {
  const capture = new MessageCapture({ maxMessages: 3 });
  
  capture.handleMessage({ agentId: 'a', content: 'msg1' });
  capture.handleMessage({ agentId: 'a', content: 'msg2' });
  capture.handleMessage({ agentId: 'a', content: 'msg3' });
  capture.handleMessage({ agentId: 'a', content: 'msg4' }); // 超过限制
  
  const messages = capture.getRecentMessages();
  assert.ok(messages.length <= 3, '消息数不应超过maxMessages');
});

test('MessageCapture - 消息格式正确', async () => {
  const capture = new MessageCapture();
  
  const msg = capture.handleMessage({
    agentId: 'test',
    content: 'Hello',
  });
  
  assert.ok(msg.id, '消息应有id');
  assert.strictEqual(msg.agentId, 'test');
  assert.strictEqual(msg.content, 'Hello');
  assert.ok(msg.timestamp, '消息应有时间戳');
});
```

---

## 3. 集成测试

### 3.1 HTTP API 测试

```javascript
// tests/integration/api.test.js

import { test } from 'node:test';
import assert from 'node:assert';

const BASE_URL = 'http://localhost:3001';

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
```

### 3.2 WebSocket 测试

```javascript
// tests/integration/websocket.test.js

import { test } from 'node:test';
import assert from 'node:assert';
import { io } from 'socket.io-client';

test('WebSocket - 连接成功', (t) => {
  const socket = io('http://localhost:3001', {
    transports: ['websocket'],
    timeout: 5000,
  });
  
  return new Promise((resolve, reject) => {
    socket.on('connect', () => {
      assert.ok(socket.id, '应有socket id');
      socket.disconnect();
      resolve();
    });
    
    socket.on('connect_error', (err) => {
      reject(new Error(`连接失败: ${err.message}`));
    });
    
    // 超时
    setTimeout(() => {
      socket.disconnect();
      reject(new Error('连接超时'));
    }, 5000);
  });
});

test('WebSocket - 接收初始状态', (t) => {
  const socket = io('http://localhost:3001');
  
  return new Promise((resolve, reject) => {
    socket.on('state:init', (agents) => {
      assert.ok(Array.isArray(agents), 'state:init应返回数组');
      assert.ok(agents.length >= 5, '至少5个Agent');
      socket.disconnect();
      resolve();
    });
    
    setTimeout(() => {
      socket.disconnect();
      reject(new Error('未收到state:init'));
    }, 5000);
  });
});
```

---

## 4. E2E 测试 (Playwright)

### 4.1 测试配置

```javascript
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
});
```

### 4.2 E2E 测试用例

```javascript
// tests/e2e/dashboard.spec.js
import { test, expect } from '@playwright/test';

test('页面加载成功', async ({ page }) => {
  await page.goto('/');
  
  // 检查标题
  await expect(page).toHaveTitle(/Agent Monitor/);
});

test('显示 5 个 Agent', async ({ page }) => {
  await page.goto('/');
  
  // 等待 Agent 列表加载
  await page.waitForSelector('.agent-card', { timeout: 5000 });
  
  const agentCards = await page.locator('.agent-card').count();
  expect(agentCards).toBe(5);
});

test('Agent 状态正确显示', async ({ page }) => {
  await page.goto('/');
  
  await page.waitForSelector('.agent-card', { timeout: 5000 });
  
  // 检查 Tim 存在
  const timCard = page.locator('.agent-card', { hasText: 'Tim' });
  await expect(timCard).toBeVisible();
});

test('WebSocket 连接成功', async ({ page }) => {
  await page.goto('/');
  
  // 等待连接指示灯变绿
  await page.waitForSelector('.conn-dot.connected', { timeout: 5000 });
});

test('Socket.io 连接无 404 错误', async ({ page }) => {
  const errors = [];
  
  page.on('response', (response) => {
    if (response.status() === 404) {
      errors.push(response.url());
    }
  });
  
  await page.goto('/');
  await page.waitForTimeout(2000);
  
  // 不应有 404
  const js404s = errors.filter(url => url.endsWith('.js'));
  expect(js404s).toHaveLength(0);
});
```

---

## 5. 测试运行

### 5.1 运行所有测试

```bash
# 单元测试
node --test tests/unit/*.test.js

# 集成测试  
node --test tests/integration/*.test.js

# E2E 测试 (需要服务运行)
npx playwright test
```

### 5.2 CI/CD 集成

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run start &
        shell: bash
        env:
          ACTION_CONTINUATION_TIMEOUT: 60000
      - run: npx wait-on http://localhost:3001
      - run: node --test tests/unit/*.test.js
      - run: node --test tests/integration/*.test.js
      - run: npx playwright install --with-deps
      - run: npx playwright test
```

---

## 6. 测试覆盖目标

| 模块 | 当前覆盖 | 目标覆盖 |
|------|----------|----------|
| AgentRegistry | 0% | 80%+ |
| MessageCapture | 0% | 80%+ |
| HTTP API | 部分 | 100% |
| WebSocket | 0% | 80%+ |
| E2E | 0% | 关键路径 |

---

## 7. 测试报告

测试结果应记录在：

```
tests/
├── unit/
│   └── results/
│       └── TAP 输出
├── integration/
│   └── results/
│       └── TAP 输出
└── e2e/
    └── playwright-report/
        └── index.html
```

---

## 8. 更新记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-03-26 | 1.0.0 | 初始测试计划 |
