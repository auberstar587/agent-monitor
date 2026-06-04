# 前端功能与布局评审

> 日期：2026-06-04
> 范围：仅评估 `packages/ui` 的功能覆盖、信息架构和页面布局，不评价视觉风格。
> 依据：`SPEC.md` v2.3.8、`docs/AGENT-SYSTEM-REDESIGN.md`、当前前端源码。

## 1. 结论

当前前端已经具备“个人 AI 工具驾驶舱”的基础形态：项目、Agent、任务、输出、记忆、Inbox、蓝图、对话都已有页面，任务能创建、分配、执行，蓝图能编辑、运行、定时，记忆和输出也有可用的列表与筛选。

但它还没有达到完整可用的 P0 闭环。主要问题不是页面不够多，而是几个关键工作流没有串起来：

- ExecutionTrace 有 API 和入口链接，但没有前端路由与详情页，用户点执行轨迹会回到首页。
- Artifact Review 仍被“输出列表”替代，没有提交、接受、退回、关联 diff/commit 的审查闭环。
- Inbox 只能“处理/resolve”，不能在同一处完成审批、重试、跳转、交接、审查。
- Agent View 只展示 Agent 实体和当前任务，缺少真实会话级监督能力：peek、回复、暂停、终止、waiting_user 高亮。
- 项目详情页还不是项目级 cockpit，缺少 Context Pack、Trace、Artifact、Git/Worktree、Blueprint Run 的聚合布局。

因此，当前前端可以满足“轻量登记项目、看任务状态、手动执行任务、管理记忆/输出、编辑蓝图”的基础使用；还不能满足“离线持续跑、出问题能追根、产物可审查、用户只看 Inbox 就知道该干什么”的目标使用。

## 2. 已经满足的部分

### 2.1 全局信息架构基本正确

`App.tsx` 已提供这些主路由：

- `/` 总览
- `/projects`、`/projects/:id`
- `/agents`、`/agents/:id`
- `/tasks`、`/tasks/:id`
- `/outputs`
- `/memory`
- `/inbox`
- `/blueprints`、`/blueprints/:id`
- `/chat`
- `/settings`

这组页面和 SPEC 的主对象基本对齐。相比旧的聊天/会议可视化方向，当前导航已经更接近 Project / Task / Agent / Artifact / Inbox / Blueprint / Memory 的驾驶舱结构。

### 2.2 Dashboard 可以作为轻量总览入口

Dashboard 已聚合项目数、Agent 在线/忙碌数、输出数、Inbox 待处理数、记忆统计、最近输出和 Agent 快览。这个布局对“打开后先判断系统有没有事”是有效的。

不足是 Dashboard 目前更像状态摘要，不像真正的工作队列。它没有突出“下一步该处理什么”，也没有直接把失败任务、等待用户、待审查产物和运行中的 Blueprint 放到同一个优先级队列里。

### 2.3 项目管理可进行基础使用

项目列表支持注册项目、路径浏览、按状态筛选、删除项目，并为每个项目拉取任务统计。项目详情支持编辑名称、描述、技术栈、目标、状态，支持项目关系和新建任务。

这能满足项目登记和基础维护。但项目详情缺少几个项目级核心区块：

- Context Pack 查看与编辑
- 项目下的 Agent 会话
- 项目下的 Blueprint Run
- 项目下的 ExecutionTrace
- 项目下的 Artifact Review
- Git / Worktree 状态

所以它还不是“一个项目的操作中心”，更多是“项目元数据页 + 任务摘要页”。

### 2.4 任务模块已经可操作

任务列表是看板布局，支持按状态分列、项目筛选、优先级筛选、新建任务、快速状态流转。任务详情支持编辑标题、描述、类型、优先级、标签、项目、指派 Agent，并且可以选择引擎执行任务，展示 SSE 输出。

这是当前最有实际使用价值的模块之一。用户已经可以围绕任务推进工作。

不足是执行后的后续闭环不完整：

