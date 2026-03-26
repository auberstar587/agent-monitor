# Agent Monitor 状态监控 + 消息捕获架构设计

## 1. Agent 状态设计

### 1.1 状态类型

| 状态 | 含义 | 触发场景 |
|------|------|---------|
| `idle` | 空闲等待 | Agent 初始化、无活跃任务 |
| `working` | 执行中 | 正在处理任务、工具调用中 |
| `meeting` | 开会中 | 参与会议 / 多人协作场景 |
| `away` | 离开 | 超过 N 分钟无活动 |

**扩展字段（StatePayload）：**

```ts
interface AgentState {
  agentId: string;
  status: 'idle' | 'working' | 'meeting' | 'away';
  currentTask?: string;        // 当前任务描述
  sessionId?: string;         // 所在 session
  startTime?: number;          // 状态开始时间（Unix ms）
  lastHeartbeat: number;       // 最后心跳时间
  metadata?: Record<string, any>; // 扩展信息
}
```

### 1.2 状态存储

| 方案 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| **内存存储** | 单实例、小规模（<10 Agent） | 零延迟、零成本 | 重启丢失、无法跨进程 |
| **Redis** | 多实例、生产环境 | 持久化、跨进程、支持 pub/sub | 引入外部依赖 |
| **SQLite/PostgreSQL** | 需要历史记录 | 可查询、可视化 | 写入延迟高，不适合高频更新 |

**推荐：Redis**
- 理由：`working` 状态变更频率高（每秒多次），Redis 的 O(1) 读写和内置 TTL 完美契合
- Key 设计：`agent:state:{agentId}` → JSON
- TTL：状态 key 加 30s 自动过期，由心跳刷新

### 1.3 状态变更事件

```ts
interface StateChangeEvent {
  type: 'state_changed';
  agentId: string;
  prevState: AgentState;
  nextState: AgentState;
  timestamp: number;
}
```

**变更来源：**
- 主 agent 通过 `sessions_run` / `sessions_spawn` 时更新状态
- Subagent 启动/完成时发布事件
- 心跳超时自动触发 `away`

**事件总线：Redis Pub/Sub**
- Channel：`agent:events:state`
- 订阅者：WebSocket Server、监控系统

---

## 2. 消息捕获机制

### 2.1 获取 OpenClaw Session 消息

OpenClaw Session 消息有以下来源：

| 来源 | 获取方式 | 难度 |
|------|---------|------|
| 当前会话历史 | `sessions_history` API | ⭐ 直接可用 |
| 实时新消息 | Gateway WebSocket | ⭐⭐ 需监听 |
| 子 Agent 消息 | Subagent Session Hook | ⭐⭐⭐ 需扩展 |

**方案：通过 Gateway WebSocket 实时拉取**

OpenClaw Gateway 暴露 WebSocket 端点，Monitor Agent 连接后接收所有 session 事件流：

```
ws://<gateway-host>:<port>/ws/sessions
```

消息格式：
```json
{
  "type": "session_event",
  "sessionId": "xxx",
  "role": "agent" | "user",
  "content": "...",
  "timestamp": 1743000000000
}
```

### 2.2 轮询 vs WebSocket

| 方案 | 延迟 | 资源消耗 | 可靠性 |
|------|------|---------|--------|
| 轮询（HTTP 每 1-5s） | 1-5s | 中等 | 低（可能漏消息） |
| WebSocket 长连接 | <100ms | 低 | 高 |

**推荐：WebSocket**
- 延迟 <100ms，满足开会展示的实时性要求
- Gateway 原生支持，避免轮询浪费
- 自动重连机制保证可靠性

### 2.3 消息过滤

Monitor Agent 只关心相关 Agent 的消息，使用**标签路由**：

```ts
// 消息元数据
interface SessionMessage {
  sessionId: string;
  agentId: string;        // 消息来源 agent
  labels: string[];       // ["monitoring", "project:agent-monitor"]
  content: string;
}

// 过滤逻辑
function shouldCapture(msg: SessionMessage): boolean {
  return msg.labels.includes('monitoring') || 
         msg.agentId === config.monitoredAgentId;
}
```

**两种过滤策略：**
1. **服务端过滤**：Gateway 根据 Agent 标签做预过滤（推荐，性能最优）
2. **客户端过滤**：Monitor Agent 接收后自行过滤（灵活，但带宽浪费）

---

## 3. 实时同步方案

### 3.1 WebSocket 推送架构

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   OpenClaw  │───▶│   Monitor    │───▶│   浏览器     │
│   Gateway   │    │   Backend    │    │   前端      │
│  (WS Source)│    │  (Node.js)   │    │  (Dashboard)│
└─────────────┘    └──────────────┘    └─────────────┘
      │                  │                    │
      │ session events   │ state + messages  │ ws connections
      │                  │                   │
      ▼                  ▼                    ▼
  Gateway WS         Redis               Browser WS
  /ws/sessions    pub/sub channel       (reconnect auto)
