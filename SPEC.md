# Agent Monitor — 项目规范 (SPEC.md)

> 版本: 2.3.7
> 更新: 2026-06-03
> 状态: **Phase 6 完成 + Agent 系统重构设计中** — 详见 `docs/AGENT-SYSTEM-REDESIGN.md`
> 历史版本: 1.4.0 已归档至 `archive/20260529-old-requirements/`

---

## 0. 文档导航

项目定位已于 2026-05-29 重塑。旧版需求文档和设计文档归档至：
- `archive/20260529-old-requirements/PRODUCT-REQUIREMENTS.md`
- `archive/20260529-old-requirements/DESIGN.md`
- `archive/20260529-old-requirements/SPEC.md`

本文件为新的项目规范。旧版中仍适用的内容（核心对象、产品原则）已吸收整合到新版中。

**设计文档**：`docs/AGENT-SYSTEM-REDESIGN.md` — Agent 系统重构（借鉴 Multica Runtime→Agent→Presence 模型），含数据库变更、后端服务、前端页面的详细实施方案。

---

## 1. 项目定位

**Agent Monitor** 是一个个人 AI Agent 统一管理平台。

核心目标不是从零造轮子，而是在优秀的开源基座项目上，增强我们真正需要的差异化能力。

### 1.1 四个核心目标（按用户真实需求）

| 目标 | 说明 |
|------|------|
| **① 统一入口** | 管理本地所有项目和 Agent，一个平台看到全部状态。不再开 N 个窗口和终端来回切换 |
| **② 多 Agent 协作** | 不同 Agent 围绕同一项目协作，跨工具上下文连续。A Agent 知道 B Agent 做了什么，不用反复解释 |
| **③ 跨工具上下文** | 同一个项目可以穿梭使用 Claude Code / Codex / OpenClaw 等工具产生的上下文，不因工具切换而丢失 |
| **④ 自主决策** | 多 Agent 可通过会议/编排自主决定方案和推进方向，减少人工确认断点，工作流可离线持续推进 |

### 1.2 技术战略：基座 + 增强层

不倒车造轮子。所有可通过已有优秀开源项目实现的基础能力，使用开源基座。我们的精力集中在这些基座**做不到或做不好**的事情上。

```
Multica（基座）
    ├── 项目管理 (Kanban + Issue + Workspace)
    ├── Agent 运行时 (12+ CLI daemon 自动管理)
    ├── 任务分配 (Issue → Agent assign → 执行 → PR)
    ├── Squad 小队 (多 Agent 角色分工)
    └── Autopilots (Cron/Webhook 定时任务)
        │
agent-monitor（增强层）
    ├── ① Blueprint 编排  → 多 Agent 决策流程 + 自主节点跳转
    ├── ② Always-on 执行  → 离线不中断 + Dream 模式
    ├── ③ 白盒跨工具记忆  → 同一个项目跨 Claude/Codex/OpenClaw 上下文连续
    ├── ④ Agent View      → 统一入口下的会话总览
    ├── ⑤ ExecutionTrace   → 带记忆+成本的全链路可追溯
    ├── ⑥ Inbox            → 决策/权限/阻塞/review 统一介入
    ├── ⑦ Artifact Review  → 多 Agent 产出物审查闭环
    └── ⑧ Git/Worktree     → 任务级分支隔离 + diff 关联
```

### 1.3 借鉴来源

| 能力 | 来源 | 借鉴方式 |
|------|------|---------|
| Blueprint 多 Agent 决策编排 | HiveWard | 提炼节点编排思想，在 Multica 任务层上实现 |
| Always-on 离线执行 | PilotDeck | 融入 Autopilots + Dream 模式 |
| 白盒跨工具记忆 | PilotDeck | 在 Multica Event 流上叠加记忆层，挂接不同工具会话 |
| 成本追踪 | HiveWard | 融入 ExecutionTrace |
| **引擎适配器协议** | **WeSight (freestylefly/wesight, MIT)** | **直接复用其 `libs/agentEngine/` 抽象：抽 `EngineAdapter` interface + Claude Code/Codex 适配器落地。不绑死 Multica 单一引擎** |
| **多模型 Provider 路由** | **WeSight** | **抽 `providers.ts` 抽象层，支持 OpenAI / Anthropic / Gemini / DeepSeek / Qwen / Moonshot / Ollama / 自定义 OpenAI 兼容端点** |
| **运行时指标维度** | **WeSight `runtime_calls` 表** | **ExecutionTrace 对齐 5 字段：TTFT / output-phase TPS / estimated model TPS / tool latency / agent steps** |

