# 个人 AI 工具驾驶舱需求文档

> 项目: Agent Monitor
> 版本: 0.3.0
> 更新: 2026-05-21
> 状态: Milestone 1 后需求补充

---

## 1. 产品定位

Agent Monitor 是一个面向个人使用的本地 AI 工具驾驶舱。

它的核心目标不是做大型企业级项目管理系统，也不是单纯做聊天可视化，而是帮助个人用户轻量管理自己本机上的多个 AI 项目、多个 Agent、多个平台和多个任务。

一句话定义：

```text
在一个本地工作台里，看清楚我有哪些项目、哪些 Agent 在负责、任务进展到哪里、产物在哪里、哪里需要我介入。
```

## 2. 背景与初衷

用户本机可能同时使用 OpenClaw、Codex、Claude Code、OpenCode、LLMRouter、AiMemory 等不同 AI 工具或 Agent。它们各自有工作目录、会话、任务、输出和状态，但缺少统一的个人视角：

- 本地到底有多少个 AI 项目在跑？
- 每个项目当前进度如何？
- 哪个 Agent 负责项目管理，哪些 Agent 负责开发、测试、分析、文档？
- 哪些任务已经完成，哪些卡住，哪些需要 review？
- 哪些产物在 Git 里，哪些只是测试报告、需求分析或聊天结论？
- 不同平台的 Agent 如何围绕同一个任务协作？

因此，本项目的初衷是做一个轻量、本地优先、可扩展的个人 AI 工具驾驶舱。

## 2.1 当前实现状态

截至 2026-05-21，项目已经完成一版 Milestone 1 原型：

- `dashboard/` 提供 Vite + React 驾驶舱，入口为 `http://localhost:5173`。
- 已有总览、项目、任务、Agent、设置页面。
- 已有项目列表、任务看板/列表、新建项目、新建任务、Agent 列表和系统资源展示。
- 后端已有基础事件日志、Agent 注册、Socket.io 实时推送和 JSON 种子数据。

当前原型验证了视觉方向和信息架构，但距离长期可用的个人 AI 工具驾驶舱仍缺少关键主链路：

- 项目详情页必须稳定展示项目目标、PM Agent、任务、产物、事件时间线和 Git 状态。
- Agent 页需要升级为 Agent View，能监督真实 Agent 会话。
- 总览页需要突出“待我处理”，而不仅是展示在线数量。
- 产物页不能长期占位，Artifact Review 是协作闭环的一部分。
- 任务详情需要展示执行轨迹、工具调用、文件变更和失败原因。

## 3. 目标用户

### 3.1 当前目标用户

个人开发者 / AI 工具重度使用者：

- 本机有多个项目目录。
- 同时使用多个 AI 编程、分析、测试、文档或自动化工具。
- 希望用较低维护成本管理项目、任务和 Agent 状态。
- 需要保留协作过程和产物索引，但不想维护重型企业系统。

### 3.2 非目标用户

当前阶段不面向：

- 多人企业团队协作。
- SaaS 云端项目管理。
- 严格权限、审计、审批流场景。
- 大规模分布式 Agent 集群。

这些场景未来可以扩展，但不应影响当前轻量化设计。

## 4. 产品原则

1. **本地优先**
   数据默认保存在本机，不依赖云端服务。

2. **轻量优先**
   优先 JSON / SQLite / 本地文件，不引入复杂基础设施。

3. **项目是入口**
   用户首先关心本地有哪些项目，而不是抽象的 Agent 列表。

4. **任务是协作单位**
   Agent 协作围绕任务发生，任务可以关联代码、文档、测试报告、讨论和决策。

5. **Agent 角色不同**
   不同 Agent 不一定都写代码。项目经理、需求分析、测试、文档、review 都是合理角色。

6. **Git 是产物通道之一**
   Git 适合代码和文档类变更，但不是所有协作结果的唯一载体。

