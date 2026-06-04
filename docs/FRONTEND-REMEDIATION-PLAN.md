# 前端整改方案

> 日期：2026-06-04
> 来源：`docs/FRONTEND-FUNCTIONAL-LAYOUT-REVIEW.md`
> 范围：只覆盖功能与布局整改，不覆盖视觉风格重做。
> 目标：把当前“功能台账式前端”整改为可支撑个人 AI Agent 驾驶舱核心闭环的工作台。

## 1. 总目标

当前前端已经能开始使用，但闭环不完整。整改目标不是再加几个孤立页面，而是把这些关键链路接起来：

```text
Project
  -> Task
  -> Agent / Blueprint Run
  -> ExecutionTrace
  -> Artifact
  -> Review / Inbox
  -> Task State / Handoff
```

整改完成后，用户应能做到：

- 打开 Dashboard 或 Inbox，就知道现在最需要处理什么。
- 打开一个项目，就能看到任务、Agent 会话、蓝图运行、Trace、Artifact、记忆和上下文。
- 打开一个失败任务，就能追溯到输出、工具调用、文件变更、测试结果、成本和错误原因。
- 对任务产物进行接受或退回，退回后任务状态自动回流。
- 监督真实 Agent 会话，能 peek、跳转、回复、暂停或终止。

## 2. 整改原则

1. **闭环优先，不堆页面**
   每个新增页面都必须连接至少一个主流程。只展示数据、不驱动动作的页面延后。

2. **先修断链，再做增强**
   `/traces/:taskId` 目前已有链接但无路由，这是最高优先级。

3. **Inbox 是用户注意力入口**
   所有需要用户介入的事项都应能在 Inbox 中理解上下文并完成动作。

4. **项目详情是项目级 cockpit**
   项目页不能只管元数据，要承接任务、会话、产物、Trace、记忆和 Git 状态摘要。

5. **Chat 保持辅助入口**
   Chat 可用于临时对话，但不能重新变成主产品入口。能沉淀的内容要回到 Task / Trace / Memory / Artifact。

## 3. 阶段规划

### Phase 0：前置整理与数据契约确认

目标：确认前端整改依赖的 API 是否已经存在，避免前端先写死 mock。

任务：

- 梳理 `api.ts` 中已有接口：
  - traces
  - inbox
  - tasks
  - outputs
  - agents
  - blueprints
  - scheduler
  - project context
- 对照后端路由确认缺口：
  - Artifact 是否已有独立数据模型。
  - AgentSession 是否已有独立 API。
  - Inbox 是否只有 resolve，是否支持类型化动作。
  - Trace 是否返回足够字段展示工具调用、文件变更和指标。
- 输出一张“前端页面 -> API -> 数据字段 -> 缺口”的表。

验收：

- 明确哪些整改只需前端实现。
- 明确哪些整改需要后端补 API。
- 不再把缺失能力伪装成前端静态按钮。

建议文件：

- `docs/FRONTEND-API-CONTRACT-GAP.md`

## 4. Phase 1：补齐 ExecutionTrace 路由和详情页

优先级：P0

原因：这是当前最明显的功能断链。任务详情和 Agent 详情已经链接到 `/traces/:taskId`，但路由不存在。

### 4.1 功能整改

新增页面：

- `packages/ui/src/pages/TraceList.tsx`
- `packages/ui/src/pages/TraceDetail.tsx`

修改：

- `packages/ui/src/App.tsx`
  - 增加 `/traces`
  - 增加 `/traces/:taskId`
- `packages/ui/src/components/Layout.tsx`
  - 可选：导航增加“轨迹”入口；如果担心导航太多，可先只从任务/Agent 详情进入。

TraceDetail 首版字段：

- 基本信息：任务名、状态、项目、Agent、开始时间、完成时间。
- 执行摘要：错误原因、最终输出摘要。
- 成本指标：input tokens、output tokens、TTFT、output TPS、estimated model TPS、tool latency、agent steps。
- 时间线：状态变化、Agent 输出、工具调用、测试结果。
- 关联对象：任务、项目、Agent、Inbox、Artifact、Memory。