---

## 2. 目标用户

个人开发者 / AI 工具重度使用者：

- 本机有多个项目目录。
- 同时使用多个 AI 编程、分析、测试、文档或自动化工具（Claude Code、Codex、OpenClaw 等）。
- 同一个项目可能在不同阶段使用不同 AI 工具。
- 需要统一入口管理一切，而不是散落在多个终端和工具窗口。
- 希望 AI 能自主推进工作流，不需要守在电脑前逐个确认。

---

## 3. 产品原则

1. **基座优先，不做竞品**
   能用 Multica 的用 Multica，精力花在 Multica 做不到的事上。

2. **本地优先**
   数据默认保存在本机，不依赖云端服务。

3. **统一入口**
   用户打开一个地方，看到所有项目和 Agent 状态。

4. **上下文连续**
   同一个项目的不同 AI 工具之间，知道彼此做了什么。

5. **自主推进**
   多 Agent 决策后不需人工逐一点确认，流程可以离线跑完整条链路。

6. **可追溯、可介入、可纠正**
   每个决策、每次工具调用、每次产出物都有记录。出错过时可以定位根因，而不是重开会话。

7. **Git 是协作基础设施**
   代码类任务的 worktree 隔离、diff 追踪、review 都围绕 Git 展开。

---

## 4. 核心信息架构

```
Agent Monitor
├── 项目总览（Multica Kanban 基础上增强）
│   ├── 项目列表 + 状态
│   ├── Agent 在线状态
│   └── 待我处理 (Inbox)
├── 项目详情
│   ├── 目标 + 技术栈 + Context Pack
│   ├── 任务看板（Multica Issue Board）
│   ├── Blueprint 编排可视化
│   ├── 跨工具记忆时间线
│   ├── Git 状态 + Worktree 列表
│   └── 产物索引
├── Agent View
│   ├── 所有活跃 Agent 会话总览
│   ├── 会话 peek（实时工具调用、文件变更）
│   ├── 回复 / 接管 / 终止
│   └── 跨平台会话关联
├── Inbox
│   ├── 决策请求
│   ├── 权限确认
│   ├── 阻塞升级
│   ├── Review 请求
│   ├── 失败重试
│   └── Handoff 交接
├── ExecutionTrace
│   ├── 任务状态变化时间线
│   ├── 工具调用链
│   ├── 文件变更 diff
│   ├── 测试结果
│   ├── 成本追踪（token / latency）
│   └── 关联记忆条目
├── Artifact Review
│   ├── Git Diff / Commit / Branch
│   ├── 文档 / 报告 / 调研笔记
│   ├── 决策记录
│   └── Review 状态流转（draft → submitted → accepted / rejected）
└── 跨工具记忆管理
    ├── 记忆条目列表（生成→抽取→存储→检索）
    ├── 按项目 / 工具 / 时间筛选
    ├── 编辑 / 删除 / 固定关键记忆
    └── Dream 模式自动归纳
```

---

## 5. 核心对象

### 5.1 Project
本地项目，继承 Multica Workspace 概念。

关键字段：id / name / path / status / goals / tags / repo / managerAgentId / agentIds / contextPack / createdAt / updatedAt

### 5.2 Agent
表示一个可参与项目的本地 AI 助手实例。持久化存储在 `registered_agents` 表。

关键字段：id / name / platform (claude-code/codex/openclaw/opencode/custom) / role / status / capabilities / currentTaskId / quality (successCount/failCount/avgDurationMs) / lastSeenAt / metadata

状态：online / busy / offline

质量指标（quality JSONB）：successCount（成功次数）、failCount（失败次数）、avgDurationMs（平均耗时 ms）

### 5.3 Task
任务是 Agent 协作的最小调度单位。持久化存储在 `tasks` 表，独立状态机流转。

关键字段：id / externalId(adapter) / projectId / title / description / type (general/bug/feature/review/analysis) / status / priority (urgent/high/medium/low) / assigneeId / reviewerId / labels / traceId / startedAt / completedAt

状态机：pending → in_progress → completed / failed / cancelled
                  ↑                         |
                  └─────── (重试) ──────────┘

### 5.4 Blueprint
多 Agent 决策流程编排图。

节点类型：Agent（执行）、Manager（分配）、Slot（并行）、Condition（条件分支）、Approval（可选人工确认）、Summary（汇总）

关键字段：id / projectId / name / nodes[] / edges[] / status / createdAt / updatedAt

