# Phase 8: 核心工作流打通 + 三大模块补齐

> 版本: 2.0
> 日期: 2026-06-03
> 作者: Claude + Auber
> 状态: **基本完成（22/23，仅 Hermes 适配器未实施）**
> 目标: 打通 项目 → 任务 → Agent 执行 → 结果回写 的完整工作流，补齐三大模块功能缺口，尽快投入使用

---

## 0. 待解惑答疑

### Q1: 如何创建多 Agent？Claude Code / Codex 怎么拉起不同角色？

**结论：通过 CLI 参数实现多 Agent，不需要多个进程/线程。**

| 方式 | Claude Code | Codex |
|------|-------------|-------|
| **定义角色** | `--append-system-prompt "你是测试工程师..."` 或 `--agents '{"reviewer":{"description":"代码审查","prompt":"你是代码审查专家"}}' --agent reviewer` | `codex exec -c 'model="o3"' "你是测试工程师..."`
| **隔离工作区** | `--worktree`（自动创建 git worktree 隔离）+ `--add-dir` | `--writable-root` 指定目录 |
| **指定模型** | `--model sonnet` / `--model opus` | `-c 'model="o3"'` |
| **并行执行** | spawn 多个 `claude --print` 子进程，各自独立 | spawn 多个 `codex exec` 子进程 |

**我们的方案**：在 EngineAdapter 层封装——每个"Agent 角色"对应一套 spawn 参数（systemPrompt + model + workingDir）。不需要物理多进程常驻，按需 spawn，用完即回收。

### Q2: 拉起的 Claude / Codex 能不能加载历史 session？

**结论：可以。**

| 工具 | 恢复会话 | 说明 |
|------|---------|------|
| Claude Code | `--resume <sessionId>` 或 `--continue`（恢复最近一次） | session 存储在 `~/.claude/sessions/`，每个 session 一个 JSON 文件 |
| Claude Code | `--session-id <uuid>` | 指定 session ID 启动新会话（可用于固定某角色的长期记忆） |
| Codex | `codex exec resume --last` 或 `codex exec resume <id>` | session 存储在 `~/.codex/sessions/` |
| Codex | `codex resume` | 交互式恢复 |

**我们的方案**：在 Agent 注册时绑定 `sessionId`，后续每次执行时通过 `--resume` 或 `--session-id` 恢复上下文。这意味着 Agent 有"记忆"——上次做到哪、项目背景是什么都能续上。

---

## 1. 核心工作流设计

### 1.1 目标工作流

```
用户注册项目
    │
    ├─→ 项目自动绑定"项目经理 Agent"
    │
    ├─→ 用户在项目下创建任务
    │       │
    │       ▼
    │   项目经理 Agent 分析任务
    │       │
    │       ├─ 检查在线 Agent 列表
    │       ├─ 选择最合适的 Agent（项目相关度 + 能力匹配）
    │       ├─ 如果没有在线的，拉起一个 Agent
    │       ├─ 生成详细的任务描述（补充需求分析）
    │       └─ 分配任务
    │              │
    │              ▼
    │         Agent 执行任务（理解需求 → 开发 → 验证）
    │              │
    │              ▼
    │         执行结果回写
    │         ├─ 更新任务状态（in_progress → completed/failed）
    │         ├─ 写入 agent_outputs
    │         ├─ 更新 agent quality
    │         └─ 关联 execution_trace
    │
    └─→ 看板展示项目进度、完成度、Agent 表现
```

### 1.2 Agent 角色体系

| 角色 | 职责 | 何时存在 |
|------|------|---------|
| **项目经理** | 需求分析、任务拆解、Agent 调度、进度跟踪、质量把控 | 每个项目一个，项目创建时自动创建 |
| **工作者 Agent** | 执行具体任务（编码、测试、审查、分析） | 按需分配，可跨项目复用 |

**一期范围**：项目经理为"虚拟角色"（用 Claude Code + 项目背景 systemPrompt 实现），不做独立进程常驻。用户创建任务时，项目经理自动分析并推荐分配方案，用户确认后执行。

**二期优化**：
- 项目经理作为独立 daemon 常驻，主动发现和处理任务
- 细分角色：前端工程师、后端工程师、测试工程师、代码审查员
- Agent 间协作（项目经理拆子任务 → 多 Agent 并行）

### 1.3 任务执行规范（Agent 工作流程）

每个 Agent 执行任务时必须遵循以下流程，通过 systemPrompt 注入：

