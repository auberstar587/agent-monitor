# QA 修复报告 — 复测清单

> 修复日期: 2026-05-31
> 修复范围: QA-REPORT.md 中 P0/P1 Bug + REQ 功能补全
> 当前状态: 部分命令已复测，UI/API 端到端仍待复测

---

## 当前复测结论

| 项目 | 结果 | 说明 |
|------|------|------|
| `npm run typecheck` | ✅ 通过 | server + ui TypeScript 均通过 |
| `npm run build` | ✅ 通过 | Vite 有 chunk size warning，不阻断构建 |
| `npm test` | ❌ 未通过 | 测试文件使用 `node:test`，当前运行器为 Vitest |

当前不能继续写“Phase 1-5 全部完成”。准确口径是：v2 功能骨架已实施，正在集成验证与 QA 收口。

---

## 批次 1 — P0 阻断级（必须通过）

### TC-001: 前端构建正常

**修复**: BUG-001 (BlueprintStudio Fragment 包裹) + BUG-002 (pnpm-workspace.yaml)

**复测步骤**:
```bash
cd /Users/hanyongfeng/AI/agent-monitor
pnpm typecheck       # 应无 TypeScript 错误
pnpm --filter @agent-monitor/ui build  # 应构建成功
```

**当前结果**: 根命令 `npm run typecheck` 与 `npm run build` 均已通过。构建时 Vite 提示主 chunk 超过 500 kB，暂不阻断。

**预期**: 两命令均无错误退出

---

### TC-002: 定时调度列表正常

**修复**: BUG-003 (scheduleBlueprint 增加 status='active')

**复测步骤**:
```bash
# 1. 创建一个蓝图
BP=$(curl -s -X POST http://localhost:3002/api/blueprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"复测蓝图","nodes":[{"id":"n1","type":"agent","name":"Agent","config":{"adapter":"mock","prompt_template":"test"}}],"edges":[]}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. 设置定时
curl -s -X POST http://localhost:3002/api/scheduler \
  -H 'Content-Type: application/json' \
  -d "{\"blueprint_id\":\"$BP\",\"cron\":\"0 */6 * * *\"}" | python3 -m json.tool

# 3. 列表应返回该任务
curl -s http://localhost:3002/api/scheduler | python3 -m json.tool
```

**预期**: 步骤 3 返回的数组包含步骤 2 创建的调度任务，`nextRun` 非空，`status` 为 `active`

---

### TC-003: 记忆重要度标签正常显示

**修复**: BUG-004 (index.css 添加 `.importance-high`)

**复测步骤**:
```bash
# 1. 创建一条重要记忆
curl -s -X POST http://localhost:3002/api/memory \
  -H 'Content-Type: application/json' \
  -d '{"type":"decision","content":"重要架构决策记录","importance":8}'

# 2. 打开前端 http://localhost:5173/memory
```

**预期**: 重要记忆条目显示 `重要 8/10` 标签，背景色为黄色（warning），有边框

---

## 批次 2 — P1 功能漏洞

### TC-004: UUID 非法参数返回 400

**修复**: BUG-005 (5 个路由文件增加 requireUUID)

**复测步骤**:
```bash
curl -s http://localhost:3002/api/projects/nonexistent-id
curl -s http://localhost:3002/api/blueprints/nonexistent-id
curl -s http://localhost:3002/api/memory/nonexistent-id
curl -s http://localhost:3002/api/traces/nonexistent-id
```

**预期**: 每个请求返回 `{"error":"invalid id format"}`，状态码 400（不是 500）

---

### TC-005: Dashboard 输出方向标签中文

**修复**: BUG-006 (Dashboard 内联翻译)

**复测步骤**: 打开 http://localhost:5173/，查看"最近输出"区域

**预期**: direction 列显示中文（分析/实现/决策/审查/提问），不是英文原始值

---

### TC-006: Inbox 类型标签完整

**修复**: BUG-007 (Inbox 增加 approval/handoff_needed 标签)

**复测步骤**: 打开 http://localhost:5173/inbox

**预期**: 所有 inbox 条目类型显示中文（任务失败/任务阻塞/需要决策/审查请求/审批请求/需要交接）

---

### TC-007: 蓝图节点可删除

**修复**: BUG-008 (Delete 键 + 配置面板删除按钮)

**复测步骤**:
```bash
# 1. 创建一个含多节点的蓝图
curl -s -X POST http://localhost:3002/api/blueprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"删除测试","nodes":[{"id":"a","type":"agent","name":"Agent A","config":{"adapter":"mock"}},{"id":"b","type":"summary","name":"汇总","config":{}}],"edges":[]}' > /dev/null
```

2. 打开 http://localhost:5173/blueprints → 点击蓝图 → DAG 编辑器
3. 点击选中一个节点 → 按 `Delete` 键
4. 点击另一个节点 → 在右侧配置面板点击 🗑️ 按钮

