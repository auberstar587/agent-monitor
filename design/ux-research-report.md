# Agent Monitor UX 用户研究报告

**研究日期**：2026-04-28
**研究方法**：启发式评估 + 代码走查 + 静态可用性审计
**研究范围**：4 个核心页面（总览 / Agent 管理 / 项目管理 / 会议可视化）
**报告版本**：v1.1（含实际运行测试验证）

---

## 一、问题总览

| 严重级别 | 数量 | 说明 |
|---------|------|------|
| **P0 严重** | 6 个 | 导致功能不可用或严重误导用户 |
| **P1 重要** | 6 个 | 影响用户体验但不阻塞核心流程 |
| **P2 改善** | 7 个 | 锦上添花的体验优化 |

### 实际运行测试验证（2026-04-28 15:18）

通过 gstack browse 无头浏览器对 http://localhost:3001 进行了全面测试，结果如下：

| 测试项 | 结果 | 备注 |
|-------|------|------|
| 总览页加载 | ✅ | HTTP 200，无控制台错误 |
| Agent 页加载 | ✅ | HTTP 200，无控制台错误 |
| 项目页加载 | ⚠️ | HTTP 200，但 `/api/agents` 返回 404（控制台报错） |
| 会议页加载 | ✅ | HTTP 200，无控制台错误 |
| 总览页轮询 | ✅ | 30s 间隔，正常工作 |
| Agent 页轮询 | ✅ | 5s 间隔，正常工作 |
| 项目搜索 | ✅ | 搜索 "monitor" 正确过滤 |
| Agent 搜索 | ✅ | 搜索 "QQ" 正确过滤 |
| Agent 状态筛选 | ❌ | 选"离线"显示空结果（所有 Agent 都是 offline） |
| Agent 详情弹窗 | ✅ | 正常显示完整信息 |
| 项目详情弹窗 | ✅ | 正常显示，含 Agent 名称（但显示离线） |
| 项目编辑弹窗 | ✅ | 正常打开，数据回填正确 |
| 新建项目弹窗 | ⚠️ | 正常打开，但 Agent 下拉为空（因 /api/agents 404） |
| 移动端导航 | ❌ | ≤768px 侧边栏隐藏，无汉堡菜单 |
| 导航链接一致性 | ✅ | 所有链接已统一为 .html 格式 |

---

## 二、P0 严重问题（共 6 个）

### P0-1 · 总览页 Agent API 路由不存在（404）

- **页面**：`index.html`
- **文件**：`public/index.html` 第 365 行
- **严重程度**：🔴 致命 — 总览页核心数据全部丢失

**问题描述**：
总览页调用 `GET /api/agents` 获取 Agent 列表，但后端根本没有这个路由。后端定义的路由是：
- `GET /api/chat/agents` — ChatRoom 在线 Agent
- `GET /api/config/agents` — OpenClaw 静态配置
- `GET /api/agents/:id` — 单个 Agent 详情（需要 `:id` 参数）

前端调用 `/api/agents`（无 `:id`）会被 Fastify 返回 404。

**代码证据**：
```javascript
// public/index.html 第 365 行
const agentsRes = await fetch(`${API_BASE}/api/agents`);

// src/index.js — 后端路由定义
fastify.get('/api/chat/agents', ...)    // ✅ 存在
fastify.get('/api/config/agents', ...)  // ✅ 存在
fastify.get('/api/agents/:id', ...)     // ✅ 存在（需要 :id）
// GET /api/agents — ❌ 不存在
```

**修复方案**：
```javascript
// 修改 public/index.html 第 365 行
const agentsRes = await fetch(`${API_BASE}/api/chat/agents`);
```

---

### P0-2 · Agent 页 KPI 标签与数据语义完全错位

> **测试验证**：✅ 已修复 — KPI 卡片已改为"Agent 总数 / 默认 Agent / 有 Skills / 无 Skills"，语义正确。

- **页面**：`agent.html`
- **文件**：`public/js/agent.js` 第 111-122 行
- **严重程度**：🔴 致命 — 严重误导用户

**问题描述**：

| KPI 标签 | HTML ID | 实际计算逻辑 | 正确？ |
|---------|---------|------------|:------:|
| Agent 总数 | `kpi-total` | `agents.length` | ✅ |
| **运行中** | `kpi-running` | `agents.filter(a => a.default).length` | ❌ |
| **空闲** | `kpi-idle` | `agents.filter(a => a.skills.length > 0).length` | ❌ |
| **离线** | `kpi-away` | 硬编码 `'—'` | ❌ |
| **今日任务** | `kpi-tasks` | 硬编码 `'—'` | ❌ |
| **平均成功率** | `kpi-success` | 硬编码 `'—'` | ❌ |

