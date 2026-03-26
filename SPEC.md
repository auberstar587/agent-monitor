# Agent Monitor 项目规范 (SPEC.md)

> 版本: 1.0.0
> 更新: 2026-03-26
> 状态: 进行中

---

## 1. 项目概述

### 1.1 项目名称
Agent Monitor - AI 团队开会可视化系统

### 1.2 核心功能
1. 监控 OpenClaw Agent 实时状态
2. 可视化开会过程（拟人形象 + 气泡对话）
3. WebSocket 实时推送

### 1.3 目标用户
- AI 团队运营者
- 需要可视化查看团队状态的用户

### 1.4 与 ClawPort 的关系
- **ClawPort**: 通用 OpenClaw Agent 管理面板（官方开源）
- **本项目**: 专注开会过程可视化 + 拟人形象展示
- **定位**: 差异化补充，不是替代品

---

## 2. 系统架构

### 2.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | HTML/CSS/JS + Socket.io Client | 原生实现，无框架 |
| 后端 | Node.js + Fastify + Socket.io | Web 服务 |
| 状态存储 | 内存 / Redis (可选) | Redis 用于跨进程共享 |
| 端口 | 3001 | 记录在 PORTS.md |

### 2.2 架构图

```
┌─────────────────────────────────────────┐
│           浏览器 (Frontend)               │
│  - Agent 状态面板                        │
│  - 气泡消息展示                          │
│  - 拟人形象动画                         │
└────────────────┬────────────────────────┘
                 │ WebSocket
┌────────────────▼────────────────────────┐
│           Node.js Backend                │
│  - AgentRegistry (状态管理)              │
│  - MessageCapture (消息捕获)             │
│  - Socket.io Server                     │
└────────────────┬────────────────────────┘
                 │ WebSocket / HTTP
┌────────────────▼────────────────────────┐
│           OpenClaw Gateway              │
│  - sessions_list (发现 Agent)            │
│  - Gateway WebSocket (消息)              │
└─────────────────────────────────────────┘
```

---

## 3. Agent 动态发现机制

### 3.1 三级降级策略

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | OpenClaw Gateway API | 从 sessions_list 动态发现 |
| 2 | agents.json 配置文件 | 本地配置文件 |
| 3 | 内置默认列表 | 4 个默认 Agent |

### 3.2 配置格式 (agents.json)

```json
{
  "agents": {
    "tim": { "name": "Tim", "role": "主控", "color": "#f97316" },
    "canmou": { "name": "canmou", "role": "参谋", "color": "#3fb950" },
    "creator": { "name": "creator", "role": "笔杆子", "color": "#58a6ff" },
    "yunying": { "name": "yunying", "role": "运营官", "color": "#f59e0b" },
    "evolver": { "name": "evolver", "role": "进化官", "color": "#a371f7" }
  }
}
```

---

## 4. Agent 状态定义

### 4.1 状态类型

| 状态 | 说明 | 颜色 |
|------|------|------|
| idle | 空闲，等待任务 | #3fb950 (绿) |
| working | 执行任务中 | #f59e0b (橙) |
| meeting | 开会中 | #a371f7 (紫) |
| away | 离线/超时 | #6b7280 (灰) |

### 4.2 心跳机制
- 超时时间: 30 秒
- 检查间隔: 10 秒
- 30 秒无心跳 → 自动标记为 away

---

## 5. API 端点

### 5.1 HTTP API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/agents` | GET | 获取所有 Agent 状态 |
| `/api/agents/:id` | GET | 获取单个 Agent 状态 |
| `/api/messages` | GET | 获取最近消息 |
| `/api/stats` | GET | 系统统计 |

### 5.2 WebSocket 事件

**客户端 → 服务端**:
| 事件 | 说明 |
|------|------|
| `meeting:start` | 开始开会 |
| `meeting:end` | 结束开会 |
| `agent:status` | 更新状态 |
| `agent:heartbeat` | 刷新心跳 |

**服务端 → 客户端**:
| 事件 | 说明 |
|------|------|
| `state:init` | 初始状态 |
| `state:update` | 状态更新 |
| `message:new` | 新消息 |
| `gateway:connected` | Gateway 连接 |

---

## 6. 前端界面

### 6.1 布局结构

```
┌──────────────────────────────────────────────────┐
│ Top Bar: Agent Monitor          [状态指示灯]      │
├────────────┬─────────────────────────────────────┤
│            │                                     │
│  Agent     │         消息/开会区域                │
│  列表      │                                     │
│            │                                     │
│  - Tim     │     [气泡消息展示]                  │
│  - canmou  │                                     │
│  - creator │                                     │
│  - ...     │                                     │
│            │                                     │
└────────────┴─────────────────────────────────────┘
```

### 6.2 拟人形象

| Agent | 形象描述 | 配色 |
|-------|----------|------|
| Tim | 橙色主控形象 | #f97316 |
| canmou | 绿色猫头鹰 | #3fb950 |
| creator | 蓝色灯泡人 | #58a6ff |
| yunying | 橙色管家 | #f59e0b |
| evolver | 紫色水滴 | #a371f7 |

---

## 7. 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3001 | 服务端口 |
| `OPENCLAW_GATEWAY_HOST` | localhost | Gateway 主机 |
| `OPENCLAW_GATEWAY_PORT` | 18789 | Gateway 端口 |
| `AGENTS_CONFIG` | ./agents.json | Agent 配置文件 |
| `REDIS_HOST` | localhost | Redis 主机 |
| `REDIS_PORT` | 6379 | Redis 端口 |

---

## 8. 目录结构

```
agent-monitor/
├── src/
│   ├── index.js           # 入口
│   └── services/
│       ├── agent-registry.js  # Agent 状态管理
│       ├── message-capture.js # 消息捕获
│       └── redis.js          # Redis 连接
├── public/
│   ├── index.html          # 主页面
│   ├── bubble.css          # 气泡样式
│   ├── bubble.js           # 气泡渲染
│   └── avatars/            # Agent SVG 形象
├── prisma/
│   └── schema.prisma       # 数据库 schema
├── agents.json             # Agent 配置
├── package.json
├── SPEC.md                 # 本规范
├── TEST.md                 # 测试计划
└── README.md
```

---

## 9. 验收标准

### 9.1 功能验收

- [ ] 服务启动成功，无报错
- [ ] API `/api/agents` 返回 Agent 列表
- [ ] WebSocket 连接成功
- [ ] 前端显示 Agent 状态
- [ ] Agent 列表包含 Tim + 4 个团队成员

### 9.2 动态发现验收

- [ ] Gateway API 可用时，从 Gateway 发现 Agent
- [ ] Gateway 不可用时，从 agents.json 加载
- [ ] 配置文件不存在时，使用内置默认列表

### 9.3 WebSocket 验收

- [ ] 前端能成功连接 WebSocket
- [ ] 状态变化能实时推送到前端
- [ ] 连接断开后能自动重连

---

## 10. 测试计划

详见 TEST.md

---

## 11. 更新记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-03-26 | 1.0.0 | 初始规范 |
