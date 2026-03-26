# Agent Monitor 开发任务

*创建: 2026-03-26*
*状态: 进行中*

---

## Sprint 1: MVP

### Task 1: 基础项目框架
**状态**: ✅ 完成
**负责**: Tim
**依赖**: 无

**任务**:
- [ ] 初始化 package.json
- [ ] 安装依赖 (fastify, @fastify/websocket, socket.io, prisma)
- [ ] 创建目录结构
- [ ] 配置 Prisma schema
- [ ] 创建启动脚本

**输出**: `/src/` 目录结构

---

### Task 2: 角色SVG实现
**状态**: ✅ 完成 (canmou→creator)
**负责**: canmou → creator
**依赖**: Task 1 完成

**任务**:
- [ ] 实现4个Agent的SVG形象
- [ ] 实现5种状态动画 (idle/working/speaking/moving/in-meeting)
- [ ] 实现AvatarController JS类
- [ ] 实现SceneManager场景管理

**输出**: `/public/avatars/`, `/src/avatar.js`

---

### Task 3: 气泡UI实现
**状态**: ✅ 完成 (creator)
**负责**: creator
**依赖**: Task 1 完成

**任务**:
- [ ] 实现气泡CSS样式
- [ ] 实现消息队列管理
- [ ] 实现刷屏保护逻辑
- [ ] 实现BubbleRenderer JS类

**输出**: `/public/bubble.css`, `/src/bubble.js`

---

### Task 4: 状态监控后端
**状态**: ✅ 完成 (yunying)
**负责**: yunying
**依赖**: Task 1 完成

**任务**:
- [ ] 实现Redis连接
- [ ] 实现AgentRegistry (心跳检测)
- [ ] 实现WebSocket到OpenClaw Gateway
- [ ] 实现状态广播

**输出**: `/src/services/agent-registry.js`, `/src/services/redis.js`

---

### Task 5: WebSocket实时通信
**状态**: ⏳ 待开始
**负责**: Tim + yunying
**依赖**: Task 1, 2, 3, 4

**任务**:
- [ ] 实现Socket.io服务端
- [ ] 实现客户端连接
- [ ] 实现双通道 (state/msg)
- [ ] 集成测试

**输出**: 完整实时通信

---

### Task 6: 场景切换动画
**状态**: ⏳ 待开始
**负责**: creator
**依赖**: Task 2 完成

**任务**:
- [ ] 实现工位→会议室动画
- [ ] 实现角色飘移效果
- [ ] 实现过渡效果

**输出**: `/src/scene-manager.js`

---

## Task 7: 集成测试
**状态**: ⏳ 待开始
**负责**: Tim
**依赖**: Task 5 完成

**任务**:
- [ ] 本地测试
- [ ] 部署到服务器
- [ ] 飞书验证

**输出**: 可访问的演示页面

---

## 技术栈

- **前端**: 原生 HTML/CSS/JS
- **后端**: Node.js + Fastify + Socket.io
- **状态**: Redis + Pub/Sub
- **数据**: SQLite (Prisma)
- **端口**: 3000

## Git 分支

- `master`: 主分支，稳定代码
- `feature/avatar`: 角色SVG
- `feature/bubble`: 气泡UI
- `feature/backend`: 后端服务

---

*最后更新: 2026-03-26*