### 4.2 布局整改

推荐结构：

```text
TraceDetail
├── Header: task title / status / cost / duration
├── Main split
│   ├── Left: execution timeline
│   └── Right: metrics / files / tests / related memory / error
└── Bottom: raw events or debug payload
```

### 4.3 验收标准

- 从 TaskDetail 的关联轨迹点击后，不会跳回首页。
- 从 AgentDetail 的最近执行记录点击后，能打开对应 Trace。
- 失败任务能在 Trace 页看到失败原因。
- 成本指标至少能展示已有字段，缺失字段显示 `--`，不能让页面崩。
- `pnpm --prefix packages/ui typecheck` 通过。
- `pnpm --prefix packages/ui build` 通过。

## 5. Phase 2：重做 Inbox 为统一介入工作台

优先级：P0

原因：Inbox 当前只能 resolve，不能完成真实介入。它应该是用户回来后处理所有断点的地方。

### 5.1 功能整改

重构：

- `packages/ui/src/pages/Inbox.tsx`

新增能力：

- 按类型筛选：
  - all
  - decision_required
  - permission_request
  - blocked_task
  - review_request
  - failed_task
  - handoff_needed
- 按优先级排序：
  - urgent
  - high
  - medium
  - low
- 选中事项详情面板。
- 类型化动作。

类型化动作建议：

| 类型 | 必备动作 | 关联入口 |
|------|----------|----------|
| `decision_required` | approve / reject / open task | Task / Blueprint Run |
| `permission_request` | allow once / deny | Trace / Task |
| `blocked_task` | open task / retry / create handoff | Task / Trace |
| `review_request` | open artifact / accept / request changes | Artifact |
| `failed_task` | open trace / retry / create handoff | Trace / Task |
| `handoff_needed` | open summary / assign agent | Task / Agent |

如果后端暂时只有 `resolveInbox`，前端首版可以：

- 已有动作真实调用已有接口。
- 缺后端支持的动作先禁用，并标注“API missing”到开发态提示。
- 不要把缺失动作伪装成成功。

### 5.2 布局整改

推荐结构：

```text
Inbox
├── Top filters: status / type / priority
├── Left list: sorted pending items
└── Right detail
    ├── title / type / priority
    ├── project / task / agent / trace / artifact links
    ├── context summary
    └── action bar
```

### 5.3 验收标准

- 用户不用离开 Inbox 就能判断事项来源和下一步动作。
- `failed_task` 能打开 Trace。
- `review_request` 能打开 Artifact 或显示“Artifact API missing”。
- `blocked_task` 能打开任务并支持重试或交接入口。
- 空状态仍保留，但不影响筛选状态显示。

## 6. Phase 3：建立 Artifact Review 闭环

优先级：P0

原因：当前 Outputs 只能看输出，不能审查产物。任务完成后没有“验收/退回”的产品闭环。

### 6.1 数据与后端依赖

需要先确认后端是否已有 Artifact 表或等价模型。如果没有，建议后端新增最小模型：

```text
Artifact
  id
  project_id
  task_id
  agent_id
  type
  title
  content
  source_output_id
  git_branch
  git_commit
  git_diff
  status: draft | submitted | accepted | rejected
  review_comment
  created_at
  updated_at
```

最小 API：

- `GET /api/artifacts`
- `GET /api/artifacts/:id`
- `POST /api/artifacts`
- `POST /api/artifacts/:id/submit`
- `POST /api/artifacts/:id/accept`
- `POST /api/artifacts/:id/reject`

### 6.2 前端整改

方案 A：新增独立页面。

- `packages/ui/src/pages/Artifacts.tsx`
- `packages/ui/src/pages/ArtifactDetail.tsx`

