# 前端页面信息与操作评估

> 日期：2026-06-04
> 范围：从页面展示信息、需求贴合度、操作便利性三个角度评估当前前端。
> 不包含：视觉风格、美术质量、动效观感。

## 1. 总体判断

当前前端的信息架构已经覆盖 Agent Monitor 的核心对象，但页面展示的信息“看起来很多，真正能指导下一步动作的不够多”。它更像一个功能台账和状态面板，还没有完全变成个人 AI Agent 驾驶舱。

从三个维度看：

| 维度 | 评分 | 判断 |
|------|------|------|
| 页面展示信息 | 6/10 | 对象覆盖广，但很多信息是计数、状态、系统心跳，缺少“风险、阻塞、下一步动作” |
| 需求贴合度 | 6/10 | 已贴近 Project / Task / Agent / Memory / Blueprint 主对象，但 Trace、Artifact、Agent Session、Inbox 闭环不足 |
| 操作便利性 | 5/10 | 基础 CRUD 和任务执行可用，但关键场景跳转多、断链多、动作不够贴上下文 |

一句话结论：

> 当前前端能让用户“看到系统里有什么”，但还不能高效回答“我现在该处理什么、为什么失败、产物能不能验收、哪个 Agent 卡住了”。

## 2. 页面展示信息评估

### 2.1 当前信息展示的问题

目前页面里有不少 telemetry 风格信息，例如：

- 项目总数
- active / paused / archived 数量
- latest update
- uplink sync
- Agent online / busy / offline 数量
- outputs 数量
- memory 数量

这些信息不是完全没用，但大多属于“系统状态证明”，不是“操作决策信息”。

比如项目页顶部这类信息条：

```text
NODES 001
ACTIVE 001
PAUSED 000
ARCHIVED 000
LATEST UPDATE 2d ago
UPLINK SYNC
```

它的问题是：

- `NODES / ACTIVE / PAUSED / ARCHIVED` 只能说明项目注册状态，不能说明项目是否有任务、阻塞、失败或待审查产物。
- `LATEST UPDATE 2d ago` 没说是哪个对象更新，也没说更新是否重要。
- `UPLINK SYNC` 如果不能点开看到同步源、上次同步时间、失败原因，就只是系统心跳。
- 它占据了强位置，但没有告诉用户下一步该做什么。

这类信息可以保留，但应该降级为次级状态，不应该作为页面第一优先级。

### 2.2 更有价值的信息应该是什么

Agent Monitor 的页面信息应该优先回答这些问题：

1. 现在有什么需要我处理？
2. 哪些任务正在跑？
3. 哪些任务失败或阻塞？
4. 哪些产物等待审查？
5. 哪些 Agent 正在工作或等待用户？
6. 哪个项目风险最高？
7. 最近一次失败发生在哪里，为什么？

所以页面顶部更应该展示：

```text
待处理 Inbox: 3
运行中任务: 2
失败任务: 1
等待用户 Agent: 1
待审查产物: 4
最近失败: 18m ago
```

这些指标才有操作价值。

### 2.3 信息价值分层

建议把页面信息分为三层：

| 层级 | 说明 | 示例 |
|------|------|------|
| L1 行动信息 | 用户需要马上处理 | failed task、waiting_user、review_request、permission_request |
| L2 进展信息 | 用户需要持续观察 | running task、busy agent、blueprint run、recent trace |
| L3 资产信息 | 用于背景判断 | project count、memory count、output count、sync status |

当前页面的问题是 L3 信息占了太多强位置，L1 信息不够集中。

## 3. 需求贴合度评估

### 3.1 与核心需求的匹配情况

| 需求对象 | 当前页面 | 贴合度 | 评价 |
|----------|----------|--------|------|
| Project | Projects / ProjectDetail | 中 | 能注册和编辑项目，但不是项目级 cockpit |
| Task | Tasks / TaskDetail | 较高 | 能创建、筛选、流转、执行，是当前最可用模块 |
| Agent | Agents / AgentDetail | 中 | 展示逻辑 Agent，缺少真实 AgentSession 监督 |
| Inbox | Inbox | 低 | 能看待处理项，但不能完成类型化处理 |
| ExecutionTrace | 无页面 | 很低 | API 和链接存在，但前端路由缺失 |
| Artifact Review | Outputs 替代 | 很低 | 没有审查状态机，不能 accept / reject |
| Memory | Memory | 中高 | 基础管理较完整，但没有嵌入项目/任务上下文 |
| Blueprint | BlueprintList / Studio | 中高 | 编辑和运行骨架完整，但配置和运行反馈不足 |
| Chat | Chat | 中 | 可临时对话，但不应成为主流程入口 |