7. **会议室是附加体验**
   会议室/聊天室用于展示讨论过程、生成决策和过程回放，不是核心调度引擎。

8. **不要阻塞真实 Agent**
   可视化、消息镜像、会议室逻辑不能影响 Agent 正常执行任务。

9. **监督比聊天更重要**
   用户最需要知道哪些 Agent 在工作、哪些在等待、哪些失败、哪些需要用户介入。

10. **可接管、可审查、可回放**
   每个任务都应能看到执行轨迹、产物和下一步，不让后台 Agent 变成黑箱。

## 5. 核心信息架构

```text
Dashboard
├── Projects
│   ├── Project
│   │   ├── Project Manager Agent
│   │   ├── Tasks
│   │   ├── Artifacts
│   │   ├── Events
│   │   ├── Git State
│   │   └── Context Pack
├── Agent View
│   ├── Sessions
│   ├── Waiting for Me
│   ├── Running in Background
│   └── Last Output / Peek
├── Inbox
│   ├── Needs Decision
│   ├── Permission Request
│   ├── Blocked Task
│   ├── Review Request
│   └── Failed Task
├── Agents
│   ├── Runtime Status
│   ├── Capabilities
│   ├── Quality Metrics
│   └── Current Assignment
├── Tasks
│   ├── Queue
│   ├── In Progress
│   ├── Blocked
│   ├── Review
│   ├── Done
│   └── Execution Trace
├── Artifacts
│   ├── Git Diff / Commit / Branch
│   ├── Document / Report
│   ├── Decision Record
│   └── Review Status
└── Meeting / Chat Replay
    ├── Messages
    ├── Decisions
    └── Visual Room
```

## 6. 核心对象

### 6.1 Project

本地项目是驾驶舱的第一层对象。

关键字段：

| 字段 | 说明 |
|------|------|
| id | 项目唯一标识 |
| name | 项目名称 |
| path | 本地目录 |
| status | active / idle / blocked / reviewing / archived |
| managerAgentId | 项目经理 Agent |
| agentIds | 参与项目的 Agent |
| goals | 项目目标 |
| tags | 分类标签 |
| repo | Git 信息 |
| createdAt / updatedAt | 时间信息 |

### 6.2 Agent

Agent 表示一个可参与项目的本地 AI 助手、工具实例或平台会话。

关键字段：

| 字段 | 说明 |
|------|------|
| id | Agent ID |
| name | 展示名称 |
| platform | openclaw / codex / claude / opencode / custom |
| role | project_manager / developer / tester / analyst / reviewer / writer / researcher |
| status | idle / working / meeting / away / error |
| capabilities | 能力标签 |
| currentProjectId | 当前项目 |
| currentTaskId | 当前任务 |
| lastSeenAt | 最近在线时间 |
| sessionIds | 当前关联会话 |
| quality | 成功率、失败次数、平均耗时、退回次数等质量指标 |

### 6.3 Task

任务是 Agent 协作的最小调度单位。

关键字段：

| 字段 | 说明 |
|------|------|
| id | 任务 ID |
| projectId | 所属项目 |
| title | 任务标题 |
| description | 任务描述 |
| type | analysis / research / code_change / test_change / test_run / doc_change / review / project_management |
| status | queued / assigned / running / blocked / review / completed / failed / cancelled |
| priority | low / medium / high / urgent |
| createdBy | 创建者，通常是用户或项目经理 Agent |
| assigneeAgentId | 执行 Agent |
| reviewerAgentId | 审核 Agent |
| dependencies | 依赖任务 |
| expectedArtifacts | 预期产物 |
| resultSummary | 结果摘要 |
| sessionId | 关联 Agent 会话 |
| traceId | 执行轨迹 ID |
| worktree | 代码类任务使用的 worktree / branch 信息 |

### 6.4 Artifact

Artifact 是任务执行后的可审查产物。

类型包括：