- 执行输出只在当前详情页滚动展示，没有稳定沉淀为 Trace 详情。
- 任务完成后没有强制产出 Artifact 或 Review 请求。
- 失败后没有一键生成 handoff 或重试策略。
- Agent 推荐接口后端已有，但任务详情没有“推荐指派”入口。

### 2.5 Blueprint Studio 功能骨架完整

蓝图页面支持列表、新建、克隆、删除、运行、定时。Studio 支持 React Flow 画布、节点拖拽、连线、节点删除、运行历史、定时配置。节点类型覆盖 Agent、Manager、Slot、Meeting、Condition、Summary、Approval。

这满足“能搭一个多 Agent 工作流”的基础需求。

当前可用性短板在配置体验和运行反馈：

- 节点配置以 JSON 文本为主，对真实用户不够安全。
- Agent 节点默认 adapter 是 `mock`，容易让用户创建出看似能跑但不是接真实引擎的蓝图。
- Condition、Approval、Manager 等关键节点缺少字段级表单和校验。
- 运行后没有在画布上实时标记节点状态，只能进历史列表看。

### 2.6 Memory 和 Outputs 能做基础归档

Memory 支持搜索、类型筛选、添加、编辑、删除、重要度、项目关联、Dream 触发。Outputs 支持来源和类型筛选、展开查看内容。

这两页满足“看记录”和“手动整理”的基础需要。

不足是它们还没有很好地回到主流程：

- Memory 没有在项目详情/任务详情中作为 Context Pack 或决策依据呈现。
- Outputs 没有 Artifact 状态机，无法表达 draft / submitted / accepted / rejected。
- Outputs 不能直接发起 Review、关联任务状态流转或关联 Git diff。

### 2.7 Chat 页面适合直接对话，但不应替代任务闭环

Chat 支持选择引擎、选择项目、流式响应、工具调用卡片和取消运行。它适合作为临时协作入口。

但 Chat 当前消息不持久化、不自动变成任务、不关联 Trace/Artifact/Memory 的显式闭环。它应该保留为“快速对话”，不要让它重新变成产品主入口。

## 3. 关键缺口

### P0-1：缺少 ExecutionTrace 前端详情页

现状：

- `api.ts` 已有 `listTraces()` 和 `getTrace()`。
- `TaskDetail.tsx` 和 `AgentDetail.tsx` 都会链接到 `/traces/:task_id`。
- `App.tsx` 没有注册 `/traces` 或 `/traces/:id` 路由。

影响：

用户从任务或 Agent 详情点“执行轨迹”会命中通配路由并跳回首页。这会直接破坏 SPEC 中“可追溯、可审计、能回答为什么失败”的 P0 目标。

建议：

新增 `TraceDetail.tsx`，并注册：

- `/traces`
- `/traces/:taskId`

详情页至少包含：

- 状态变化时间线
- Agent 输出摘要
- 工具调用
- 文件变更 / diff 占位
- 测试结果
- token、TTFT、TPS、latency、agent steps
- 关联任务、Agent、项目、记忆、Artifact

布局建议：

- 顶部：任务/状态/成本/耗时摘要
- 左列：时间线
- 右列：文件变更、测试结果、关联记忆、错误原因

### P0-2：Inbox 还不是统一介入入口

现状：

Inbox 支持类型展示和 resolve，但操作只有一个“处理”按钮。它不能根据类型执行不同动作。

影响：

用户不能在 Inbox 里完成真实介入，只能把事项标掉。这会削弱 Always-on 的价值：系统把用户叫回来，但用户还要自己跳页面找上下文。

建议：

Inbox 按类型提供动作：

- `decision_required`：Approve / Reject / Ask more
- `permission_request`：Allow once / Deny / Always allow for this task
- `blocked_task`：Open task / Create handoff / Retry
- `review_request`：Open artifact / Accept / Request changes
- `failed_task`：Open trace / Retry / Handoff
- `handoff_needed`：Open handoff summary / Assign agent

布局建议：

- 左侧：按优先级排序的待处理列表
- 右侧：选中事项详情，包括关联项目、任务、Trace、Artifact、最近上下文
- 顶部：Urgent、Waiting user、Review、Failed 四个筛选