### 3.2 贴合需求的地方

当前前端已经做对了几件事：

- 主导航覆盖了核心对象，不再围绕会议室或聊天页打转。
- Tasks 页面是看板式布局，符合任务管理需求。
- TaskDetail 已经有执行任务入口，能选择引擎并看流式输出。
- Blueprint Studio 有画布、节点、连线、运行、定时，符合多 Agent 编排方向。
- Memory 页面支持搜索、类型筛选、编辑、Dream，符合跨工具记忆管理方向。
- Agents 页面已从纯 mock 方向转向真实状态展示。

这些说明前端方向没有跑偏。

### 3.3 不贴合需求的地方

主要不贴合点集中在闭环：

- 需求要求可追溯，但没有 Trace 页面。
- 需求要求统一介入，但 Inbox 只有“处理”按钮。
- 需求要求产物审查，但 Outputs 只是输出列表。
- 需求要求监督 Agent 正在做什么，但 Agents 页面只展示 Agent 实体，不展示会话。
- 需求要求项目是工作入口，但 ProjectDetail 仍以元数据为主。

换句话说，它贴合“对象模型”，但还没有贴合“真实工作流”。

## 4. 操作便利性评估

### 4.1 当前操作顺手的部分

| 场景 | 评价 |
|------|------|
| 注册项目 | 可以用，路径浏览降低了输入成本 |
| 创建任务 | 可以用，Tasks 和 ProjectDetail 都有入口 |
| 任务状态流转 | 可以用，看板快捷按钮有效 |
| 执行任务 | 可以用，TaskDetail 支持选择引擎和流式输出 |
| 编辑项目信息 | 可以用，名称、描述、技术栈、目标都有编辑入口 |
| 管理记忆 | 较顺手，新增、编辑、删除、搜索、Dream 都在同页 |
| 创建蓝图 | 可以用，拖拽画布和节点类型已经具备 |

这些属于基础操作便利性，能支撑轻量使用。

### 4.2 当前操作别扭的部分

#### 4.2.1 失败追踪链路断

理想链路：

```text
失败任务 -> Trace -> 错误原因 / 工具调用 / 文件变更 / 测试结果 -> 重试或 Handoff
```

当前链路：

```text
失败任务 -> /traces/:taskId -> 无路由 -> 回首页
```

这是最高优先级问题。

#### 4.2.2 Inbox 不能直接处理事情

理想链路：

```text
Inbox item -> 看上下文 -> approve / reject / retry / handoff / accept / request changes
```

当前链路：

```text
Inbox item -> 点击“处理” -> resolve
```

这会导致用户把事项标掉，但事情未必真的解决。

#### 4.2.3 产物验收没有入口

理想链路：

```text
任务完成 -> Artifact submitted -> 用户审查 -> accept / reject -> 任务状态更新
```

当前链路：

```text
任务完成 -> Outputs 里看到一条输出 -> 没有审查动作
```

这不满足“产物闭环”。

#### 4.2.4 项目页不能一次看清项目状态

理想项目页应该是：

```text
项目状态 + 待处理 + 运行中 + 失败 + 待审查 + Agent 会话 + Trace + Memory + Git
```

当前项目页偏：

```text
项目元数据 + 任务数量 + 输出记录
```

用户处理一个项目时仍然要在全局导航中来回跳。

#### 4.2.5 Blueprint 配置对真实用户不够友好

现在节点配置主要靠 JSON。对开发者能用，但对日常操作不够安全。

问题：

- 不知道必填字段是什么。
- 不知道 adapter 是否真实可用。
- 默认 `mock` 容易误导。
- 运行失败不在画布节点上直观呈现。

## 5. 按页面评估

### 5.1 Dashboard

展示信息：中

Dashboard 展示项目、Agent、输出、Inbox、记忆和最近活动，覆盖面够。但它主要展示数量和状态，没有把待处理事项作为第一优先级。