**代码证据**：
```javascript
// public/js/agent.js 第 111-122 行
function renderKPICards(agents) {
    const total = agents.length;
    const defaultAgent = agents.filter(a => a.default).length;
    const withSkills = agents.filter(a => a.skills && a.skills.length > 0).length;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-running').textContent = defaultAgent; // ❌
    document.getElementById('kpi-idle').textContent = withSkills;      // ❌
    document.getElementById('kpi-away').textContent = '—';             // ❌
    document.getElementById('kpi-tasks').textContent = '—';            // ❌
    document.getElementById('kpi-success').textContent = '—';          // ❌
}
```

**修复方案**：
1. "运行中"/"空闲"/"离线"应基于实时 status 统计
2. "今日任务"和"平均成功率"无数据源时**移除 KPI 卡片**，不要显示 `—`

---

### P0-3 · Agent 页所有 Agent 永远显示 offline

- **文件**：`src/index.js` 第 242 行
- **严重程度**：🔴 致命 — 状态数据完全失真

**代码证据**：
```javascript
// src/index.js 第 234-244 行
agents = agentList.map(a => ({
    agentId: a.id,
    name: a.name || a.id,
    default: a.default || false,
    model: ...,
    fallbacks: ...,
    skills: a.skills || [],
    status: 'offline',   // ← 硬编码！永远 offline
}));
```

**修复方案**：`/api/config/agents` 返回时应与 ChatRoom 实时状态合并。

---

### P0-4 · Agent 页表格列名与渲染数据完全错位

> **测试验证**：✅ 已修复 — 表头已改为"名称 / 状态 / 主模型 / Fallbacks / Skills / 默认 / 操作"，数据对齐正确。

- **文件**：`public/agent.html` 第 157-163 行 + `public/js/agent.js` 第 170-173 行
- **严重程度**：🔴 严重

| 表头文字 | 实际渲染内容 | 期望内容 |
|---------|------------|---------|
| **类型** | `agent.model`（主模型） | ❌ |
| **模型** | `agent.fallbacks.join(', ')`（回退链） | ❌ |
| **今日任务** | `agent.skills.length + ' 个'` | ❌ |
| **成功率** | `agent.default ? '默认' : '—'` | ❌ |

**修复方案**：表头改为 `主模型 / 回退链 / Skills / 默认`。

---

### P0-5 · 会议页面纯 Demo 模式，与真实 Agent 完全脱节

- **文件**：`public/js/meeting.js` 第 14-36 行
- **严重程度**：🔴 严重

**代码证据**：
```javascript
// public/js/meeting.js 第 14-21 行
roles: [
    { id: 'orchestrator', name: '主持', ... },
    { id: 'product', name: '产品', ... },
    { id: 'tech', name: '技术', ... },
    { id: 'data', name: '数据', ... },
    { id: 'ux', name: '体验', ... }
],
demo: { enabled: true }  // 第 33 行 — 硬编码开启
```

**修复方案**：从 `GET /api/chat/agents` 获取真实 Agent，监听 Socket.io 事件。

---

### P0-6 · 总览页和 Agent 页无实时更新

- **文件**：`public/index.html` 第 528-531 行、`public/js/agent.js` 第 403 行
- **严重程度**：🔴 重要

后端已实现 Socket.io（`chat:join`/`chat:leave`/`chat:status`/`chat:message`），但前端使用 HTTP 轮询（60s/5s）。

**修复方案**：接入 Socket.io 实时推送。

---

## 三、P1 重要问题（共 6 个）

| # | 问题 | 文件 | 修复方案 |
|---|------|------|---------|
| P1-1 | 总览页导航链接不一致（`/` vs `index.html`） | `index.html` | 统一为 `index.html` |
| P1-2 | 版本号硬编码 `v1.0.0` | `index.html:495`、`agent.js:200` | 从 API 获取 |
| P1-3 | 操作系统显示用户浏览器 OS | `agent.js:209` `navigator.platform` | 从后端 `/api/system/stats` 获取 `process.platform` |
| P1-4 | 系统资源刷新频率不一致（30s vs 5s） | `index.html:527`、`agent.js:403` | 统一频率或用 Socket.io |
| P1-5 | 会议页底部重复输入框无发送逻辑 | `meeting.html:90-93` | 移除底部输入框 |
| P1-6 | 项目页缺少"扫描导入"按钮 | `project.js:123-141` | 添加 UI 按钮调用 `importProjects()` |

---

## 四、P2 改善建议（共 7 个）

| # | 建议 | 影响 |
|---|------|------|
| P2-1 | 消息列表无展开交互 | 长消息被截断无法查看 |
| P2-2 | 会议页控制按钮无功能 | 🎤📷🖥️📝••• 按钮无绑定 |
| P2-3 | 移动端导航不可用 | ≤768px 时导航直接隐藏 |
| P2-4 | 侧边栏 ≤1024px 直接隐藏 | 无折叠替代方案 |
| P2-5 | 缺少加载状态和错误提示 | API 失败用户无感知 |
| P2-6 | 弹窗键盘可访问性不足 | 缺少 `role="dialog"` |
| P2-7 | 项目页 Agent 下拉用 `/api/agents` | `project.js:36` 同样 404 |