### P0-3：Artifact Review 缺失

现状：

前端有 Outputs 页面，但没有 Artifact 概念页，也没有 review 状态机。

影响：

任务完成后无法形成“产物提交 -> 用户审查 -> 接受/退回 -> 任务状态更新”的闭环。对于代码任务，也没有 diff/commit/branch 的审查入口。

建议：

新增 `Artifacts` 或把 `Outputs` 升级为 `Artifacts & Outputs`：

- Artifact 列表：按项目、任务、类型、状态筛选
- Artifact 详情：内容预览、diff/commit/link、来源任务、来源 Agent
- Review 操作：Submit / Accept / Reject / Request changes
- Reject 后自动创建 Inbox item 或把任务转回 `in_progress`

布局建议：

- 列表页用表格或密集列表，不要只做折叠卡片。
- 详情页采用左右分栏：左侧产物内容，右侧审查动作和上下文。

### P0-4：Agent View 还没有会话监督能力

现状：

Agents 页面展示 Agent 实体状态、平台、最后在线、当前任务。AgentDetail 展示质量指标、能力、当前任务、最近执行记录。

缺少：

- AgentSession 列表
- waiting_user / running / failed / completed 会话状态
- peek 最近输出
- 回复、暂停、终止
- 实时工具调用、文件变更
- 跳转到源任务和产物

影响：

用户无法在一个页面看到“所有后台 Agent 正在做什么”，只能看到 Agent 这个逻辑实体是否在线。

建议：

把 Agent 页面拆成两个层级：

- `Agents`：逻辑 Agent / Runtime / Presence 管理
- `Agent Sessions` 或 Agent 页面内的主 Tab：当前会话监督

布局建议：

- 左侧：按状态分组的活跃会话列表
- 中间：选中会话的输出流和工具调用
- 右侧：任务、项目、文件变更、操作按钮

### P0-5：Blueprint 配置和运行反馈不足

现状：

Blueprint Studio 可以搭 DAG，但节点配置主要是 JSON，运行反馈主要在历史列表。

影响：

真实用户很容易配置错字段，或者运行后不知道卡在哪个节点。P0 的 Condition 自动分支、Approval 人工确认、失败定位都需要更明确的前端表达。

建议：

- 每种节点提供字段级配置表单。
- Agent 节点从已安装引擎/Agent 下拉选择，不默认 `mock`。
- 保存前做运行前校验：孤立节点、无入口、无出口、Agent 未配置、Condition 表达式为空。
- 运行中在画布上标记 queued/running/completed/failed/blocked。
- 点击失败节点直接打开节点输出、错误、关联 Trace。

## 4. 布局层面的建议

### 4.1 把“项目详情”升级为主工作台

当前项目详情偏元数据。建议改成项目级 cockpit：

- 顶部：项目状态、风险、待处理数、运行中任务、最近失败
- 第一行：任务看板摘要 + Inbox 摘要
- 第二行：Agent 会话 + Blueprint Runs
- 第三行：Artifacts + ExecutionTrace
- 侧栏或 Tab：Context Pack / Memory / Git & Worktree

这样用户进入一个项目后，不需要在全局导航里来回跳。

### 4.2 Dashboard 要从“统计总览”转为“今日处理队列”

当前 Dashboard 的统计卡片有用，但不是最关键。真正要放在第一屏的是：

- 等待我处理
- 正在运行
- 失败/阻塞
- 新提交待审查
- 最近完成可验收

统计指标可以保留，但应退到次级区域。

### 4.3 任务详情应变成三段式

建议任务详情布局：

- 左侧主栏：描述、执行输出、Trace 时间线
- 右侧信息栏：项目、Agent、优先级、标签、成本、关联记忆
- 底部或 Tab：Artifacts、Diff、Review、Handoff

这样“执行、观察、审查、交接”在同一页完成。

### 4.4 Inbox 和 Trace 应成为两个最高优先级补齐页

如果只选两个前端补齐项，优先级应是：