需求贴合度：中

它符合“统一入口”，但不像真正的 cockpit。首页应该是 attention queue，而不是统计面板。

操作便利性：中

可以跳各页面，但缺少直接处理动作。

建议：

- 第一屏改成“待我处理 / 正在运行 / 失败阻塞 / 待审查”。
- 统计卡片降级。
- 每条事项都能跳到任务、Trace、Artifact 或 Agent Session。

### 5.2 Projects

展示信息：低到中

当前信息条偏注册表状态，业务价值不高。项目卡片需要展示任务、失败、待审查、运行中 Agent，而不是只展示项目状态。

需求贴合度：中

项目管理基础能力可用，但没有体现“项目是 Agent 工作空间”。

操作便利性：中

注册项目、筛选、删除可以用。进入项目后的工作聚合不够。

建议：

- 项目列表卡片增加：pending inbox、running tasks、failed tasks、review artifacts、active sessions。
- `NODES / ACTIVE / PAUSED / ARCHIVED` 降级。
- `LATEST UPDATE` 改为“最近关键事件”。

### 5.3 ProjectDetail

展示信息：中

项目元数据、技术栈、目标、关系、任务数量、输出记录都有，但缺少高价值工作状态。

需求贴合度：中

它像项目资料页，不像项目驾驶舱。

操作便利性：中

能新建任务和编辑项目，但不能直接处理项目下的 Trace、Artifact、Agent Session。

建议：

- 顶部加项目健康条：待处理、运行中、失败、待审查、等待用户。
- 中部改为摘要网格：Tasks、Agent Sessions、Blueprint Runs、Artifacts、Traces、Memory。
- 元数据编辑放到次级区域。

### 5.4 Tasks

展示信息：较高

看板分列清晰，任务状态、优先级、项目、指派人基本可见。

需求贴合度：较高

这是当前最贴近真实使用的页面。

操作便利性：较高

能新建、筛选、快速状态流转，操作路径短。

建议：

- 增加“失败原因”或“最近 Trace 状态”提示。
- 增加“待审查产物”标记。
- 增加批量筛选：只看需要我处理、只看失败、只看等待用户。

### 5.5 TaskDetail

展示信息：中高

任务详情、状态、优先级、类型、指派人、标签、项目、执行输出都有。

需求贴合度：中高

任务执行已经接近主流程，但执行后的 Trace、Artifact、Handoff 没闭合。

操作便利性：中

执行任务方便，但执行后要追踪、验收、退回就断了。

建议：

- 增加 Trace Tab。
- 增加 Artifacts Tab。
- 增加 Handoff 操作。
- 接入 agent assign recommendation。
- 执行输出不要只停留在临时输出框，必须沉淀到 Trace。

### 5.6 Agents

展示信息：中

Agent 状态、平台、角色、最后在线、当前任务有价值，但还不够会话级。

需求贴合度：中

符合 Agent 实体管理，但不满足 Agent View 监督需求。

操作便利性：中

能同步和进入详情，但不能监督会话。

建议：

- 增加 Sessions Tab。
- 展示 running / waiting_user / failed / completed 会话。
- waiting_user 会话直接进入 Inbox。

### 5.7 AgentDetail

展示信息：中

质量指标、能力、当前任务、最近执行记录有价值。

需求贴合度：中

适合作为 Agent 档案页，不适合作为会话监督页。

操作便利性：低到中

最近执行记录链接到 Trace，但 Trace 路由缺失。

建议：

- 保留为 Agent profile。
- 会话监督移到 Agent Sessions。
- 修复 Trace 链接。

### 5.8 Inbox

展示信息：低到中

能看到事项类型、标题、描述、优先级，但缺少关联上下文。

需求贴合度：低

Inbox 的目标是统一介入入口，现在只是待办列表。

操作便利性：低

只有“处理”按钮，没有按类型处理。

建议：

- 改成左列表右详情。
- 展示关联项目、任务、Trace、Artifact、Agent。
- 按类型提供 approve、reject、retry、handoff、accept、request changes。

### 5.9 Outputs

展示信息：中

来源、类型、标题、时间、内容可展开，有归档价值。

需求贴合度：低到中

它是输出流，不是 Artifact Review。