**预期**: 两种方式都能删除节点，关联的边也自动移除

---

### TC-008: 蓝图保存持久化节点编辑

**修复**: BUG-009 (PUT /api/blueprints/:id/nodes 端点)

**复测步骤**:
1. 打开 http://localhost:5173/blueprints → 打开已有蓝图
2. 在画布上拖动节点改变位置
3. 点击「保存」按钮
4. 刷新页面

**预期**: 节点位置、名称、配置在刷新后保持不变

---

## 批次 3 — 错误处理

### TC-009: 前端错误边界

**修复**: BUG-010 (ErrorBoundary)

**复测步骤**:
1. 打开浏览器控制台
2. 在页面中制造一个渲染错误（如访问 `null.props`）
3. 观察页面行为

**预期**: 页面不会白屏，显示错误提示 + "重新加载"按钮

---

## 功能补全 — REQ

### TC-010: 会议创建 + 执行

**修复**: REQ-001

**复测步骤**:
```bash
curl -s -X POST http://localhost:3002/api/meetings \
  -H 'Content-Type: application/json' \
  -d '{"title":"架构评审","participants":["PM-张三","Dev-李四","QA-王五"],"rounds":2,"consensus_rule":"majority"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])"

# 执行
curl -s -X POST http://localhost:3002/api/meetings/<ID>/start | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"状态: {d['status']}\\n结果: {d['result']}\\n消息数: {len(d['messages'])}\")"
```

**预期**: 状态 `completed`，`共识` 结果明确，消息数 = participants × rounds

---

### TC-011: 蓝图定时面板

**修复**: REQ-003

**复测步骤**:
1. 打开 http://localhost:5173/blueprints → 打开一个蓝图
2. 点击工具栏「定时」按钮
3. 输入 cron 表达式（如 `0 */2 * * *`）
4. 点击「设置定时」
5. 返回蓝图列表

**预期**: 工具栏显示绿色「已定时」标识，列表页面该蓝图显示 🕐 定时图标

---

### TC-012: 测试套件通过

**修复**: REQ-004

**复测步骤**:
```bash
npm test
```

**当前结果**: ❌ 未通过。`assessRisk` 用例本身执行通过，但 Vitest 报告 `blueprint-engine.test.ts` 和 `decision-engine.test.ts` 没有 Vitest suite。

**下一步**: 将 server 测试从 `node:test` + `node:assert` 改为 Vitest API，或调整测试脚本使用 Node test runner。建议统一到 Vitest。

---

### TC-013: 项目编辑（PUT /api/projects/:id）

**修复**: Phase A - project-registry.ts + routes/projects.ts

**复测步骤**:
```bash
# 1. 获取一个项目 ID
PID=$(curl -s http://localhost:3002/api/projects | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")

# 2. 编辑名称
curl -s -X PUT "http://localhost:3002/api/projects/$PID" \
  -H 'Content-Type: application/json' \
  -d '{"name":"新项目名称","description":"新的描述"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'名称: {d[\"name\"]} / 描述: {d[\"description\"]}')"

# 3. 打开前端 → 点击项目卡片进入详情页
```

**预期**: 名称和描述更新成功，前端详情页显示最新值

---

### TC-014: Agent 持久化 + 同步

**修复**: Phase B - agent-registry.ts + routes/agents.ts

**复测步骤**:
```bash
# 1. 查看已同步的 Agent 列表
curl -s http://localhost:3002/api/agents | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'{a[\"name\"]} [{a[\"platform\"]}] {a[\"status\"]}') for a in d]"

# 2. 查看 Agent 详情（含质量指标 + 轨迹）
curl -s http://localhost:3002/api/agents/agent_nox | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"name\"]} quality={d.get(\"quality\",{})} traces={len(d.get(\"traces\",[]))}')"

# 3. 编辑 Agent 名称
curl -s -X PUT http://localhost:3002/api/agents/agent_nox \
  -H 'Content-Type: application/json' \
  -d '{"name":"Nox-编辑测试"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'new name: {d[\"name\"]}')"
```

**预期**: Agent 列表返回数据、详情展示质量指标、名称可编辑

---

### TC-015: Agent 详情页

**复测步骤**: 打开 http://localhost:5173/agents → 点击任意 Agent 卡片

**预期**: 
- 顶部显示 name（可编辑）+ platform badge + status pill + role（可编辑）
- 4 个质量卡片：总执行次数、成功率、成功次数、失败次数
- 底部最近执行记录列表

---

### TC-016: 任务创建

**修复**: Phase C - task-manager.ts + routes/tasks.ts