- Git branch / commit / diff
- 文档文件
- 测试报告
- bug list
- 需求分析
- 调研笔记
- review 评论
- 决策记录
- 任务分配记录
- 外部链接

### 6.5 Event

Event 是项目、任务、Agent 和会议室共用的事实记录。

典型事件：

- `project.created`
- `project.updated`
- `agent.joined`
- `agent.status_changed`
- `task.created`
- `task.assigned`
- `task.started`
- `task.blocked`
- `task.review_requested`
- `task.completed`
- `artifact.submitted`
- `meeting.started`
- `meeting.message`
- `meeting.decision`
- `meeting.ended`

### 6.6 AgentSession

AgentSession 表示某个平台上的一次真实 Agent 工作会话。它是 Agent View 的核心对象。

关键字段：

| 字段 | 说明 |
|------|------|
| id | 会话 ID |
| platform | openclaw / codex / claude / opencode / custom |
| agentId | 关联 Agent |
| projectId | 所属项目 |
| taskId | 当前任务 |
| status | running / waiting_user / completed / failed / idle / detached |
| lastOutput | 最近一条输出摘要 |
| lastInteractionAt | 最近交互时间 |
| startedAt | 启动时间 |
| sourceRef | 原平台会话、终端或日志引用 |
| canReply | 是否可从驾驶舱回复 |
| canPause / canStop | 是否支持暂停或终止 |

### 6.7 InboxItem

InboxItem 表示需要用户处理的事项。

类型包括：

- `decision_required`: 需要用户做选择。
- `permission_request`: 需要确认危险操作或工具权限。
- `blocked_task`: 任务阻塞。
- `review_request`: 需要 review 产物。
- `failed_task`: 任务失败，需要判断下一步。
- `handoff_needed`: 需要交接给另一个 Agent。

### 6.8 ExecutionTrace

ExecutionTrace 表示任务执行过程。

它不要求保存完整聊天全文，但至少要保存：

- 状态变化。
- Agent 输出摘要。
- 工具调用。
- 修改文件。
- 测试结果。
- 失败原因。
- 关联 Artifact。
- 用户介入记录。

### 6.9 ContextPack

ContextPack 是项目级上下文包，供 PM Agent 和执行 Agent 接任务时使用。

内容包括：

- 项目目标。
- 技术栈。
- 关键目录。
- 常用命令。
- 编码规则。
- 最近决策。
- 当前风险。
- 禁止事项。

## 7. 功能需求

### 7.1 P0: 本地项目驾驶舱

目标：让用户一眼看清楚本机项目状态。

需求：

- 手动添加本地项目。
- 从指定目录扫描并导入项目。
- 展示项目名称、路径、状态、任务数量、负责人 Agent、最近更新时间。
- 支持项目详情页。
- 支持项目归档。
- 支持项目标签和搜索。
- 支持项目进度汇总：进行中、阻塞、待 review、已完成。

验收：

- 用户可以在 3 分钟内配置 1 个本地项目。
- 首页能显示所有项目及其当前状态。
- 项目详情页能看到任务、Agent、产物和事件摘要。

### 7.2 P0: 任务管理与分配

目标：让不同 Agent 围绕任务协作。

需求：

- 用户可以创建任务。
- 项目经理 Agent 可以创建、拆分和分配任务。
- 任务可以指定类型、优先级、负责人、reviewer、依赖和预期产物。
- 任务状态支持 queued / assigned / running / blocked / review / completed / failed / cancelled。
- 支持任务看板和任务列表两种视图。
- 支持任务评论和事件记录。
- 支持任务关联 Artifact。

验收：

- 一个项目可以有多个任务。
- 一个任务可以分配给不同平台的 Agent。
- 任务从创建到完成的关键事件可追踪。

### 7.3 P0: Agent 状态与角色管理

目标：看清每个 Agent 当前能不能干活、在干什么、适合干什么。

需求：