操作便利性：中

查看输出方便，但无法审查、接受、退回。

建议：

- 保留 Outputs 作为原始输出。
- 新增 Artifacts 页面承接可审查产物。
- Outputs 中可提供“转为 Artifact”。

### 5.10 Memory

展示信息：中高

类型、内容、来源、项目、重要度、状态都比较完整。

需求贴合度：中高

符合白盒记忆管理方向。

操作便利性：较高

搜索、筛选、添加、编辑、删除、Dream 都可用。

建议：

- 在 ProjectDetail 和 TaskDetail 嵌入相关记忆摘要。
- 增加“固定到 Context Pack”。
- 搜索结果支持跳到关联项目/任务。

### 5.11 Blueprint

展示信息：中

蓝图列表和运行历史有基础信息。Studio 的节点信息能看，但运行态不够。

需求贴合度：中高

符合多 Agent 编排方向，但配置体验和运行反馈影响可用性。

操作便利性：中

画布操作可以用，JSON 配置不够顺手。

建议：

- 节点配置表单化。
- 运行前校验。
- 节点运行态可视化。
- 失败节点直接跳 Trace。

### 5.12 Chat

展示信息：中

消息、工具调用、引擎、项目可见。

需求贴合度：中

适合临时协作，不应作为主工作流。

操作便利性：中高

发送、停止、清空都直接。

建议：

- 支持“转为任务”。
- 支持“保存为记忆”。
- 支持“生成 Artifact/Output”。

## 6. 最需要调整的信息优先级

当前页面优先展示：

```text
数量、状态、同步、更新时间
```

应该优先展示：

```text
待处理、运行中、失败、阻塞、待审查、等待用户、最近关键事件
```

具体替换建议：

| 当前展示 | 建议替换为 |
----------|------------|
项目总数 | 有问题的项目数 |
active 项目数 | 运行中任务数 |
paused 项目数 | 阻塞任务数 |
archived 项目数 | 已完成但待验收产物数 |
latest update | 最近关键事件 |
uplink sync | 同步状态 + 上次成功/失败原因 |
outputs 数量 | 待审查产物数 |
Agent online 数 | waiting_user / busy / failed session 数 |

## 7. 关键操作路径评估

### 7.1 当前较顺的路径

```text
注册项目 -> 创建任务 -> 分配 Agent -> 执行任务
```

这条路基本可用。

### 7.2 当前不顺的路径

```text
任务失败 -> 找原因 -> 看文件变化 -> 重试 / 交接
```

缺 Trace 页面和 Handoff。

```text
任务完成 -> 看产物 -> 审查 -> 接受 / 退回
```

缺 Artifact Review。

```text
Agent 等待用户 -> 用户介入 -> 回复 / 继续 / 停止
```

缺 Agent Session 和 Inbox 类型化动作。

```text
打开项目 -> 判断项目当前是否健康
```

ProjectDetail 信息不够聚合。

## 8. 改进优先级

### P0：立即影响可用性

1. 补 `/traces/:taskId` 页面，修复执行轨迹断链。
2. Inbox 改为分栏详情 + 类型化动作。
3. 新增 Artifact Review 或把 Outputs 升级出 Artifact 状态机。
4. Agent 页面增加 Sessions 监督层。

### P1：提升需求贴合度

1. ProjectDetail 改为项目级 cockpit。
2. Dashboard 改为 attention queue。
3. TaskDetail 增加 Trace / Artifact / Handoff 区块。
4. Blueprint Studio 节点配置表单化。

### P2：提升效率和长期体验

1. 路由级 lazy loading。
2. 首页和项目页减少低价值 telemetry。
3. Chat 支持转任务、存记忆、生成 Artifact。
4. 表格/列表增加批量筛选和保存视图。

## 9. 最终判断

当前前端的信息展示“覆盖对象”，但还没有“驱动决策”；需求贴合“结构”，但还没有贴合“闭环”；操作便利性在基础管理场景里够用，但在 Agent Monitor 真正核心的追踪、审查、介入、监督场景里还不够。

最应该马上改的不是颜色和组件，而是信息优先级：

```text
少展示系统有多少东西。
多展示用户现在该处理什么。
```

这条改对，前端才会从“监控面板”变成“驾驶舱”。