方案 B：把 Outputs 升级为 Artifacts & Outputs。

建议选择方案 A。Outputs 保留为原始输出流，Artifacts 承接可审查产物。

功能：

- Artifact 列表按项目、任务、类型、状态筛选。
- 详情页展示内容、来源、关联任务、关联 Trace、关联 Git 信息。
- 支持 Submit / Accept / Reject / Request changes。
- Reject 后回写任务状态或创建 Inbox item。

### 6.3 布局整改

列表页：

```text
Artifacts
├── filter bar: project / status / type / source
└── dense list or table: status / title / task / agent / updated_at / actions
```

详情页：

```text
ArtifactDetail
├── Header: title / status / task / project
├── Left: artifact content or diff preview
└── Right: review actions / comments / source trace / metadata
```

### 6.4 验收标准

- 任务完成后能关联至少一个 Artifact 或结果摘要。
- Artifact 可从 submitted 变为 accepted。
- Artifact 可 rejected，并产生清晰后续动作。
- Inbox 的 review_request 能跳到 ArtifactDetail。

## 7. Phase 4：补 Agent Session 监督层

优先级：P0

原因：当前 Agent 页面展示的是逻辑 Agent，不是会话监督。SPEC 要的是“看到所有后台 Agent 正在做什么”。

### 7.1 后端依赖

确认是否已有 AgentSession 数据。如果没有，需要最小会话模型：

```text
AgentSession
  id
  platform
  agent_id
  project_id
  task_id
  status: running | waiting_user | completed | failed | idle
  last_output
  source_ref
  can_reply
  can_pause
  can_stop
  started_at
  last_interaction_at
```

最小 API：

- `GET /api/agent-sessions`
- `GET /api/agent-sessions/:id`
- `POST /api/agent-sessions/:id/reply`
- `POST /api/agent-sessions/:id/pause`
- `POST /api/agent-sessions/:id/stop`

### 7.2 前端整改

新增或重构：

- 在 `Agents.tsx` 增加 Tab：
  - Agents
  - Sessions
- 或新增 `AgentSessions.tsx`，路由 `/agent-sessions`。

推荐先在 Agents 页面加 Tab，避免导航膨胀。

功能：

- 展示 running / waiting_user / failed / completed 会话。
- waiting_user 高亮。
- 选中会话后展示最近输出、工具调用、文件变更摘要。
- 支持跳转到 Task、Trace、Artifact。
- 支持 reply / pause / stop，缺后端能力时禁用并明确标注。

### 7.3 布局整改

```text
Agent View
├── Top: Runtime / Agent / Session tabs
├── Left: sessions grouped by status
├── Center: live output / tool calls
└── Right: task / project / trace / artifact / actions
```

### 7.4 验收标准

- running 会话可见。
- waiting_user 会话高亮并进入 Inbox。
- 会话可跳到 Task 和 Trace。
- AgentDetail 保留质量指标，但不再承担所有监督能力。

## 8. Phase 5：升级项目详情为项目级 cockpit

优先级：P1

原因：项目详情现在偏元数据，用户处理一个项目时需要在多个全局页面之间跳转。

### 8.1 功能整改

重构：

- `packages/ui/src/pages/ProjectDetail.tsx`

新增摘要区：

- 项目健康概览：
  - pending inbox
  - running tasks
  - failed tasks
  - submitted artifacts
  - active blueprint runs
- 任务摘要：
  - 状态统计
  - 最近任务
  - 新建任务入口
- Agent 会话摘要：
  - running / waiting_user
  - 当前 Agent
- Blueprint Run 摘要：
  - 最近运行
  - 定时任务
- Trace 摘要：
  - 最近失败
  - 成本异常
- Artifact 摘要：
  - 待审查
  - 最近完成
- Context Pack / Memory：
  - 关键目标
  - 技术栈
  - 最近决策
  - 固定记忆
- Git / Worktree：
  - 当前分支
  - dirty 状态
  - 任务 worktree 列表