**复测步骤**:
```bash
# 1. 创建多个不同优先级的任务
curl -s -X POST http://localhost:3002/api/tasks -H 'Content-Type: application/json' \
  -d '{"title":"紧急BUG修复","priority":"urgent","type":"bug"}'
curl -s -X POST http://localhost:3002/api/tasks -H 'Content-Type: application/json' \
  -d '{"title":"新功能开发","priority":"high","type":"feature"}'
curl -s -X POST http://localhost:3002/api/tasks -H 'Content-Type: application/json' \
  -d '{"title":"日常维护","priority":"low"}'

# 2. 列出任务
curl -s http://localhost:3002/api/tasks | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} tasks'); [print(f'  [{t[\"status\"]}][{t[\"priority\"]}] {t[\"title\"]}') for t in d]"

# 3. 按状态筛选
curl -s "http://localhost:3002/api/tasks?status=pending" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} pending tasks')"
```

**预期**: 任务创建成功，列表按优先级排序，筛选正确

---

### TC-017: 任务状态流转

**修复**: Phase C - transitionTask()

**复测步骤**:
```bash
# 1. 创建一个任务并获取 ID
TID=$(curl -s -X POST http://localhost:3002/api/tasks -H 'Content-Type: application/json' \
  -d '{"title":"流转测试"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. pending → in_progress
curl -s -X POST "http://localhost:3002/api/tasks/$TID/transition" \
  -H 'Content-Type: application/json' \
  -d '{"status":"in_progress"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'状态: {d[\"status\"]}')"

# 3. in_progress → completed
curl -s -X POST "http://localhost:3002/api/tasks/$TID/transition" \
  -H 'Content-Type: application/json' \
  -d '{"status":"completed"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'状态: {d[\"status\"]}')"

# 4. 尝试非法流转（completed → in_progress，应报错）
curl -s -X POST "http://localhost:3002/api/tasks/$TID/transition" \
  -H 'Content-Type: application/json' \
  -d '{"status":"in_progress"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'错误: {d.get(\"error\",\"无错误\")}')"
```

**预期**: 流转路径 p→ip→c 正常，completed→in_progress 返回 error

---

### TC-018: 任务看板页面

**复测步骤**: 打开 http://localhost:5173/tasks

**预期**: 
- 按状态分列展示（待处理 / 进行中 / 已完成 / 失败 / 已取消）
- 每列显示任务卡片（标题 + 优先级标签）
- 可创建任务（展开表单）
- 点击任务卡片跳转详情页

---

### TC-019: 任务详情页

**复测步骤**: 打开 http://localhost:5173/tasks → 点击一个任务

**预期**:
- 标题可编辑 + status pill + priority badge
- 状态流转按钮（根据当前状态显示有效操作）
- description 可编辑
- 元数据网格：type/assignee/创建时间/开始时间/完成时间
- 有关联 trace 时展示执行轨迹链接

---

### TC-020: 导航完整性

**复测步骤**: 打开 http://localhost:5173/

**预期**: 侧边栏导航包含 8 项：总览 / 项目 / Agents / 输出 / 记忆 / 收件箱 / 蓝图 / 任务

---

## 修复总结

| 优先级 | 编号 | 修复内容 | 测试用例 | 状态 |
|--------|:----:|---------|:--------:|:----:|
| **P0** | BUG-001 | BlueprintStudio 编译修复 | TC-001 | ✅ typecheck/build 已通过 |
| **P0** | BUG-002 | pnpm-workspace.yaml | TC-001 | ✅ typecheck/build 已通过 |
| **P0** | BUG-003 | Scheduler 列表为空 | TC-002 | 🔲 |
| **P0** | BUG-004 | importance-high CSS 缺失 | TC-003 | 🔲 |
| **P1** | BUG-005 | UUID 校验 | TC-004 | 🔲 |
| **P1** | BUG-006 | Dashboard 翻译 | TC-005 | 🔲 |
| **P1** | BUG-007 | Inbox 标签缺失 | TC-006 | 🔲 |
| **P1** | BUG-008 | 蓝图节点无法删除 | TC-007 | 🔲 |
| **P1** | BUG-009 | 蓝图保存不持久化 | TC-008 | 🔲 |
| **P1** | BUG-010 | 前端无错误边界 | TC-009 | 🔲 |
| **REQ** | 001 | 会议调用 LLM | TC-010 | 🔲 |
| **REQ** | 003 | 前端调度界面 | TC-011 | 🔲 |
| **REQ** | 004 | 测试覆盖 | TC-012 | ❌ 测试运行器不一致 |

---

## 不在此次修复范围

| 编号 | 原因 |
|:----:|------|
| BUG-011 (socket.io 未使用) | 包已存在，删除可能影响后续，待专项清理 |
| UX-001 (alert 改 toast) | 需引入 sonner 库，独立任务 |
| UX-002~004 (Agent/Output/Project 增强) | 功能扩展，非 bug 修复 |
| REQ-002 (claude-code CLI) | 已实现但需本地有 claude-code CLI 才能复测 |
| DATA-001 (重复数据) | 需手动清洗数据库 |