### 5.5 MemoryEntry
跨工具记忆条目，实现同一个项目不同 AI 工具间的上下文连续。

关键字段：id / projectId / source (claude-code/codex/openclaw/custom) / sessionId / taskId / type (decision/context/rule/risk/note) / content / tags / status (active/pinned/archived/deprecated) / createdAt / retrievedAt

参考：PilotDeck 白盒记忆的"生成→提取→存储→检索"四阶段模型。

### 5.6 AgentSession
某个平台上的一次真实 Agent 工作会话。

关键字段：id / platform / agentId / projectId / taskId / status (running/waiting_user/completed/failed/idle) / lastOutput / sourceRef / canReply / canPause / canStop / startedAt / lastInteractionAt

### 5.7 InboxItem
需要用户处理的事项。

类型：decision_required / permission_request / blocked_task / review_request / failed_task / handoff_needed

### 5.8 ExecutionTrace
任务执行过程记录。

包含：状态变化 / Agent 输出摘要 / 工具调用 / 修改文件 diff / 测试结果 / 失败原因 / 关联 Artifact / 关联记忆条目 / token 消耗 / latency / 用户介入记录

### 5.9 Artifact
任务执行后的可审查产物。

类型：Git branch/commit/diff / 文档 / 测试报告 / 需求分析 / 调研笔记 / review 评论 / 决策记录

### 5.10 ContextPack
项目级上下文包，供 Agent 接任务时引用。

内容：项目目标 / 技术栈 / 关键目录 / 常用命令 / 编码规则 / 最近决策 / 当前风险 / 禁止事项

---

## 6. 功能需求（新）

只列入 Multica 覆盖范围之外的功能需求。

### 6.1 P0: Blueprint 多 Agent 决策编排

目标：多 Agent 按预定义流程协作，自主决策节点跳转，减少人工确认断点。

需求：
- 可视化编排画布，支持 Agent/Manager/Slot/Condition/Summary 节点。
- 节点可配置执行 Agent、输入、预期输出。
- Condition 节点支持基于 Agent 输出的自动分支。
- Blueprint Run 生成完整执行记录。
- 人工确认节点可选（默认自动流转，仅在关键决策点留 Approve 节点）。

验收：
- 一个 Blueprint 至少包含 3 个不同 Agent 参与。
- Condition 节点能根据上游输出自动跳转到不同分支。
- Blueprint Run 失败时能定位到具体节点。

参考：HiveWard Blueprint Studio 的节点模型和可视化编排。

### 6.2 P0: Always-on 自主执行

目标：用户离线后，已启动的 Blueprint 或任务不因缺少确认而中断。

需求：
- 非 Approve 节点自动流转，不需要人工确认。
- Autopilots 支持在指定时间或触发条件下自动启动 Blueprint。
- Dream 模式：空闲窗口自动归纳整理记忆和上下文。
- 执行结束后生成摘要通知。

验收：
- 用户关闭电脑前启动一个 Blueprint，次日能看到完成状态和产物。
- Approve 节点以外的决策点不产生 Inbox 阻塞。

参考：PilotDeck Always-on 模式 + Multica Autopilots。

### 6.3 P0: 白盒跨工具记忆

目标：同一个项目在不同 AI 工具之间上下文连续。Claude Code 做完的事，Codex 接任务时能直接知道，不需要用户复述。

需求：
- 记忆条目按项目隔离。
- 每条记忆标注来源（工具类型 + 会话 ID + 任务 ID）。
- 支持手动编辑/删除/固定关键记忆。
- 支持 Dream 模式自动归纳总结。
- 支持按项目/工具/时间筛选。
- 跨工具上下文桥接：Agent 接任务时自动检索关联记忆。

验收：
- 用户用 Claude Code 做完一个分析任务，然后用 Codex 做后续开发时，Codex 能看到分析结论。
- 某条记忆出错时，用户可以定位并修改，不需要重开整个会话。
- 跨工具记忆不混淆（项目 A 的记忆不会出现在项目 B）。

参考：PilotDeck 白盒记忆模型。

### 6.4 P0: Agent View（会话总览）

目标：在一个页面看到所有后台 Agent 正在做什么。

需求：
- 展示所有活跃 AgentSession。
- 实时展示工具调用、文件变更、输出摘要。
- 标识 waiting_user / running / failed / completed 状态。
- 支持 peek 最近输出，支持回复、暂停、终止。
- 支持跳转到 Multica 原任务页面。