### 8.2 布局整改

推荐结构：

```text
ProjectDetail
├── Header: name / path / status / actions
├── Health strip: inbox / running / failed / review / risk
├── Main grid
│   ├── Tasks
│   ├── Agent Sessions
│   ├── Blueprint Runs
│   ├── Artifacts
│   ├── ExecutionTrace
│   └── Memory / Context Pack
└── Advanced: relations / metadata / git
```

### 8.3 验收标准

- 打开项目详情能判断该项目现在是否需要处理。
- 项目详情能跳到任务、Trace、Artifact、Agent 会话、Blueprint。
- 项目元数据编辑能力仍保留，但不占据第一优先级。

## 9. Phase 6：强化 Dashboard 为处理队列

优先级：P1

原因：Dashboard 当前偏统计，应该更明确地告诉用户“今天要处理什么”。

### 9.1 功能整改

重构：

- `packages/ui/src/pages/Dashboard.tsx`

新增区块：

- 待我处理：
  - pending Inbox
  - waiting_user sessions
  - submitted artifacts
- 正在运行：
  - running tasks
  - running blueprint runs
  - busy agents
- 风险与失败：
  - failed tasks
  - failed blueprint runs
  - cost abnormal traces
- 最近完成：
  - completed tasks
  - accepted artifacts

统计卡保留，但放到次级区域。

### 9.2 布局整改

```text
Dashboard
├── Attention queue
├── Running now
├── Failed / blocked
├── Recently completed
└── System stats
```

### 9.3 验收标准

- 用户打开首页能在 5 秒内知道下一步该点哪里。
- 每条队列项都能跳到对应详情页。
- 不再只展示数量，不给处理路径。

## 10. Phase 7：Blueprint Studio 表单化和运行态增强

优先级：P1

原因：当前 Blueprint 能搭，但容易配置错，运行反馈弱。

### 10.1 功能整改

重构：

- `packages/ui/src/pages/BlueprintStudio.tsx`

新增：

- 节点字段级配置表单。
- JSON 高级模式保留，但默认收起。
- Agent 节点选择真实 Agent/Engine，不默认 `mock`。
- 运行前校验：
  - 蓝图名称不能为空。
  - 至少一个入口节点。
  - 不能有孤立节点。
  - Agent 节点必须配置 adapter 或 agent。
  - Condition 节点必须配置表达式。
  - Approval 节点必须配置审批策略。
- 运行状态叠加到画布节点。
- 运行失败时点击节点打开错误详情。

### 10.2 布局整改

```text
BlueprintStudio
├── Top toolbar: save / validate / run / schedule / history
├── Left palette
├── Center canvas
└── Right config panel
    ├── Basic fields
    ├── Node-specific fields
    ├── Validation errors
    └── Advanced JSON
```

### 10.3 验收标准

- 用户不写 JSON 也能配置常见节点。
- 创建新 Agent 节点时不会默认跑 mock。
- 运行失败能定位到具体节点。
- 运行历史能跳 Trace。

## 11. Phase 8：性能与路由级拆包

优先级：P2

原因：当前 UI build 通过，但主 JS chunk 约 576 kB，超过 Vite 默认建议值。随着 Trace、Artifact、Agent Session 页面加入，必须拆包。

### 11.1 整改内容

- 对重页面使用 `React.lazy`：
  - BlueprintStudio
  - Chat
  - TraceDetail
  - ArtifactDetail
  - Agent Sessions
- 对 `@xyflow/react` 单独分 chunk。
- 移除 Dashboard 里对 `api.ts` 的动态 import，因为同文件已经被大量静态 import，当前动态 import 不会产生有效拆包。

### 11.2 验收标准

- `pnpm --prefix packages/ui build` 通过。
- Vite 主 chunk 告警消失，或主 chunk 明显下降。
- 首屏 Dashboard 不加载 ReactFlow。