```

**Monitor Backend（Node.js）职责：**
1. 连接 Gateway WebSocket，接收 session 事件
2. 过滤无关消息，写入 Redis 缓冲
3. 维护浏览器 WebSocket 连接（Socket.io / ws）
4. 将状态变更和新消息推送给前端

### 3.2 消息如何传递给前端

**双通道设计：**

| 通道 | 传输内容 | 频率 |
|------|---------|------|
| 状态通道 | Agent 状态更新 | 变更时推送（低频） |
| 消息通道 | Session 消息流 | 实时推送（高频） |

**前端 API（Socket.io 事件）：**

```ts
// 前端订阅
socket.on('agent:state', (state: AgentState) => { ... });
socket.on('session:message', (msg: SessionMessage) => { ... });

// 主动订阅特定 agent
socket.emit('subscribe', { agentIds: ['agent-1', 'agent-2'] });
```

### 3.3 延迟要求

| 场景 | 目标延迟 | 说明 |
|------|---------|------|
| 状态变更 | < 500ms | 从变更到前端显示 |
| Session 消息 | < 200ms | 消息产生到前端展示 |
| 整体刷新 | < 1s | 页面加载到数据就绪 |

**优化手段：**
- WebSocket 优于 HTTP 轮询
- Redis Pub/Sub 跨进程
- 前端本地缓存 + diff 更新，避免全量刷新

---

## 4. 数据流设计

### 4.1 完整数据流图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           数据流总览                                      │
└─────────────────────────────────────────────────────────────────────────┘

  [用户操作]                    [OpenClaw Gateway]              [Monitor Backend]
  ─────────                    ─────────────────              ────────────────
       │                            │                                │
       │ sessions_spawn             │                                │
       │──────────────▶             │                                │
       │                            │                                │
       │                   ┌────────▼────────┐                        │
       │                   │ Session Manager │                        │
       │                   │ - session:create│                        │
       │                   │ - session:event │                        │
       │                   └────────┬────────┘                        │
       │                            │                                │
       │                            │ WebSocket /session events       │
       │                            │───────────────────────────────▶ │
       │                            │                                │
  ┌────▼───────────────────────────────────────────────────────────┐   │
  │                      Redis Layer                               │   │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │   │
  │  │ agent:state │  │ agent:events│  │ session:messages     │    │   │
  │  │ {agentId}    │  │ state       │  │ buffer (last 100)   │    │   │
  │  │ TTL 30s     │  │ pub/sub     │  │                     │    │   │
  │  └─────────────┘  └─────────────┘  └─────────────────────┘    │   │
  └─────────────────────────────────────────────────────────────────┘   │
       ▲                            ▲                                │
       │                            │                                │
       │                       pub/sub        state change event      │
       │                       ◀───────────────                       │
       │                                                        │
  ┌────┴────────────────────────────────────────────────────────┐       │
  │                    Monitor Backend (Node.js)                │       │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │       │
  │  │ WS Connector │  │ State Manager│  │ Message Filter   │   │       │
  │  │ (Gateway WS)  │  │              │  │ & Router        │   │       │
  │  └──────────────┘  └──────────────┘  └──────────────────┘   │       │
  │         │                │                   │              │       │
  │         └────────────────┴───────────────────┘              │       │
  │                          │                                   │       │
  │                    Socket.io Server                          │       │
  │                          │                                   │       │
  └──────────────────────────┼───────────────────────────────────┘       │
                             │ WebSocket                                 │
                             ▼                                           │
  ┌───────────────────────────────────────────────────────────────────┐   │
  │                        Frontend (Dashboard)                        │   │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │   │
  │  │ Agent Grid   │  │ Message Feed │  │ Timeline / History   │    │   │
  │  │ (实时状态)    │  │ (消息流)      │  │                      │    │   │
  │  └──────────────┘  └──────────────┘  └──────────────────────┘    │   │
  └───────────────────────────────────────────────────────────────────┘   │
```

### 4.2 各模块职责

| 模块 | 职责 | 技术栈 |
|------|------|--------|
| **Gateway WS** | 广播 session 事件 | OpenClaw 内置 |
| **Redis** | 状态存储 + 事件总线 | Redis |
| **Monitor Backend** | 消息过滤、路由、WebSocket 服务 | Node.js + Socket.io |
| **Frontend Dashboard** | 状态展示、消息流、图表 | React/Vue + Socket.io Client |

### 4.3 核心数据流时序

```
User ──▶ spawn subagent ──▶ Gateway ──▶ Redis (state + event)
                                      │
                                      ▼
                               Monitor Backend
                               (filter & route)
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
             Agent State Panel                 Message Feed Panel
             (WebSocket push)                  (WebSocket push)
                    │                                   │
                    ▼                                   ▼
              状态卡片更新                         新消息追加展示
```

---

## 5. 关键技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 消息获取 | WebSocket 直连 Gateway | 延迟最低、实时性最强 |
| 状态存储 | Redis + TTL | 高频读写、跨进程、TTL 自动清理 |
| 前端同步 | Socket.io | 自动重连、房间订阅、兼容性好 |
| 消息过滤 | 服务端标签过滤 | 减少无效传输 |

---

## 6. 风险与备选

| 风险 | 应对方案 |
|------|---------|
| Gateway WebSocket 不支持外部订阅 | 改为轮询 `sessions_history` API（降级方案） |
| Redis 不可用 | 降级到内存存储 + HTTP 轮询 |
| 前端断连 | Socket.io 自动重连 + 本地消息缓存 |
| 消息量过大 | 限速 + 服务端聚合，消息 buffer 上限 100 条 |