验收：
- 等待用户的会话高亮显示。
- 会话完成后能跳转到对应任务和产物。

### 6.5 P0: ExecutionTrace（全链路可追溯）

目标：每个任务都有完整的执行轨迹，可追溯、可审计。

需求：
- 记录任务状态变化、Agent 输出、工具调用、文件变更 diff、测试结果。
- 记录 token 消耗和 latency（参考 HiveWard Run Ledger）。
- 关联记忆条目，可追溯"为什么这样决策"（参考 PilotDeck 白盒记忆）。
- 支持按任务查看完整时间线。

验收：
- 用户能回答"这个任务为什么失败"。
- 用户能看到 Agent 改了哪些文件。
- 成本异常的任务能被标记。

### 6.6 P0: Inbox（统一介入入口）

目标：集中收集所有需要用户介入的事项。

需求：
- 支持 6 种类型：decision_required / permission_request / blocked_task / review_request / failed_task / handoff_needed。
- 总览页展示待处理数量。
- 每项关联项目、任务或会话。
- Approve 节点以外的流程不应产生 Inbox 阻塞（Always-on 原则）。

验收：
- 打开总览页看到"我现在需要处理什么"。
- Blueprint 运行时，仅预定义的 Approve 节点才产生 Inbox。

### 6.7 P0: Artifact Review（产物审查闭环）

目标：任务结果可审查、可接受、可退回。

需求：
- Artifact 状态：draft → submitted → accepted / rejected。
- 支持 Git diff/commit/branch、文档、报告、决策记录。
- Review 后更新任务状态。

验收：
- 任务完成时至少有一个结果摘要或 Artifact。
- 退回后任务回到 running 或 review 状态。

### 6.8 P1: Git/Worktree 任务隔离

目标：代码类任务独立分支，互不污染。

需求：
- 识别项目 Git 仓库状态。
- 任务可关联 branch/commit/diff。
- 并行代码任务使用独立 worktree 或分支。
- diff 关联到 ExecutionTrace。

验收：
- 两个代码任务并行时不污染同一工作区。
- 完成的任务能记录对应 diff 或 commit。

### 6.9 P1: Context Pack 项目上下文

目标：Agent 接任务时拥有稳定项目上下文，不反复解释。

需求：
- 每个项目维护 ContextPack。
- 内容：目标、技术栈、关键目录、常用命令、禁止事项。
- 重要决策沉淀进 ContextPack。

验收：
- Agent 接任务时能从 ContextPack 获取上下文。
- 交接时能复用 ContextPack。

### 6.10 P1: Handoff 会话交接

目标：一个 Agent 的未完成工作可被另一个 Agent 接手。

需求：
- 生成 handoff summary：已完成、未完成、修改文件、风险、阻塞、下一步。
- 从失败任务、阻塞任务触发 handoff。
- 接手 Agent 能看到必要上下文。

验收：
- 能跨平台交接（Claude → Codex / OpenClaw）。
- 接手 Agent 不需要从零读聊天记录。

### 6.11 P2: 成本与质量指标

目标：有经济账，知道哪个 Agent 靠谱。

需求：
- 记录 token 消耗、latency。
- Agent 质量指标：成功率、失败次数、平均耗时。
- 异常 Agent 或异常任务提醒。

### 6.12 P2: 会议室 / 多 Agent 讨论可视化

目标：用可视化方式展示多 Agent 讨论过程。

需求：
- 支持会议发言、决策记录。
- 列表模式 + 像素会议室模式。
- 会议决策可沉淀为事件或记忆条目。

---

## 7. 非功能需求

### 7.1 架构原则
- 不修改 Multica 核心代码。增强层通过 Multica API + WebSocket 事件流集成。
- 增强层前端可以独立部署，也可以嵌入 Multica UI 作为插件面板。
- 增强层数据独立存储在本地 PostgreSQL，不侵入 Multica 数据库。

### 7.2 安全
- 默认只监听本机。
- 不自动暴露公网。
- Token、密钥不得进入普通日志。

### 7.3 可扩展
- 记忆层通过 MemoryProvider 接口可替换后端（PostgreSQL → 向量库）。
- Agent 平台通过 EngineAdapter 接口扩展。**EngineAdapter 协议参考 WeSight `libs/agentEngine/` 的设计**（5 个方法：`detectInstalled` / `run` / `approve` / `cancel` / `cost`），保证新引擎接入只需实现一个文件。

---

## 8. 开发阶段与当前状态

