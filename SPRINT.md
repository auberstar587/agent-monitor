# Agent Monitor 项目任务规划

*规划日期: 2026-03-26*
*基于 task-planning 技能*

---

## Epic: Agent Monitor 系统

### Story 1: 基础架构搭建
**As a** 开发者
**I want to** 搭建项目基础框架
**So that** 后续功能有可运行的基础

### Acceptance Criteria
- [ ] Given 项目目录 When 初始化 Then 包含 package.json 和基础结构
- [ ] Given Node.js环境 When 运行 Then 无报错
- [ ] Given 服务启动 When 访问 localhost:3000 Then 返回基础页面

### Tasks
- [ ] 初始化 Node.js 项目结构
- [ ] 配置 Fastify + WebSocket
- [ ] 配置 Prisma + SQLite
- [ ] 创建基础目录结构 (src/api, src/services, src/routes)
- [ ] 编写启动脚本

### Technical Notes
- 技术栈: Fastify + @fastix/websocket + Prisma + SQLite
- 端口: 3000
- 目录: /root/.openclaw/workspace/projects/agent-monitor/

### Estimation
- Story Points: 3
- T-Shirt: S

### Dependencies
- 无

### Priority
- MoSCoW: Must Have

---

### Story 2: Agent状态收集
**As a** 系统
**I want to** 收集Agent状态
**So that** 可以展示Agent在线/离线状态

### Acceptance Criteria
- [ ] Given 运行中的Agent When 查询 Then 返回所有Agent列表
- [ ] Given Agent离线 When 超过30秒 Then 状态标记为offline
- [ ] Given 状态更新 When 变化 Then 广播给所有WebSocket客户端

### Tasks
- [ ] 集成 OpenClaw sessions_list API
- [ ] 实现 AgentRegistry 心跳检测
- [ ] 实现 WebSocket 广播
- [ ] 编写状态更新定时器

### Technical Notes
- 使用 sessions_list 获取 Agent 信息
- 心跳超时: 30秒
- 轮询间隔: 10秒

### Estimation
- Story Points: 5
- T-Shirt: M

### Dependencies
- Story 1 (基础架构) 必须先完成

### Priority
- MoSCoW: Must Have

---

### Story 3: Web界面展示
**As a an** 用户
**I want to** 在浏览器看到Agent状态面板
**So that** 直观了解团队状态

### Acceptance Criteria
- [ ] Given 界面加载 When 访问 Then 显示所有在线Agent
- [ ] Given Agent状态变化 When 实时 Then 界面自动更新
- [ ] Given 大屏展示 When 切换全屏 Then 布局自适应

### Tasks
- [ ] 实现深色科技风格界面
- [ ] Agent头像 + 状态指示灯
- [ ] 实时状态更新 (WebSocket)
- [ ] 响应式布局 (大屏/中屏/小屏)

### Technical Notes
- 参考 ui-design.md 设计
- 使用原生 HTML/CSS/JS
- 无需构建工具

### Estimation
- Story Points: 5
- T-Shirt: M

### Dependencies
- Story 2 (Agent状态收集) 必须先完成

### Priority
- MoSCoW: Must Have

---

### Story 4: 开会记录功能
**As a** 团队
**I want to** 记录开会过程
**So that** 可以回放讨论历史

### Acceptance Criteria
- [ ] Given 开会 When 开始记录 Then 保存所有消息到文件
- [ ] Given 会议结束 When 停止 Then 生成会议记录
- [ ] Given 查看历史 When 选择会议 Then 显示时间线

### Tasks
- [ ] 实现 MeetingRecorder 类
- [ ] 实时记录消息到文件
- [ ] 生成会议记录 Markdown
- [ ] 历史会议列表页面

### Technical Notes
- 使用 sessions_history 获取历史
- 会议记录存储在 /meetings/ 目录
- 格式: YYYY-MM-DD-HHMM-meeting.md

### Estimation
- Story Points: 8
- T-Shirt: L

### Dependencies
- Story 2 (Agent状态收集) 部分依赖

### Priority
- MoSCoW: Should Have

---

### Story 5: 决策高亮展示
**As a** 用户
**I want to** 看到决策节点
**So that** 了解团队讨论结果

### Acceptance Criteria
- [ ] Given 决策产生 When 标记 Then 显示高亮边框
- [ ] Given 决策列表 When 查看 Then 显示编号和状态
- [ ] Given 投票 When 进行 Then 显示进度条

### Tasks
- [ ] 定义决策数据结构
- [ ] 实现决策高亮样式
- [ ] 决策列表组件
- [ ] 投票进度展示

### Technical Notes
- 决策标记格式: 📌 Decision #XXX
- 状态: pending/confirmed/rejected

### Estimation
- Story Points: 5
- T-Shirt: M

### Dependencies
- Story 4 (开会记录功能)

### Priority
- MoSCoW: Should Have

---

## Sprint 1 规划

**Sprint Goal**: 完成基础架构 + Agent状态监控 + 核心界面

**Duration**: 1天（集中开发）
**Team Capacity**: Tim (self)
**Estimated Velocity**: 11 points

### Selected Stories
1. Story 1: 基础架构搭建 (3 points) - Must Have
2. Story 2: Agent状态收集 (5 points) - Must Have
3. Story 3: Web界面展示 (5 points) - Must Have
4. Story 4: 开会记录功能 (8 points) - Should Have

**Total**: 13-21 points (根据时间灵活调整)

### Sprint Backlog
- [ ] Story 1: 基础架构搭建
- [ ] Story 2: Agent状态收集
- [ ] Story 3: Web界面展示
- [ ] Story 4: 开会记录功能

### Definition of Done
- [ ] 代码编写完成
- [ ] 服务可启动
- [ ] 界面可访问
- [ ] 功能可正常使用

---

## MoSCoW 优先级

### Must Have (Sprint 1)
- 基础架构搭建
- Agent状态收集
- Web界面展示

### Should Have (Sprint 2)
- 开会记录功能
- 决策高亮展示

### Could Have (Sprint 3)
- 会议回放功能
- 多团队支持
- 历史数据分析

### Won't Have (This Release)
- 移动端适配
- 微信/飞书嵌入
- AI自动总结