## 12. 推荐排期

### Sprint 1：修断链和注意力入口

目标：先让系统可追溯、可介入。

任务：

1. Phase 0 API 契约确认。
2. Phase 1 TraceList / TraceDetail。
3. Phase 2 Inbox 分栏和类型化动作首版。

交付标准：

- 从任务失败到 Trace 详情完整可打开。
- 从 Inbox 能处理或跳转到所有 pending 事项。

### Sprint 2：产物审查和会话监督

目标：把任务结果和 Agent 运行状态接起来。

任务：

1. Phase 3 Artifact Review。
2. Phase 4 Agent Session 监督。

交付标准：

- 任务完成后有 Artifact 可审查。
- 用户能看到真实 running / waiting_user 会话。

### Sprint 3：项目 cockpit 和首页处理队列

目标：减少跨页面跳转，把工作流聚合到项目和首页。

任务：

1. Phase 5 ProjectDetail cockpit。
2. Phase 6 Dashboard attention queue。

交付标准：

- 打开项目页能处理该项目主要事项。
- 打开首页能明确下一步。

### Sprint 4：蓝图体验和性能收口

目标：提升自动化编排可用性，降低首屏负担。

任务：

1. Phase 7 Blueprint Studio 表单化。
2. Phase 8 路由级拆包。

交付标准：

- 蓝图不依赖手写 JSON 完成常见配置。
- 首屏不加载重模块。

## 13. 风险与依赖

### 13.1 后端能力风险

Artifact、AgentSession、Inbox 类型化动作可能需要后端补模型和路由。前端整改前应先明确 API 契约。

处理方式：

- 前端先做页面骨架和已有能力接入。
- 缺失能力用禁用按钮和开发态提示表达，不做假成功。
- 后端补齐后再打开动作。

### 13.2 数据字段不稳定风险

Trace、runtime metrics、Agent presence 字段可能还在变化。

处理方式：

- 前端渲染用容错字段读取。
- 缺字段显示 `--`。
- 不因某个指标缺失导致页面崩溃。

### 13.3 页面复杂度膨胀风险

ProjectDetail、Dashboard、Inbox 都可能变成信息过载页面。

处理方式：

- 优先展示“需要动作”的内容。
- 摘要区只展示最近和最重要的 3-5 条。
- 详细列表放到对应详情页。

## 14. 验证计划

每个阶段至少执行：

```bash
pnpm --prefix packages/ui typecheck
pnpm --prefix packages/ui build
```

涉及后端联调时执行：

```bash
pnpm typecheck
pnpm test
```

浏览器验收建议：

- Dashboard 首屏加载。
- Inbox 空状态和有数据状态。
- TaskDetail 执行任务并跳 Trace。
- AgentDetail 点击最近执行记录。
- Artifact accept / reject。
- ProjectDetail 聚合摘要。
- Blueprint 新建、校验、运行、失败定位。

## 15. 最小可交付版本

如果时间有限，最小整改版本只做这四件事：

1. TraceDetail 接住 `/traces/:taskId`。
2. Inbox 改成分栏，并能跳 Task / Trace。
3. Outputs 或新增 Artifact 页支持 submitted / accepted / rejected。
4. Agent 页面增加 Sessions Tab，至少展示 running / waiting_user / failed。

这四件事做完，前端才从“能看”变成“能管”。

## 16. 成功标准

最终整改完成后，用下面 6 个问题验收：

1. 失败任务为什么失败，用户能在 2 次点击内看到吗？
2. 用户回来后，是否只看 Inbox 就知道该做什么？
3. 任务完成后，有没有可审查、可接受、可退回的产物？
4. 后台 Agent 正在做什么，是否能统一监督？
5. 某个项目的当前状态，是否能在项目详情页一次看清？
6. 蓝图运行卡在哪个节点，是否能直接定位？

如果这 6 个问题都能回答，前端才算满足 Agent Monitor 的核心使用需求。