- 支持手动配置 Agent。
- 支持 Agent 主动注册 / 心跳上报。
- 展示 Agent 平台、角色、状态、当前项目、当前任务。
- 支持能力标签：coding、testing、analysis、review、writing、research、pm。
- 支持 away 超时判定。
- 支持错误状态展示。

验收：

- Agent 加入后能出现在 Agent 列表。
- Agent 状态变化能实时更新。
- Agent 能绑定到项目和任务。

### 7.4 P0: Agent View / 会话监督

目标：像 Claude Agent View 一样，集中监督所有后台 Agent 会话。

需求：

- 展示所有活跃 AgentSession。
- 展示每个会话的项目、任务、平台、状态、运行时长和最近输出。
- 标识 `waiting_user`、`running`、`failed`、`completed` 等关键状态。
- 支持 peek 最近输出，不必进入原平台就能判断进度。
- 支持从驾驶舱回复可回复的会话。
- 支持跳转原平台或原日志。
- 支持标记已处理、暂停、终止或接管（能力取决于 adapter）。

验收：

- 用户能在一个页面看到所有后台 Agent 正在做什么。
- 等待用户输入的会话必须明显高亮。
- 会话完成后能跳转到对应任务和产物。

### 7.5 P0: 待我处理 Inbox

目标：集中收集所有需要用户介入的事项。

需求：

- 支持决策请求、权限请求、阻塞任务、review 请求、失败任务、交接请求。
- 总览页展示待处理数量和最近待处理事项。
- 每个 InboxItem 必须关联项目、任务或会话。
- 用户处理后生成事件记录。
- 支持稍后处理、忽略、转任务、转会议讨论。

验收：

- 用户打开总览页即可看到“我现在需要处理什么”。
- Agent 等待用户时必须产生 InboxItem。
- Review 请求和失败任务不能只散落在任务列表里。

### 7.6 P0: 执行轨迹与任务可观测

目标：避免后台 Agent 黑箱化。

需求：

- 每个任务有 ExecutionTrace。
- 记录任务状态流转、Agent 输出摘要、工具调用、文件变更、测试结果、失败原因。
- 支持按任务查看完整时间线。
- 支持从任务卡片进入轨迹详情。
- 支持 loop / 长时间无进展 / 重试过多等轻量异常提示。

验收：

- 用户能回答“这个任务为什么卡住了”。
- 用户能看到 Agent 改了哪些文件或提交了哪些产物。
- 失败任务必须有失败原因或最后一次可见线索。

### 7.7 P0: Artifact Review / 产物审查

目标：让任务结果可审查、可接受、可退回。

需求：

- 支持提交 Artifact：Git diff、commit、branch、文档、测试报告、调研结论、决策记录、链接。
- Artifact 状态支持 draft / submitted / accepted / rejected。
- Artifact 可关联任务、项目、Agent 和事件。
- 支持用户或 reviewer Agent 接受 / 退回。
- 产物页展示所有待审查产物。

验收：

- 任务完成不能只靠状态字段，必须能看到至少一个结果摘要或 Artifact。
- 用户能找到某个任务最后交付了什么。
- 退回产物后，任务能回到 running 或 review 状态。

### 7.8 P0: 跨平台 Agent 协作基础

目标：不同平台的 Agent 可以围绕同一个项目和任务协作。

需求：

- 定义统一任务协议：任务创建、领取、开始、进度、完成、失败。
- 定义统一产物协议：Artifact 提交、查看、验收。
- 定义统一事件协议：所有关键状态变化都落事件。
- 提供 adapter 层，对接 OpenClaw、Codex、Claude Code、OpenCode 或自定义脚本。
- adapter 失败不能阻塞主流程。

验收：

- 至少支持一个 HTTP/本地脚本通用 adapter。
- 至少支持 OpenClaw 或 Codex 中一种实际接入路径。
- Agent 无法接收消息时，任务状态和错误能被记录。

### 7.9 P1: Git / Worktree / 工作区隔离

目标：把代码类任务和版本管理关联起来。