```
第一步：理解需求
  - 阅读任务描述和项目背景
  - 查看相关文件和代码结构
  - 确认理解正确（如有歧义，输出疑问）

第二步：制定方案
  - 列出实施步骤
  - 识别风险和依赖

第三步：执行开发
  - 按方案逐步实施
  - 每步完成后检查

第四步：验证结果
  - 运行测试（pnpm test）
  - 类型检查（pnpm typecheck）
  - 构建检查（pnpm build）

第五步：输出总结
  - 完成了什么
  - 改了哪些文件
  - 是否还有遗留问题
```

> 注：工作规范的具体内容需要不断完善，存为可配置模板。

---

## 2. 核心对接任务（最高优先级）

### CORE-01: Chat 接入项目上下文

**问题**: Chat 发 prompt 时不带项目背景，Agent 不知道项目信息

**方案**:

1. `packages/server/src/routes/chat.ts` 的 `POST /run` 增加 `projectId` 参数
2. 如果有 `projectId`，调用 `buildContext(projectId)` 获取项目信息
3. 将项目上下文（name、tech_stack、goals、relations、recent decisions）拼入 `systemPrompt`
4. 前端 Chat 页面选择项目后，请求自动带 `projectId`

```ts
// chat.ts
const { engine: engineName, prompt, model, workingDir, projectId } = request.body as { ... };

let systemPrompt = opts?.systemPrompt as string | undefined;
if (projectId) {
  const ctx = await buildContext(projectId);
  if (ctx.project) {
    systemPrompt = [
      systemPrompt,
      `项目: ${ctx.project.name}`,
      `技术栈: ${ctx.project.tech_stack.join(', ')}`,
      `目标: ${ctx.project.goals.join('; ')}`,
      `状态: ${ctx.project.status}`,
      ctx.relations.length ? `关联项目: ${ctx.relations.map(r => r.target).join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }
}
const stream = engine.run(prompt, { model, workingDir, systemPrompt });
```

**文件**: `chat.ts`（后端）+ `Chat.tsx`（前端传 projectId）

---

### CORE-02: 任务 → 触发 Agent 执行

**问题**: 创建了任务但无法让 Agent 去执行

**方案**:

#### 后端: 新增 `POST /api/tasks/:id/execute`

```ts
// packages/server/src/routes/tasks.ts
fastify.post('/api/tasks/:id/execute', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { engineId } = req.body as { engineId?: string };

  const task = await getTask(id);
  if (!task) return reply.code(404).send({ error: 'Task not found' });
  if (task.status !== 'pending' && task.status !== 'failed')
    return reply.code(400).send({ error: `Cannot execute task in ${task.status} status` });

  // 1. 转为 in_progress
  await transitionTask(id, 'in_progress');

  // 2. 构建 prompt（任务标题 + 描述 + 项目背景）
  let prompt = `# 任务: ${task.title}\n`;
  if (task.description) prompt += `\n## 描述\n${task.description}\n`;
  if (task.type) prompt += `\n## 类型: ${task.type}\n`;

  let systemPrompt: string | undefined;
  if (task.project_id) {
    const ctx = await buildContext(task.project_id);
    if (ctx.project) {
      systemPrompt = `项目: ${ctx.project.name}\n技术栈: ${ctx.project.tech_stack.join(', ')}\n目标: ${ctx.project.goals.join('; ')}`;
    }
  }

  // 3. 确定 engine
  const engineName = engineId || task.assignee_id || 'claude-code';
  const engine = await getEngine(engineName);
  if (!engine) return reply.code(404).send({ error: `Engine not found: ${engineName}` });

  // 4. 启动执行（异步，不阻塞返回）
  const stream = engine.run(prompt, {
    model: undefined,
    workingDir: task.project_id ? (await getProject(task.project_id))?.path : undefined,
    systemPrompt,
  });

  const runId = stream.runId;

  // 关联 trace
  await updateTask(id, { trace_id: runId } as any);

  // 异步消费流，完成后更新任务状态
  (async () => {
    let lastContent = '';
    try {
      for await (const msg of stream) {
        if (msg.type === 'text') lastContent += msg.content;
      }
      await transitionTask(id, 'completed');
      // 回写 output
      await createOutput({
        project_id: task.project_id || undefined,
        source: engineName,
        direction: 'implementation',
        title: `[完成] ${task.title}`,
        content: lastContent || '(无文本输出)',
        tags: [task.type, task.priority],
      });
      // 更新 agent quality
      if (task.assignee_id) {
        const durationMs = Date.now() - new Date(task.started_at || task.created_at).getTime();
        await updateAgentQuality(task.assignee_id, true, durationMs);
      }
    } catch (err) {
      await transitionTask(id, 'failed');
      await createOutput({
        project_id: task.project_id || undefined,
        source: engineName,
        direction: 'analysis',
        title: `[失败] ${task.title}`,
        content: String(err),
        tags: ['error'],
      });
    }
  })();

  return { runId, status: 'in_progress' };
});
```

#### 前端: 任务详情页加"执行"按钮

1. 在转换按钮区域，`pending` 和 `failed` 状态增加 `🚀 执行任务` 按钮
2. 点击后选择 engine（下拉），调用 `api.executeTask(id, engineId)`
3. 返回 runId 后，跳转 Chat 页面查看实时日志（或内嵌 SSE 面板）

#### 前端: 任务看板卡片加快捷执行

1. `pending` 卡片底部加 `Play` 按钮
2. 点击直接用默认 engine 执行（优先用 assignee_id 对应的 engine，否则用 claude-code）

**文件**: `tasks.ts`（后端）+ `TaskDetail.tsx` + `Tasks.tsx`（前端）+ `api.ts`

---

### CORE-03: Agent 分配策略（项目经理推荐）

**问题**: 创建任务时不知道该分配给谁

**方案**:

#### 后端: 新增 `POST /api/tasks/:id/assign-recommend`

```ts
// 推荐最合适的 Agent
fastify.post('/api/tasks/:id/assign-recommend', async (req) => {
  const { id } = req.params as { id: string };
  const task = await getTask(id);
  if (!task) return { error: 'Task not found' };

  // 1. 获取所有在线 Agent
  const agents = await listAgents({ status: 'online' });

  // 2. 如果没有在线的，获取所有 Agent
  const candidates = agents.length > 0 ? agents : await listAgents();

  // 3. 简单打分：项目匹配度 + 能力匹配
  const scored = candidates.map(agent => {
    let score = 0;
    // 项目相关度：当前任务的项目下，该 Agent 有过执行记录
    if (task.project_id && agent.current_project_id === task.project_id) score += 10;
    // 能力匹配：type 匹配 capabilities
    const caps = agent.capabilities || [];
    if (task.type === 'bug' && caps.includes('debugging')) score += 5;
    if (task.type === 'feature' && caps.includes('coding')) score += 5;
    if (task.type === 'review' && caps.includes('review')) score += 5;
    if (task.type === 'analysis' && caps.includes('analysis')) score += 5;
    // 质量分
    const q = agent.quality || {};
    score += (q.successCount || 0) * 0.1;
    return { agent, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return { recommendations: scored.slice(0, 3) };
});
```

#### 前端: 任务详情页显示推荐

1. 在 assignee 区域旁边加"推荐"按钮
2. 点击调用 assign-recommend
3. 展示推荐 Agent 列表，点击选择

**文件**: `tasks.ts` + `agent-registry.ts` + `TaskDetail.tsx` + `api.ts`

---

### CORE-04: Agent 质量追踪接线

**问题**: `updateAgentQuality()` 是死代码

**方案**: 已包含在 CORE-02 中——任务执行完成/失败时自动调用

---

### CORE-05: 外部 Skill API（供 Agent 调用）

**问题**: 外部 Agent（如 OpenClaw）无法通过接口创建/查看/分配任务

**方案**:

#### 后端: 新增 `packages/server/src/routes/skill-api.ts`

```ts
/**
 * Skill API — 供外部 Agent 通过 HTTP 接口操作任务系统
 * 所有端点使用 API Key 认证（Header: X-API-Key）
 */

// POST /api/skill/tasks — 创建任务
// GET  /api/skill/tasks — 查看任务列表（支持过滤）
// GET  /api/skill/tasks/:id — 查看任务详情
// POST /api/skill/tasks/:id/assign — 分配任务给 Agent
// POST /api/skill/tasks/:id/execute — 执行任务
// GET  /api/skill/agents — 查看可用 Agent
// GET  /api/skill/projects — 查看项目列表
// POST /api/skill/outputs — 提交执行结果
```

#### 认证

1. 配置文件 `~/.agent-monitor/config.yaml` 增加 `skillApiKey` 字段
2. 中间件校验 `X-API-Key` header
3. 未配置 Key 时，Skill API 返回 403

#### 外部调用示例

```bash
# OpenClaw Agent 创建任务
curl -X POST http://localhost:3002/api/skill/tasks \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"project_id": "xxx", "title": "修复登录bug", "type": "bug", "priority": "high"}'

# 查看任务
curl http://localhost:3002/api/skill/tasks?status=pending \
  -H "X-API-Key: your-key"

# 分配并执行
curl -X POST http://localhost:3002/api/skill/tasks/:id/execute \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"engineId": "claude-code"}'
```

**文件**: 新建 `skill-api.ts` + 修改 `config.yaml` schema + `index.ts` 注册路由

---

### CORE-06: 会话持久化 — Agent 记忆

**问题**: 每次 spawn Claude/Codex 都是新会话，没有历史上下文

**方案**:

1. Agent 注册时增加 `sessionId` 字段（`registered_agents` 表）
2. ClaudeCodeAdapter 的 `run()` 方法支持 `sessionId` 参数：
   - 有 sessionId → spawn 时加 `--resume <sessionId>`
   - 无 → 正常新建，完成后记录返回的 sessionId
3. 首次执行后，Agent 自动获得记忆——项目背景、之前的操作、遗留问题

```ts
// claude-code.ts run() 中
const args: string[] = [
  '--print',
  '--output-format', 'stream-json',
  '--verbose',
];
if (opts?.sessionId) {
  args.push('--resume', opts.sessionId as string);
}
if (systemPrompt) {
  args.push('--append-system-prompt', systemPrompt);
}
args.push(prompt);
```

4. 结果事件中获取 sessionId：stream-json 的 `system` init 事件包含 `session_id`

**文件**: `claude-code.ts` + DB migration 增加 `session_id` 列

---

## 3. 看板指标设计

### 3.1 项目看板

在项目列表页和项目详情页展示：

| 指标 | 来源 | 说明 |
|------|------|------|
| 总任务数 | `SELECT count(*) FROM tasks WHERE project_id = ?` | 该项目所有任务 |
| 完成率 | completed / total * 100 | 进度百分比 |
| 进行中 | count(in_progress) | 当前活跃任务 |
| 待处理 | count(pending) | 等待执行 |
| 失败数 | count(failed) | 需要关注 |
| 平均完成时间 | avg(completed_at - started_at) WHERE completed | 效率指标 |
| 活跃 Agent 数 | count(DISTINCT assignee_id) WHERE status = in_progress | 投入人力 |
| 最近活动 | max(updated_at) from tasks | 活跃度 |

**前端展示**：

```
┌─ agent-monitor ────────────────────────────────────────────┐
│ PRJ123 · 01 ACTIVE    Tech: React, TypeScript, Fastify     │
│                                                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ TOTAL 12 │ │ DONE  7  │ │ ACTIVE 3 │ │ FAIL  1  │       │
│ │          │ │ 58% ████ │ │          │ │          │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                            │
│ Progress: ████████████░░░░░░░░  58%                        │
│ Avg Time: 2.3h    Active Agents: 2    Last: 5m ago         │
└────────────────────────────────────────────────────────────┘
```

### 3.2 任务看板增强

现有看板增加：

| 指标 | 位置 | 说明 |
|------|------|------|
| 完成率进度条 | 看板顶部 | 总览条 |
| 按项目筛选 | 工具栏 | 下拉选择项目 |
| 按优先级筛选 | 工具栏 | 下拉选择优先级 |
| Agent 负载 | Agent 卡片 | 当前执行中任务数 |
| 卡片增强 | 任务卡片 | 显示项目名、类型标签 |

### 3.3 Agent 面板增强

| 指标 | 来源 | 说明 |
|------|------|------|
| 当前任务 | current_task_id | 正在做什么 |
| 今日完成 | count(completed today) | 产出 |
| 成功率 | successCount / (success+fail) | 质量 |
| 平均耗时 | avgDurationMs | 效率 |
| 项目贡献 | count(DISTINCT project_id) from tasks | 覆盖范围 |

---

## 4. UI 补齐任务

### 4.1 项目模块

#### P8-01: 项目详情 — 编辑 tech_stack/goals/status

**文件**: `packages/ui/src/pages/ProjectDetail.tsx`

- TECH STACK 卡片加 `Edit3` → 编辑态可增删标签
- GOALS 卡片加 `Edit3` → 编辑态可增删目标
- STATUS 加 `<select>` 切换 active/paused/archived
- 保存均调 `api.updateProject(id, { field: value })`

---

#### P8-02: 项目详情 — 添加/删除关系

**文件**: `ProjectDetail.tsx` + `api.ts`

- `api.ts` 新增 `removeRelation` 方法
- RELATIONS 区加 `+ 添加关系` 按钮
- 内联表单：目标项目下拉 + 关系类型 + 描述
- 每行关系加 `Trash2` 删除按钮

---

#### P8-03: 项目列表 — 状态筛选

**文件**: `Projects.tsx`

- 工具栏加按钮组 ALL / ACTIVE / PAUSED / ARCHIVED
- 选中调 `api.listProjects(status)`

---

#### P8-04: 项目详情 — 删除项目

**文件**: `ProjectDetail.tsx`

- telemetry 条加 `Trash2` → confirm → `api.deleteProject` → navigate('/projects')

---

#### P8-05: 项目进度看板

**文件**: `Projects.tsx` + 后端新增 `GET /api/projects/:id/stats`

后端新增统计接口：
```ts
fastify.get('/api/projects/:id/stats', async (req, reply) => {
  const { id } = req.params as { id: string };
  const stats = await queryOne(`
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE status = 'completed') as completed,
      count(*) FILTER (WHERE status = 'in_progress') as active,
      count(*) FILTER (WHERE status = 'pending') as pending,
      count(*) FILTER (WHERE status = 'failed') as failed,
      count(DISTINCT assignee_id) FILTER (WHERE status = 'in_progress') as active_agents,
      avg(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed') as avg_completion_seconds
    FROM tasks WHERE project_id = $1
  `, [id]);
  return stats;
});
```

前端：项目卡片底部显示进度条 + 关键数字

---

### 4.2 Agent 模块

#### P8-06: Agent 列表 — 同步按钮

**文件**: `Agents.tsx`

- filter row 右侧加 `RefreshCw` 按钮
- 点击 → `api.syncAgents()` → `fetchAgents()`
- 同步中 disabled + 旋转

---

#### P8-07: Agent 后端 — DELETE 端点

**文件**: `agents.ts` + `agent-registry.ts`

- `deleteAgent(id)` → DELETE FROM registered_agents
- `DELETE /api/agents/:id` 路由
- `api.ts` 加 `deleteAgent`

---

#### P8-08: Agent 详情 — 删除 Agent

**文件**: `AgentDetail.tsx`

- 返回链接旁加 `Trash2` → confirm → `api.deleteAgent` → navigate('/agents')

---

#### P8-09: Agent 详情 — 显示 capabilities + 负载

**文件**: `AgentDetail.tsx`

- 新增 CAPABILITIES 卡片（`tech-badge` 标签）
- 新增当前任务卡片（如果有 current_task_id，显示任务名 + 链接）
- Quality 卡片数值（依赖 CORE-04 接线后才有真实数据）

---

### 4.3 任务模块

#### P8-10: 任务看板 — 卡片快捷操作

**文件**: `Tasks.tsx`

- pending 卡片加 `Play`（开始执行 + 直接触发 execute）
- in_progress 卡片加 `CheckCircle`（完成）+ `XCircle`（失败）
- 操作按钮外层 `e.preventDefault()` 阻止 Link 导航

---

#### P8-11: 任务看板 — 项目/优先级筛选

**文件**: `Tasks.tsx`

- 工具栏加项目下拉（`api.listProjects()`）+ 优先级下拉
- 选中调 `api.listTasks({ project_id, priority })`

---

#### P8-12: 任务详情 — 编辑 type/priority/assignee

**文件**: `TaskDetail.tsx`

- Type 改为 `<select>`
- Priority 改为 `<select>`
- Assignee 改为 `<select>`（从 `api.listAgents()` 加载，或"推荐"按钮）
- onChange → `api.updateTask`

---

#### P8-13: 任务详情 — 编辑 labels

**文件**: `TaskDetail.tsx`

- labels 区域加 `Edit3` → 编辑态可增删
- 保存调 `api.updateTask(id, { labels })`

---

#### P8-14: 任务详情 — 转换错误提示

**文件**: `TaskDetail.tsx`

- 转换按钮 try/catch
- 失败显示红色错误条

---

#### P8-15: 任务详情 — 执行面板

**文件**: `TaskDetail.tsx`

- pending/failed 状态显示 `🚀 执行任务` 按钮
- 选择 engine → `api.executeTask(id, engineId)`
- 执行后内嵌 SSE 面板显示实时输出（复用 Chat 的 SSE 消费逻辑）
- 或跳转 Chat 页面，自动填入任务 prompt + engine + workingDir

---

## 5. 执行计划

### Phase 8A: 核心链路打通（优先，约 3 天）

| 顺序 | 任务 | 文件 | 依赖 | 估时 |
|------|------|------|------|------|
| A1 | CORE-01: Chat 接入项目上下文 | `chat.ts` + `Chat.tsx` | 无 | 2h |
| A2 | CORE-06: Agent sessionId 支持 | `claude-code.ts` + DB migration | 无 | 1.5h |
| A3 | CORE-02: 任务执行端点 | `tasks.ts` + `api.ts` | A1 | 3h |
| A4 | CORE-04: Agent quality 接线 | `task-manager.ts` | A3 | 0.5h |
| A5 | CORE-03: Agent 分配推荐 | `tasks.ts` + `agent-registry.ts` | A3 | 2h |
| A6 | CORE-05: Skill API | 新建 `skill-api.ts` | A3 | 2h |
| A7 | P8-15: 任务详情执行面板 | `TaskDetail.tsx` | A3 | 2h |
| A8 | P8-10: 看板快捷执行 | `Tasks.tsx` | A3 | 1h |
| A9 | P8-05: 项目进度统计 | 后端 stats + `Projects.tsx` | A3 | 2h |
| — | **验证** | typecheck + build + E2E | A1-A9 | 1h |

**合计约 17 小时**

### Phase 8B: UI 补齐（可并行，约 2 天）

| 顺序 | 任务 | 文件 | 估时 |
|------|------|------|------|
| B1 | P8-01: 项目详情编辑 tech/goals/status | `ProjectDetail.tsx` | 1h |
| B2 | P8-02: 项目详情添加/删除关系 | `ProjectDetail.tsx` + `api.ts` | 1.5h |
| B3 | P8-03: 项目列表状态筛选 | `Projects.tsx` | 0.5h |
| B4 | P8-04: 项目详情删除 | `ProjectDetail.tsx` | 0.5h |
| B5 | P8-06: Agent 同步按钮 | `Agents.tsx` | 0.5h |
| B6 | P8-07+08: Agent DELETE + 详情删除 | 后端 + `AgentDetail.tsx` | 1h |
| B7 | P8-09: Agent 详情 capabilities + 负载 | `AgentDetail.tsx` | 0.5h |
| B8 | P8-11: 任务看板筛选 | `Tasks.tsx` | 0.5h |
| B9 | P8-12: 任务详情编辑 type/priority/assignee | `TaskDetail.tsx` | 1h |
| B10 | P8-13: 任务详情编辑 labels | `TaskDetail.tsx` | 0.5h |
| B11 | P8-14: 转换错误提示 | `TaskDetail.tsx` | 0.5h |
| — | **验证** | typecheck + build + test | 1h |

**合计约 9 小时**

---

## 6. 关键文件索引

| 文件 | 用途 | 涉及任务 |
|------|------|---------|
| `packages/server/src/routes/chat.ts` | Chat SSE 路由 | CORE-01 |
| `packages/server/src/routes/tasks.ts` | 任务路由 | CORE-02/03, P8-10/11/15 |
| `packages/server/src/routes/agents.ts` | Agent 路由 | P8-06/07 |
| `packages/server/src/routes/skill-api.ts` | **新建** Skill API | CORE-05 |
| `packages/server/src/services/task-manager.ts` | 任务服务 | CORE-02/04 |
| `packages/server/src/services/agent-registry.ts` | Agent 服务（quality + 分配） | CORE-03/04 |
| `packages/server/src/services/context-injector.ts` | 项目上下文构建 | CORE-01/02 |
| `packages/server/src/services/agent-output-collector.ts` | Agent 输出收集 | CORE-02 |
| `packages/server/src/adapters/claude-code.ts` | Claude Code 适配器 | CORE-06 |
| `packages/ui/src/pages/Chat.tsx` | Chat 页面 | CORE-01 |
| `packages/ui/src/pages/Tasks.tsx` | 任务看板 | P8-10/11 |
| `packages/ui/src/pages/TaskDetail.tsx` | 任务详情 | P8-12/13/14/15 |
| `packages/ui/src/pages/Projects.tsx` | 项目列表 | P8-03/05 |
| `packages/ui/src/pages/ProjectDetail.tsx` | 项目详情 | P8-01/02/04 |
| `packages/ui/src/pages/Agents.tsx` | Agent 列表 | P8-06 |
| `packages/ui/src/pages/AgentDetail.tsx` | Agent 详情 | P8-08/09 |
| `packages/ui/src/lib/api.ts` | API 客户端 | 多个 |
| `packages/server/src/db/migrations/` | DB schema | CORE-06（加 session_id 列） |

---

## 7. 验收标准

### 核心链路（Phase 8A 验收）

- [x] 在 Chat 页面选择项目后，Agent 回复中体现项目背景信息
- [x] 在任务详情页点击"执行"，Agent 开始执行任务
- [x] 执行完成后，任务自动变为 completed
- [x] 执行失败后，任务自动变为 failed
- [x] Agent 详情页的 quality 数字在任务完成后更新
- [x] 创建任务后，"推荐"按钮能推荐最合适的 Agent
- [x] 外部通过 API Key 调用 Skill API 创建任务成功
- [x] Agent 通过 `--resume` 恢复历史 session 执行任务

### UI 补齐（Phase 8B 验收）

- [x] 项目详情页可编辑 tech_stack、goals、status
- [x] 项目详情页可添加/删除项目关系
- [x] 项目列表页可按状态筛选
- [x] 项目卡片显示任务进度条
- [x] Agent 列表页有同步按钮
- [x] Agent 详情页可删除 Agent
- [x] 任务看板卡片有快捷操作
- [x] 任务看板可按项目/优先级筛选
- [x] 任务详情页 type/priority/assignee 可编辑
- [x] 任务详情页 labels 可编辑

### 全局

- [x] `pnpm typecheck` 通过
- [x] `pnpm build` 通过
- [x] `pnpm test` 现有测试不被破坏

---

## 8. 多引擎集成方案

### 8.1 已验证：Hermes Agent（⏳ 适配器待实施）

**版本**: v0.15.1 | **路径**: `~/.hermes/` | **默认模型**: MiniMax-M3

#### CLI 调用方式（已实测可用）

```bash
# 单次任务（非交互，最常用）
hermes chat -q "任务描述" -Q -t terminal

# 恢复会话（保持上下文）
hermes chat -q "继续任务" -Q --resume <session_id> -t terminal

# 指定模型
hermes chat -q "任务描述" -Q -m anthropic/claude-sonnet-4 -t terminal

# 只用文件工具
hermes chat -q "读取 xxx" -Q -t file

# 禁用 banner（-Q = quiet）
hermes chat -q "任务" -Q -t terminal
```

| 参数 | 说明 |
|------|------|
| `-q "..."` | 单次查询，非交互模式 |
| `-Q` | Quiet 模式，只输出最终结果（程序化调用必须） |
| `-t terminal` | 启用终端工具（执行命令） |
| `-t file` | 只启用文件工具 |
| `--resume <id>` | 恢复历史会话 |
| `-m <model>` | 指定模型 |

#### 实测能力评估

| 能力 | 评分 | 说明 |
|------|------|------|
| 代码编写 | ⭐⭐⭐⭐⭐ | 代码干净、注释清晰 |
| 错误识别 | ⭐⭐⭐⭐⭐ | 能指出 spec 中的错误（如 Agent ID 不是 UUID） |
| 自主性 | ⭐⭐⭐⭐ | 遇到不确定会提方案让选，不瞎做 |
| 验证意识 | ⭐⭐⭐⭐⭐ | 自动跑 tsc、主动说明未验证项 |
| Session 记忆 | ⭐⭐⭐⭐⭐ | 跨 session 记住项目信息 |
| Skill: claude-code | ⭐⭐⭐⭐⭐ | 可委托 Claude Code 读取/编辑文件 |
| Kanban 任务管理 | ⭐⭐⭐⭐ | SQLite 持久化、完整生命周期 |

#### 集成方案

Hermes 作为我们的 Agent 生态成员，通过 **EngineAdapter** 接入：

1. **新建适配器** `packages/server/src/adapters/hermes.ts`
   - `id: 'hermes'`, `label: 'Hermes Agent'`
   - `run()`: spawn `hermes chat -q <prompt> -Q -t terminal`，解析 stdout
   - `run()`: 支持 `--resume` 恢复会话（传入 sessionId）
   - `run()`: 支持 `-m` 切换模型
   - `cancel()`: kill 子进程
   - 输出格式：纯文本（非 stream-json），需要按行读取

2. **Hermes 优势**（vs Claude Code CLI）
   - 内置 Kanban（任务生命周期管理）
   - 内置 Memory（跨会话记忆）
   - 内置 Skill 系统（可委托 Claude Code / Codex）
   - 飞书集成（已配置）
   - 多模型支持（MiniMax / GLM / OpenRouter）

3. **Hermes 劣势**
   - 输出不是 stream-json，无法流式解析 tool_use/tool_result
   - 响应速度依赖 MiniMax 模型（比 Claude 慢）
   - spawn 模式没有结构化输出（纯文本）

### 8.2 ✅ 已完成：Codex CLI

**路径**: `/usr/local/bin/codex` | **默认模型**: o3

#### CLI 调用方式

```bash
# 非交互执行
codex exec "任务描述"

# 指定模型
codex exec -c 'model="o3"' "任务描述"

# 恢复会话
codex exec resume --last
codex exec resume <session_id>

# 代码审查
codex exec review

# 指定工作目录
codex exec --writable-root /path/to/project "任务描述"

# 输出到文件
codex exec -o /tmp/result.txt "任务描述"

# 无状态模式
codex exec --ephemeral "一次性任务"
```

#### 集成方案

1. **新建适配器** `packages/server/src/adapters/codex.ts`
   - `id: 'codex'`, `label: 'Codex'`
   - `run()`: spawn `codex exec <prompt>`，解析输出
   - 支持 `resume` 恢复会话
   - 支持 `--writable-root` 指定工作目录
   - 支持 `-o` 输出到临时文件后读取

2. **Codex 特点**
   - OpenAI 模型（o3 系列），推理能力强
   - 原生沙箱隔离
   - 有 review 模式（代码审查）
   - 输出不是 stream-json，纯文本

### 8.3 待集成：CodeBuddy CLI

**说明**: CodeBuddy 是另一个 AI 编码助手，提供 CLI 接口。具体集成方案待调研。

#### 集成原则

所有引擎适配器统一遵循 `EngineAdapter` 接口（5 方法）：
- `detectInstalled()` — 检测是否安装
- `run(prompt, opts)` — 执行任务，返回 AsyncIterable<EngineMessage>
- `approve(requestId)` — 审批操作
- `cancel(runId)` — 取消执行
- `cost(runId)` — 获取运行指标

### 8.4 EngineAdapter 统一接口扩展

为支持 Hermes / Codex 等新引擎，`EngineAdapter` 接口可能需要小幅扩展：

```ts
interface EngineAdapter {
  id: string;
  label: string;
  installed: boolean;

  detectInstalled(): Promise<boolean>;

  run(prompt: string, opts?: {
    model?: string;
    workingDir?: string;
    systemPrompt?: string;
    sessionId?: string;      // 新增：恢复历史会话
    toolsets?: string[];     // 新增：Hermes 专用 -t 参数
  }): AsyncIterable<EngineMessage> & { runId: string };

  approve(requestId: string): Promise<boolean>;
  cancel(runId: string): Promise<void>;
  cost(runId: string): Promise<RunMetrics | null>;
}
```

---

## 9. 技术决策记录

### 9.1 OpenAI Agents SDK / Codex SDK 评估（2026-06-03）

**结论**：短期不引入，中期借鉴。

| 维度 | 评估 |
|------|------|
| Codex Tool (`codexTool()`) | ✅ 内置 thread 复用 + 丰富事件流，但只管 Codex 不管 Claude |
| Agent as Tool (`agent.asTool()`) | ✅ 好的编排模式，可借鉴到项目经理 Agent |
| 结构化输出 (Zod) | ✅ 参考思路，给任务结果定义标准格式 |
| 绑定 OpenAI 模型 | ❌ Agent "大脑"必须用 gpt-5.4，与我们多模型策略冲突 |
| Experimental 标签 | ❌ `@openai/agents-extensions/experimental/codex` API 不稳定 |
| Python SDK | ❌ 我们是 TypeScript 项目，不适用（JS/TS 版可考虑） |

**Phase 9+ 可考虑**：用 `codexTool()` 优化 Codex 适配器，用 `agent.asTool()` 模式优化项目经理编排。

---

## 10. 不做的事（本期范围外）

- ❌ 项目经理 Agent 作为独立 daemon 常驻（二期）
- ❌ 多 Agent 并行执行子任务（二期）
- ❌ 细分角色（前端/后端/测试/审查）（二期）
- ❌ 分页（当前数据量不需要）
- ❌ 拖拽排序看板
- ❌ 批量操作
- ❌ 导入/导出
- ❌ 实时 WebSocket 推送
- ❌ context_packs 孤儿表清理
- ❌ reviewer_id 接线（无审阅场景）