说明：以下“已实施”表示代码骨架、主要服务或页面已经存在；“待验证”表示还需要测试、端到端运行或真实集成证明它稳定可用。

### Phase 1: 项目脚手架 + MockAdapter + Agent View
- Monorepo 搭建（Fastify 5 + Vite 6 + React 19 + PostgreSQL 17）
- AgentPlatformAdapter 接口定义 + MockAdapter 实现
- Agent View 会话总览 + 详情页（工具调用时间线）
- ExecutionTrace（状态时间线 + Token/成本统计）
- Inbox 基础（failed_task + blocked_task）
- 前端 6 个页面：总览/项目/Agents/输出/记忆/收件箱
- 当前状态：已实施，`npm run typecheck` 通过。

### Phase 2: 蓝图 DAG 引擎 + 编辑器 + 多 Agent 会议
- 蓝图 CRUD（创建/查看/更新/删除/克隆）
- DAG 执行引擎（runUntilBlockedOrDone + 7 种节点分发）
- 会议服务（round 轮次发言 + 3 种共识规则）
- @xyflow/react DAG 编辑器（7 种自定义节点 + 拖拽 + 配置面板）
- 蓝图运行历史查看
- 当前状态：已实施，仍需 Blueprint 保存、运行、失败路径的端到端复测。

### Phase 3: 记忆 Dream Mode + 跨项目上下文注入
- Dream Mode 自动合并重复记忆、降权过期、归档低价值
- 跨项目上下文注入（buildContext: 项目信息 + 关系 + 决策 + 输出）
- 记忆统计 + 类型筛选 + Dream 触发按钮
- 上下文 API：GET /api/projects/:id/context
- 当前状态：已实施，仍需跨工具接续场景验证。

### Phase 4: 定时调度器 + 风险评估
- croner 定时调度蓝图执行（scheduleBlueprint/unscheduleBlueprint）
- 风险评估引擎（assessRisk: 文件数/核心模块/delete 三维判断）
- 自动审批规则（autoApprove 配置）
- Dashboard 调度任务展示
- 当前状态：已实施；调度为内存态，重启恢复尚未完成。

### Phase 5: 前端深度打磨 + 通铺
- 前端设计语言统一（CSS 组件类替代内联样式）
- 逐项入场动画 + 交互细节增强
- 实时数据流 + 状态同步
- 当前状态：页面已铺开；实时数据流仍待 socket.io 接入，错误态和空态需 QA 收口。

### Phase 6: 多引擎适配层（基于 WeSight 协议）— **2026-06-03 完成**
- 抽 `EngineAdapter` interface（5 方法：`detectInstalled` / `run` / `approve` / `cancel` / `cost`）✅
- `packages/server/src/adapters/multica.ts` 改造为实现新接口 ✅
- 新增 `claude-code.ts` 适配器（真实 CLI spawn + stream-json 解析）✅
- 新增 `reasonix.ts` 适配器（DeepSeek Reasonix CLI + transcript JSONL 指标提取）✅
- `providers.ts` 抽象层（8 个 Provider：Anthropic / OpenAI / DeepSeek / Ollama / Gemini / Qwen / Moonshot / 自定义 OpenAI 兼容）✅
- 公共 SSE 解析器 `parseSSEResponse()` 抽取，消除 provider 重复代码 ✅
- ExecutionTrace 表补齐 5 指标字段（TTFT / output-phase TPS / estimated model TPS / tool latency / agent steps）✅
- Blueprint Run → EngineAdapter → runtime_calls 全链路打通 ✅
- Chat 对话界面（SSE 流式 + 引擎选择 + 工作目录）✅
- P1-6/P2-8/P2-9/P2-10 全部收口 ✅
- 验收：UI 能选引擎；Claude Code + Reasonix 双引擎在线；60 测试全绿

### 当前验证基线

| 项目 | 结果 | 日期 | 说明 |
|------|------|------|------|
| `npm run typecheck` | ✅ 通过 | 2026-06-03 | server + ui TypeScript 均通过 |
| `npm run build` | ✅ 通过 | 2026-06-03 | Vite chunk 542kB warning，非阻断 |
| `npm test` | ✅ 通过 | 2026-06-03 | 60/60 (7 test files) |
| 端到端最小链路 | ✅ 通过 | 2026-06-02 | Project → Task/Output/Memory → Blueprint → Trace/Inbox 4 层全部联通（mock 数据） |
| UUID 校验（4 路由） | ✅ 修复 | 2026-06-02 | projects / blueprints / memory / traces 统一返回 400 |
| UI 用例（TC-003/005/006/007/008/009/011/015/018/019/020） | ⚠️ 待浏览器 | 2026-06-03 | 代码层已实现，需 Playwright 走一遍 |
| 引擎注册 | ✅ 通过 | 2026-06-03 | Claude Code + Reasonix 双引擎 installed:true |
| Chat 对话 | ✅ 通过 | 2026-06-02 | SSE 流式 + 引擎选择 + 工作目录 |