需求：

- 识别项目是否是 Git 仓库。
- 展示当前分支、未提交变更、最近 commit。
- 任务可以关联 branch / commit / diff。
- 代码类任务可以配置独立 worktree 或分支。
- 多个 Agent 同时处理同一仓库时，必须能看到各自工作区。
- code_change / test_change / doc_change 任务可记录 Git 产物。
- 不自动执行高风险 Git 操作，除非用户确认。

验收：

- 项目详情能展示 Git 状态。
- 代码类任务完成后能记录对应 diff 或 commit 信息。
- 两个代码任务并行时不应默认污染同一个工作区。
- 非代码任务不强制要求 Git 产物。

### 7.10 P1: 项目经理 Agent 工作流

目标：让 PM Agent 成为项目下层、任务上层的控制层。

需求：

- 每个项目可指定一个 PM Agent。
- PM Agent 可读取项目目标、任务状态、Agent 负载和事件日志。
- PM Agent 可提出任务拆分建议。
- PM Agent 可分配任务给其他 Agent。
- PM Agent 可生成项目日报 / 当前状态摘要。
- 用户可以批准或修改 PM Agent 的建议。

验收：

- PM Agent 能生成一个任务拆分方案。
- 用户批准后，任务进入任务队列。
- PM Agent 能输出项目进度摘要。

### 7.11 P1: Context Pack / 项目上下文包

目标：让 Agent 接任务时拥有稳定项目上下文，不反复解释。

需求：

- 每个项目维护 ContextPack。
- 支持用户编辑项目目标、技术栈、关键目录、常用命令、禁止事项。
- PM Agent 可读取 ContextPack 拆任务。
- 执行 Agent 接任务时可读取精简版 ContextPack。
- 重要决策可以沉淀进 ContextPack。

验收：

- 用户能在项目详情页看到并编辑 ContextPack。
- 新任务创建时能引用项目上下文。
- Agent 交接时能复用 ContextPack。

### 7.12 P1: Handoff / 会话交接

目标：让一个 Agent 的未完成工作可被另一个 Agent 接手。

需求：

- 支持生成 handoff summary。
- 摘要包含已完成、未完成、修改文件、风险、阻塞、下一步建议。
- 支持从失败任务、阻塞任务、长时间运行任务触发 handoff。
- Handoff 可创建新任务或重新分配当前任务。

验收：

- 用户能把一个任务从 Claude 交给 Codex / OpenClaw 或反向交接。
- 接手 Agent 能看到必要上下文，不需要从零读聊天记录。

### 7.13 P1: 轻量知识与历史记录

目标：让驾驶舱有记忆，但不过度复杂。

需求：

- 保存项目事件。
- 保存任务历史。
- 保存重要决策。
- 保存 Artifact 索引。
- 支持按项目查看时间线。
- 支持搜索任务、产物和决策。

验收：

- 用户能查看某个项目最近发生了什么。
- 用户能找到某个任务的结果和相关产物。

### 7.14 P2: Agent 质量指标与成本控制

目标：帮助个人用户判断哪个 Agent 可靠、是否在后台空转。

需求：

- 记录每个 Agent 的成功率、失败次数、平均耗时、退回次数。
- 记录任务重试次数、长时间无进展次数。
- 可选记录 token / cost / latency。
- 对循环、长时间运行、频繁失败发出提醒。

验收：

- Agent 页能显示基础质量指标。
- 总览页能提示异常 Agent 或异常任务。

### 7.15 P2: 轻量自动化

目标：让驾驶舱主动提醒用户，而不是只被动展示。

需求：

- 每日项目摘要。
- 定时扫描阻塞任务。
- 自动发现待 review 产物。
- 长任务超时提醒。
- 最近决策整理。

验收：

- 自动化只能生成提醒、事件或草稿，不默认执行高风险操作。
- 用户能关闭或调整自动化。

### 7.16 P3: 会议室 / 聊天室可视化

