# Agent Monitor 完整架构设计

*整合日期: 2026-03-26*
*整合自: avatar-animation-design.md + bubble-ui-design.md + state-monitor-design.md*

---

## 一、系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        浏览器 (Frontend)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 角色动画层   │  │ 气泡消息层   │  │ 场景布局层          │  │
│  │ (CSS+SVG)   │  │ (消息队列)   │  │ (会议室/工位)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket (Socket.io)
┌────────────────────────▼────────────────────────────────────┐
│                    Node.js 后端 (Monitor Backend)              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 状态监控     │  │ 消息捕获     │  │ 场景管理            │  │
│  │ (Redis)     │  │ (Gateway WS)│  │ (SceneManager)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket
┌────────────────────────▼────────────────────────────────────┐
│                   OpenClaw Gateway                            │
│  sessions_list / sessions_history / subagents                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、角色设计（canmou设计）

### 2.1 四Agent形象

| Agent | 形象描述 | 特征 |
|-------|----------|------|
| **canmou** | 数据猫头鹰 | 圆形头部+三角身形，雷达眼，绿色系 |
| **creator** | 创意建筑师 | 方形头部+灯泡眼，持笔，蓝色系 |
| **yunying** | 数字管家 | 椭圆头部+仪表盘眼，持记事本，橙色系 |
| **evolver** | 进化体 | 水滴形+流动身形，紫色系，最有机 |

### 2.2 状态动画

| 状态 | 动画描述 | CSS实现 |
|------|----------|---------|
| **idle** | 轻微呼吸，眨眼 | scale脉冲 |
| **working** | 快速微动，任务指示 | translate微震 |
| **speaking** | 说话气泡，嘴型动画 | scale弹跳 |
| **moving** | 飘移+拖尾 | bezier曲线 |
| **in-meeting** | 环形呼吸光环 | box-shadow脉冲 |

### 2.3 场景设计

```
【工位模式】
┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
│canmou│  │creator│ │yunying│ │evolver│
│ 🟢   │  │ 🔵   │  │ 🟠   │  │ 🟣   │
└──────┘  └──────┘  └──────┘  └──────┘

【会议室模式】
         ┌─────────────┐
         │  会议室      │
    ┌────┴────┐  ┌────┴────┐
    │canmou  │  │creator  │
    │  🟢    │  │  🔵     │
    └────────┘  └────────┘
         ┌─────────────┐
         │   👤 Tim    │
         │  (主持)    │
         └─────────────┘
    ┌────┴────┐  ┌────┴────┐
    │yunying  │  │evolver  │
    │  🟠    │  │  🟣     │
    └────────┘  └────────┘
```

---

## 三、消息气泡设计（creator设计）

### 3.1 角色颜色

| 角色 | 气泡颜色 | 背景色 |
|------|----------|--------|
| Host (Tim) | #6366F1 靛蓝 | rgba(99,102,241,0.15) |
| Main (主要发言人) | #10B981 翠绿 | rgba(16,185,129,0.15) |
| Support (辅助) | #F59E0B 琥珀 | rgba(245,158,11,0.15) |
| Observer (观察) | #6B7280 灰 | rgba(107,114,128,0.15) |
| System | #374151 深灰 | rgba(55,65,81,0.3) |

### 3.2 消息结构

```json
{
  "id": "msg_001",
  "agentId": "canmou",
  "role": "Main",
  "content": "根据调研，建议采用A方案",
  "contentType": "text",
  "timestamp": 1711425600000,
  "status": "confirmed"
}
```

### 3.3 队列管理

- **可见队列**: 最多50条
- **历史存档**: 200条（滚动）
- **刷屏保护**: 5秒内≥5条触发折叠，显示倒计时

### 3.4 动画

| 动画 | 时长 | 效果 |
|------|------|------|
| 入场 | 300ms | 弹性缩放 (scale 0.8→1.05→1) |
| 退场 | 200ms | 淡出 (opacity 1→0) |
| streaming | - | 边框闪烁 + 打字效果 |

---

## 四、状态监控设计（yunying设计）

### 4.1 Agent状态

```json
{
  "agentId": "canmou",
  "sessionId": "agent:main:subagent:xxx",
  "state": "meeting",
  "location": "meeting-room-1",
  "lastHeartbeat": 1711425600000,
  "task": "调研分析中"
}
```

**状态类型**: `idle` | `working` | `meeting` | `away` | `speaking`

### 4.2 Redis存储

- **Key**: `agent:state:{agentId}`
- **TTL**: 30秒（无心跳自动过期）
- **事件**: Redis Pub/Sub Channel `agent:events:state`

### 4.3 WebSocket通道

| 通道 | 内容 | 频率 |
|------|------|------|
| `/ws/state` | Agent状态变化 | 低频 |
| `/ws/msg` | 新消息 | 高频 |
| `/ws/scene` | 场景切换 | 低频 |

**延迟目标**: 状态<500ms，消息<200ms

---

## 五、数据流

```
1. 开会开始
   User → 启动会议 → SceneManager.enterMeeting()

2. 角色移动
   SceneManager → 计算路径 → CSS动画 → 角色飘移到会议室

3. 消息捕获
   Gateway WS → Monitor Backend → 过滤 → 广播

4. 气泡显示
   WebSocket → 前端队列 → 动画渲染 → 气泡展示

5. 状态同步
   Redis Pub/Sub → 状态变化 → WebSocket → 界面更新
```

---

## 六、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JS（无框架） |
| 动画 | CSS + SVG + requestAnimationFrame |
| 后端 | Node.js + Fastify + Socket.io |
| 状态 | Redis + Pub/Sub |
| 数据 | SQLite（会议记录） |
| 端口 | 3000 |

---

## 七、开发任务（更新版）

### Sprint 1: MVP

| 任务 | 负责 | 优先级 |
|------|------|--------|
| 基础项目框架 | Tim | Must |
| 角色SVG实现 | canmou→creator | Must |
| 气泡UI实现 | creator | Must |
| 状态监控后端 | yunying | Must |
| WebSocket实时通信 | Tim+yunying | Must |
| 场景切换动画 | creator | Should |

### Sprint 2: 增强

| 任务 | 负责 |
|------|------|
| 会议记录生成 | yunying |
| 历史会议回放 | creator |
| 决策高亮 | creator |
| 消息搜索 | yunying |

---

## 八、文件清单

```
/root/.openclaw/workspace/projects/agent-monitor/
├── ARCHITECTURE.md      # 整合架构（本文件）
├── SPRINT.md            # 任务规划
├── README.md            # 项目概述
├── avatar-animation-design.md  # 角色设计
├── bubble-ui-design.md        # 气泡UI设计
├── state-monitor-design.md    # 状态监控设计
├── backend-design.md          # 后端架构（旧版参考）
├── canmou-research.md         # API调研
├── ui-design.md               # UI设计（旧版参考）
└── skills-research.md        # Skills调研
```