1. Trace 详情页：修复断链，建立可追溯能力。
2. Inbox 详情/操作分栏：把“用户介入”做成真实工作流。

这两个补齐后，当前任务、Agent、蓝图、输出、记忆才会形成闭环。

## 5. 是否满足使用

### 可以满足的使用场景

- 注册本地项目并维护项目基础信息。
- 查看项目数量、Agent 状态、最近输出、待处理数量。
- 创建任务、分配任务、手动流转状态。
- 在任务详情里选择引擎执行任务并查看流式输出。
- 管理跨工具记忆和触发 Dream。
- 查看 Agent 列表、同步 Agent、查看 Agent 质量指标。
- 创建和运行基础 Blueprint。
- 用 Chat 进行临时 Agent 对话。

### 不能稳定满足的使用场景

- 从失败任务一路追溯到工具调用、文件变更、测试结果和成本异常。
- 在 Inbox 中完成审批、权限确认、审查、重试、交接。
- 对任务产物做接受/退回，驱动任务状态变化。
- 监督真实 Agent 会话并进行回复、暂停、终止。
- 在项目页完整掌握某个项目的任务、会话、产物、记忆、Trace、Git 状态。
- 对 Blueprint 的运行过程进行节点级实时观察和失败定位。

## 6. 推荐实施顺序

### Step 1：补 Trace 路由和详情页

这是当前最明显的功能断点。先让 `/traces/:taskId` 可打开，把任务和 Agent 里的现有链接接住。

验收：

- 从 TaskDetail 点击关联 Trace 不跳首页。
- 从 AgentDetail 点击最近执行记录能打开 Trace。
- Trace 页能展示状态、输出、成本、错误、关联任务。

### Step 2：重做 Inbox 为详情分栏 + 类型化操作

先不追求复杂自动化，至少让每类事项有正确去向。

验收：

- failed_task 可打开 Trace、重试、handoff。
- review_request 可打开 Artifact 并 Accept / Request changes。
- decision_required / approval 可同页处理。

### Step 3：升级 Outputs 为 Artifact Review

保留 Outputs 作为原始输出流，但新增 Artifact 状态字段和审查动作。

验收：

- 任务完成至少关联一个 Artifact 或结果摘要。
- Artifact 可 submitted / accepted / rejected。
- rejected 后能回写任务状态或生成 Inbox。

### Step 4：把 Agent View 做成会话监督页

在 Agent 实体管理之外补 AgentSession 视图。

验收：

- running / waiting_user / failed / completed 会话可见。
- waiting_user 高亮。
- 可 peek 最近输出。
- 可跳任务、Trace、Artifact。

### Step 5：完善项目详情为项目级 cockpit

把分散页面聚合回项目详情，减少跨页面跳转。

验收：

- 项目详情能看到任务、Agent 会话、Blueprint Run、Trace、Artifact、Memory、Context Pack 的摘要。
- 每个摘要区都能一键进入对应详情。

### Step 6：Blueprint Studio 表单化和运行态增强

把 JSON 配置降为高级模式，默认提供字段级表单和运行校验。

验收：

- Agent 节点必须选择真实 Agent/Engine。
- Condition/Approval 节点有字段级配置。
- 运行中节点状态能在画布上更新。

## 7. 校验结果

本次只做静态代码评审和前端构建校验，没有启动完整后端、数据库和浏览器端到端流程。

已运行：

```bash
pnpm --prefix packages/ui typecheck
pnpm --prefix packages/ui build
```

结果：

- `typecheck` 通过。
- `build` 通过。
- Vite 仍提示主 JS chunk 约 576 kB，大于 500 kB。建议后续对 Blueprint Studio、Chat、ReactFlow 等重页面做路由级 lazy loading。

## 8. 一句话判断

当前前端“能开始用”，但更像功能台账和操作入口；要满足 Agent Monitor 的核心需求，还需要把 Trace、Inbox、Artifact Review、Agent Session 这四个闭环补起来，再把项目详情改成真正的项目级 cockpit。