目标：用更有趣的方式展示 Agent 讨论过程，但不影响主线。

需求：

- 支持本地聊天室。
- 支持会议开始、发言、决策、结束。
- 支持两种展示模式：
  - 列表模式：类似群聊记录。
  - 会议室模式：像素风小人围桌开会。
- 会议决策可沉淀为任务事件或决策记录。
- 会议结束后回到普通工作状态。

验收：

- 会议消息能保存并回放。
- 会议决策能关联项目或任务。
- 可视化失败不影响任务和 Agent 状态。

## 8. 非功能需求

### 8.1 轻量化

- 默认单机运行。
- 默认不依赖数据库服务。
- P0 阶段优先 JSON 文件或 SQLite。
- 不引入 Redis、Prisma、大型队列系统。
- 不依赖付费素材或付费 API。

### 8.2 安全

- 默认只监听本机。
- 不自动暴露公网。
- 不自动上传项目代码。
- 高风险操作需要用户确认。
- Token、密钥、私有路径不得进入普通日志。

### 8.3 可恢复

- 所有核心数据可备份。
- JSON / SQLite 数据文件可直接迁移。
- 任务、事件、Artifact 要有稳定 ID。

### 8.4 可扩展

- Agent 平台通过 adapter 扩展。
- 存储层可从 JSON 升级到 SQLite。
- UI 可先做普通工作台，再接会议室可视化。

### 8.5 可观测

- 任务、会话、产物、事件之间必须可追溯。
- 关键状态变化必须有事件。
- 后台会话必须有最后活动时间。
- 失败必须尽量保留失败原因或最后输出。

## 9. MVP 范围

MVP 应只做真正支撑个人使用的核心能力：

1. 项目列表与项目详情。
2. Agent 配置与状态上报。
3. Agent View / 会话监督。
4. 待我处理 Inbox。
5. 任务创建、分配、状态流转。
6. ExecutionTrace / 任务执行轨迹。
7. Artifact 索引与基础 review。
8. 事件时间线。
9. 一个最小 adapter。
10. 本地 API + Web UI。

MVP 不做：

- 企业权限系统。
- 云同步。
- 多人账户。
- 重型工作流引擎。
- 复杂会议室动画。
- 自动大规模代码合并。
- 企业级 observability 平台。
- 全自动无人监督任务编排。

## 10. 开发阶段建议

### Phase 1: 本地驾驶舱骨架（已形成原型）

- 项目 CRUD
- Agent CRUD / 心跳
- 任务 CRUD / 状态流转
- 事件日志
- 本地 JSON / SQLite 存储
- 基础 Web UI

### Phase 2: Agent View 与人工介入闭环

- AgentSession 模型
- Agent View 页面
- 待我处理 Inbox
- 任务执行轨迹
- Artifact Review 最小闭环
- 项目详情页完善

### Phase 3: 协作协议与 Adapter

- 统一 Agent 协作协议
- OpenClaw / Codex / custom script adapter
- Artifact 提交协议
- PM Agent 任务拆分和分配闭环
- Handoff 交接摘要
- Context Pack

### Phase 4: Git 与项目事实增强

- Git 状态读取
- diff / commit / branch 关联
- worktree / branch 隔离
- review / test 结果关联
- 项目时间线和搜索

### Phase 5: 质量指标、自动化与会议室

- Agent 质量指标
- 成本 / token / latency 可选统计
- 阻塞与长任务提醒
- 聊天列表模式
- 会议决策记录
- Phaser 3 像素会议室
- 会议过程回放

## 11. 交付标准

开发团队交付时至少应提供：

- 可本地启动的前后端。
- 清晰的配置说明。
- 示例项目、示例 Agent、示例任务。
- 端到端演示：创建项目 → 分配任务 → Agent 更新状态 → 提交产物 → 完成任务。
- 测试说明。
- 数据文件说明。
- 后续扩展点说明。