### 下一步方向

1. **前端深度打磨** — 应用 design-system skill（Linear/Vercel Dark 风格），统一视觉语言
2. **子 Agent 分工策略** — 前端派 Hermes、后端派 Reasonix，Claude Code 当 PM 并行调度
3. Playwright UI 用例复测
4. 本地 mock 链路稳定后，再接真实 Multica

---

## 9. 更新记录

| 日期 | 版本 | 作者 | 变更 |
|------|------|------|------|
| 2026-03-26 | 1.0.0 | Claude | 初始规范 |
| 2026-04-26 | 1.1.0 | Claude | 补充项目管理模块（P0），区分实际数据与固定模板 |
| 2026-05-21 | 1.2.0 | Claude | 清理过期 Gateway/Redis/静态前端方案，明确项目-任务-Agent 协作主线 |
| 2026-05-21 | 1.3.0 | Claude | 根据 Claude Agent View、Codex app、多 Agent 平台调研补充核心能力 |
| 2026-05-26 | 1.4.0 | Nox | 对比 HiveWard 架构，补充可借鉴方向分析；新建 CLAUDE.md 协作规则文档 |
| 2026-05-29 | 2.0.0 | Nox | 项目定位重塑：从自研驾驶舱转型为 Multica 基座 + 增强层。集成 HiveWard Blueprint、PilotDeck 白盒记忆/Always-on。旧版需求文档归档至 archive/20260529-old-requirements/ |
| 2026-05-31 | 2.1.0 | DeepSeek | Phase 3-5 全部实施完成：蓝图 DAG 引擎 + DAG 编辑器 + 多 Agent 会议 + 记忆 Dream Mode + 跨项目上下文注入 + 定时调度 + 风险评估 |
| 2026-05-31 | 2.2.0 | Codex | 校正项目状态：功能骨架已实施，类型检查通过，测试和端到端验证仍需收口 |
| 2026-06-01 | 2.3.0 | Nox | 锁定 WeSight (freestylefly/wesight, MIT) 借鉴方向。**前 3 项直接复用 WeSight 思路**：(1) `EngineAdapter` 引擎适配器协议（5 方法：detectInstalled/run/approve/cancel/cost）；(2) 多模型 Provider 路由抽象（providers.ts）；(3) ExecutionTrace 对齐 `runtime_calls` 5 指标（TTFT/output-phase TPS/estimated model TPS/tool latency/agent steps）。**飞书 IM 网关不在本项目范围内**。**Redux Toolkit slice 切分思路后续再考虑**。新增 Phase 6（多引擎适配层）。保持 Multica 基座不变 |
| 2026-06-01 | 2.3.1 | Nox | Phase 6 实施推进：(1) `RunMetricsCollector` helper 落地（`packages/server/src/adapters/engine.ts`），统一 5 指标采集接口（TTFT/outputTps/estimatedModelTps/toolLatencyMs/agentSteps）；(2) `claude-code.ts` + `multica/engine.ts` 接入 collector，5 指标在 mock 阶段已能真实采集；(3) `cost(runId)` 改用 `getMetrics(runId).snapshot()` 返回真实用量，不再返回 null；(4) 新增 13 个单测覆盖 RunMetricsCollector 边界（TTFT 幂等、TPS 计算、toolLatency 取最大值、snapshot 不可变等）。**进度**：Phase 6 整体从 ~40% → ~60%。**未完成**：Provider 路由层（`providers.ts`）尚未建文件、ExecutionTrace 持久化到 `runtime_calls` 表待做、EngineAdapter 真实 CLI spawn（`claude-code.ts` 仍为 mock） |
| 2026-06-02 | 2.3.2 | Claude | 收口 SPEC "下一步收口顺序" 前 4 步：(1) **Step 1 验证**：server 测试已统一 Vitest，30/30 通过（SPEC 旧记录"npm test 未通过"已过期）；(2) **Step 2 QA 复测**：TC-002/010/013/014/016/017 共 7 条纯 API 用例通过，TC-004 暴露 UUID 校验真实 bug；(3) **Step 4 UUID 修复**：补齐 blueprints 5 端点（GET/PUT/DELETE/clone/runs/:runId/cancel）+ traces 1 端点，统一 4 路由（projects/blueprints/memory/traces）对非法 UUID 返回 400 + `invalid id format`；(4) **Step 3 端到端链路**：Project→Task/Output/Memory→Blueprint(agent+summary)→Trace/Inbox 4 层全部联通，Blueprint Run 跑出 mock 输出。**附带清理**：(a) `.gitignore` 加固（`*.bak/.tmp/.swp/~` 备份+编辑器临时文件 + `pnpm-lock.yaml` 屏蔽）；(b) 清理工作树残留 `archive/20260521-101807-cleanup/code-legacy/web.20260429.bak/` 目录。**未完成**：Phase 6 收口（providers.ts / runtime_calls 持久化）、UI 用例需 Playwright 走一遍 |
| 2026-06-02 | 2.3.3 | Claude | **Phase 6 收口完成**（SPEC v2.3.0 锁定的 3 项 WeSight 借鉴点全部落地）：(1) **`runtime_calls` 表 migration**（`005_runtime_calls.sql`）— 对齐 WeSight 5 指标字段（ttft_ms/output_tps/est_model_tps/tool_latency_ms/agent_steps）+ engine_id/model/provider 维度；(2) **`RunMetricsCollector.finish()` 持久化** — 在 `opts.persist=true` 时把 5 指标 + 计量写 `runtime_calls` 表（fire-and-forget，错误不影响主流程）；(3) **`providers.ts` 抽象层** — 5 个 provider 实现（anthropic / openai / deepseek / ollama / mock），纯 fetch 包装不引入 SDK，`resolveProvider(model)` 按前缀路由（claude-*/gpt-*/o[1-9]*/deepseek-*/ollama:*/llama/qwen/mistral）；(4) **EngineAdapter 接入** — `claude-code.ts` 和 `multica/engine.ts` 在 `startMetrics` 时设 `engineId` + `persist: true`，让每次真实跑 agent 都自动入库。**新增 17 个单测**（providers.test.ts 覆盖 resolveProvider/注册表/cost 估算/mock 流/缺 key 抛错），总测试数 47/47 通过。**配置要求**：用真实 provider 需在 env 设 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`（Ollama 不需要 key，走 `OLLAMA_ENDPOINT` env）。**Phase 6 进度 60% → 100%** |
| 2026-06-02 | 2.3.4 | Claude | **`/code-review` high-effort 扫 Phase 6 收口发现 10 个 findings，按严重性取 4 个 P0 + 2 个 P1 修复**：<br>**P0-1 修 gpt-4o-mini 16x 过账**（providers.ts:266）：抽 `costFromTable` helper（按 key 长度降序 + lowercase），3 个 `cost()` 改用 helper；OpenAI 表重排为 `gpt-4o-mini` 在前。<br>**P0-2 修默认 model 持久化全失败**（claude-code.ts:65 + engine.ts）：双保险——业务层把 `'sonnet'` 改为 `'claude-sonnet-4-5'` 命中 resolveProvider 前缀；持久化层 `persistRunMetrics` 给 `resolveProvider` 包 try/catch，未知 model 不再丢整行（provider 写 NULL）。<br>**P0-3 修 claude-code timeout 静默成功**（claude-code.ts:135）：`exitCode === -1`（SIGTERM 杀掉）也 yield `type:'error'` 消息含 `timeout` 关键字。<br>**P0-4 给 fetch 加超时**（providers.ts）：新增 `fetchWithTimeout` 公开 helper（默认 60s AbortController），openaiCompatStream + anthropic chat 都改用。<br>**P1-5/7 顺手修**（P1-5 cost() 大小写不一致 + P1-7 cost() 回退掩盖拼错）：3 个 cost() 都通过 `costFromTable` 自动 lowercase + 未知 model 返回 0 + console.warn，账单不再被静默污染。<br>**新增 2 单测**（P0-1 gpt-4o-mini + P0-4 fetchWithTimeout 含永不响应 server）。总测试数 53/53 通过。<br>**残留 5 个 P1/P2 已知缺口**（已落到 task #28/#30/#31/#32，不阻断当前发布）：toolLatencyMs/agentSteps 0 vs null、缺 Gemini/Qwen/Moonshot/custom-OpenAI 路由、clearMetrics 漏删 DB 行、Anthropic SSE 与 openai 重复未抽公共。 |
| 2026-06-02 | 2.3.5 | Claude | **关键架构发现 + 修复**（用户报告"项目还是不能用"后 E2E 验证发现）：<br>**根因**：Phase 6 收口（v2.3.3）只完成 EngineAdapter 协议 + RunMetricsCollector + runtime_calls 持久化层 + providers.ts 路由 + 4 个适配器实现，但**`blueprint-engine.executeAgentNode` 完全没接入 EngineAdapter**——只走旧的 AgentPlatformAdapter（multica / openclaw / mock）。`runtime_calls` 表**永远是空的**，SPEC 标"Phase 6 100%"是误标。<br>**P0-11 修 executeAgentNode**（blueprint-engine.ts）：在 Path 1 优先 `getEngine(cfg.adapter)`，for-await 累积 `EngineMessage` 文本流；保留 Path 2 AgentPlatformAdapter + Path 3 mock fallback。<br>**bug**：getEngine 实际有两个同名导出（`engine.ts:71` 空注册表 + `registry.ts:32` 真实注册表），且 blueprint-engine.ts 之前 import 的是空的那个——import 路径改为 `../adapters/registry.js`。<br>**P0-12 E2E 验证**（实测）：<br>1. 创建 BP（adapter='claude-code'）<br>2. 触发 Run<br>3. SQL `SELECT * FROM runtime_calls` **确认有 1 行**：run_id=`claude_...`、engine_id=`claude-code`、model=`claude-sonnet-4-5`、provider=`anthropic`、ttft_ms=32487、input_tokens=35955、output_tokens=35<br>**Phase 6 真正可用**。<br>**回归**：typecheck/test 全绿 53/53，git log 完整记录 4 个 commit（review fixes + wiring fix）。<br>**残留 4 个 P1/P2**（已落到 task #28/#30/#31/#32）：toolLatencyMs/agentSteps 0 vs null、缺 Gemini/Qwen/Moonshot/custom-OpenAI 路由、clearMetrics 漏删 DB 行、Anthropic SSE 80+ 行重复。 |
| 2026-06-03 | 2.3.6 | Claude | **Phase 6 完成收口 + Reasonix 引擎接入**：<br>**P1-6** 修 toolLatencyMs/agentSteps 初始值从 `0` 改为 `undefined`（engine.ts），测试断言同步更新。<br>**P2-9** 修 clearMetrics 漏删 DB 行（engine.ts），动态 import 风格 fire-and-forget DELETE runtime_calls。<br>**P2-10** 抽公共 SSE 解析器 `parseSSEResponse()`（providers.ts），Anthropic + OpenAI 兼容流已替换。<br>**P2-8** 新增 4 个 Provider：Gemini（Google AI 原生 SSE）/ Qwen（OpenAI 兼容，DASHSCOPE_API_KEY）/ Moonshot（OpenAI 兼容，MOONSHOT_API_KEY）/ Custom OpenAI（自定义 baseURL）。`makeOpenAICompatible()` 工厂函数供 Qwen/Moonshot/Custom 共用。新增 7 个 provider 测试，总计 30 个 providers 测试通过。<br>**Reasonix 引擎适配器**（reasonix.ts）：接入 DeepSeek Reasonix CLI（`reasonix run --transcript`），spawn 子进程流式输出 + transcript JSONL 指标提取（tokens/cost/ttft）。注册到 registry.ts，双引擎（Claude Code + Reasonix）installed:true。<br>**测试**：60/60 全绿（7 test files）。<br>**策略方向**：确立子 Agent 分工模式（前端→Hermes / 后端→Reasonix / Claude Code→PM），加速项目推进。 |
| 2026-06-03 | 2.3.7 | Claude | **Agent 系统重构设计**（详见 `docs/AGENT-SYSTEM-REDESIGN.md`）：借鉴 Multica 的 Runtime→Agent→Presence 三层模型，替代当前硬编码 mock adapter。核心变更：(1) 新建 `agent_runtimes` 表（对应 Multica `agent_runtime`），每个已安装引擎自动注册为 Runtime；(2) Agent 区分 `engine`（自动发现）和 `manual`（手动注册 OpenClaw bot）两种来源；(3) 新建 `presence-service.ts` 做服务端状态推导（online/busy/offline），替代前端硬编码状态；(4) 引擎执行任务时 `_runningChildren.size > 0` 驱动 Agent 变"忙碌"。15 个文件（3 新建 + 12 修改），~800 行改动。待实施。 |