---

## 五、修复优先级路线图

### Sprint 1 — 本迭代（1-2 天）

| # | 任务 | 工作量 | 文件 |
|---|------|:------:|------|
| 1 | 修复总览页 API：`/api/agents` → `/api/chat/agents` | 10 min | `index.html:365` |
| 2 | 修正 Agent KPI 语义 + 移除无数据 KPI | 30 min | `agent.html` + `agent.js` |
| 3 | 修正 Agent 表格列名对齐数据 | 15 min | `agent.html` + `agent.js` |
| 4 | 修复项目页 Agent API 路由 | 10 min | `project.js:36` |
| 5 | Agent 页合并实时状态 | 1 hr | `src/index.js` |

### Sprint 2 — 下迭代（2-3 天）

| # | 任务 | 工作量 |
|---|------|:------:|
| 6 | 总览页 + Agent 页接入 Socket.io | 3 hr |
| 7 | 会议页接入真实 Agent | 4 hr |
| 8 | 移动端汉堡菜单 + 侧边栏折叠 | 2 hr |
| 9 | 加载状态 + 错误提示 | 2 hr |
| 10 | 项目页"扫描导入"按钮 | 30 min |

### Sprint 3 — 长期优化

| # | 任务 | 工作量 |
|---|------|:------:|
| 11 | 独立聊天室页面 | 1 周 |
| 12 | Agent 详情页（消息历史+状态时间线） | 3 天 |
| 13 | 告警系统（Agent 离线/异常通知） | 1 周 |
| 14 | 键盘可访问性和 ARIA 语义 | 2 天 |

---

## 六、实际测试新发现（v1.1 新增）

### NEW-1 · Agent 页状态筛选失效 🔴

- **页面**：`agent.html`
- **文件**：`public/js/agent.js`
- **严重程度**：🔴 P0

**问题描述**：
所有 6 个 Agent 的 `status` 都为 `offline`，但在状态筛选器选择"离线"时，表格却显示"暂无 Agent 数据"。选"全部状态"时能正常显示 6 条。

**根因**：筛选逻辑可能匹配的不是 `offline` 字符串，而是其他值（如通过 ChatRoom 在线列表过滤）。

---

### NEW-2 · 项目页新建/编辑时 Agent 下拉为空 🔴

- **页面**：`project.html`
- **文件**：`public/js/project.js`
- **严重程度**：🔴 P0（已确认在报告中 P2-7，建议升级）

**问题描述**：
新建项目弹窗的"关联 Agent"下拉只显示 `-- 选择 Agent --`，没有可选的 Agent 列表。编辑弹窗同样如此。

**根因**：`project.js` 调用 `GET /api/agents`（404），应改为 `/api/config/agents`。

---

### NEW-3 · 总览页 CPU 使用率超过 100% 显示异常

- **页面**：`index.html` / `agent.html`
- **文件**：`src/index.js` 第 314 行
- **严重程度**：🟡 P2

**问题描述**：
CPU 使用率计算公式为 `cpuLoad[0] / cpuCount * 100`，其中 `cpuLoad[0]` 是系统 1 分钟平均负载。在 macOS 上，当系统负载超过核心数时（如负载 14.49 / 8 核 = 181%），CPU 使用率显示超过 100%。

**代码证据**：
```javascript
// src/index.js 第 314 行
usagePercent: Math.round(cpuLoad[0] / cpuCount * 100),
```

**修复方案**：`Math.min(100, Math.round(...))`，或改用 `os.cpus()` 获取真实使用率。

---

### NEW-4 · 总览页 "今日任务" 数据为 0，但项目详情页有 50 条

- **页面**：`index.html`
- **严重程度**：🟡 P2

**问题描述**：
总览页 KPI 卡片显示"今日任务 0"，但点击项目详情后显示"50 今日任务"。总览页的"今日任务"数据来源和计算逻辑需要核实。

---

### 已修复问题确认

| 问题 | 原始状态 | 当前状态 |
|------|---------|---------|
| P0-2 KPI 语义错位 | ❌ | ✅ 已修复（标签改为 默认Agent/Skills） |
| P0-4 表格列名错位 | ❌ | ✅ 已修复（主模型/Fallbacks/Skills/默认） |
| P1-1 导航链接不一致 | ❓ | ✅ 已修复（统一 .html 格式） |
| P0-1 总览页 API 404 | ❌ | ⚠️ 部分修复（已改为 /api/chat/agents，返回空数组是正确行为） |
