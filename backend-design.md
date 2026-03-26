# Agent Monitor 后端架构设计

## 1. 技术栈概览

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 运行时 | Node.js 20+ | LTS 版本，支持原生 ESM |
| Web 框架 | Fastify | 高性能、低开销，比 Express 快 2x |
| WebSocket | @fastify/websocket | 配合 Fastify 使用 |
| ORM/数据库 | Prisma + SQLite | 开发友好，可轻松切换 PG/MySQL |
| 状态存储 | 内存 Map + 持久化 | 热点数据放内存，定时刷 DB |
| 日志 | Pino | Fastify 默认，性能优秀 |
| 进程管理 | PM2 | 生产环境多实例 |

---

## 2. 整体架构图

```
                          ┌─────────────────┐
                          │   浏览器 / CLI   │
                          │   WebSocket     │
                          │   Client        │
                          └───────▲─────────┘
                                  │ ws://host:3000/ws
                         ┌────────┴────────┐
                         │   Fastify        │
                         │   HTTP Server    │
                         │   + WebSocket    │
                         └───────┬──────────┘
                                 │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
     ┌────────▼────────┐ ┌──────▼──────┐  ┌───────▼───────┐
     │  Agent Registry │ │  State      │  │  Event        │
     │  (Map<id,Agent>) │ │  Collector  │  │  Emitter      │
     └────────┬────────┘ └──────┬──────┘  └───────────────┘
              │                 │
              │          ┌──────▼──────┐
              │          │  Prisma     │
              │          │  SQLite     │
              │          │  (持久化)    │
              │          └─────────────┘
              │
     ┌────────▼────────┐
     │  各 Agent 节点   │
     │  (HTTP POST 上报)│
     └──────────────────┘
```

---

## 3. 目录结构

```
agent-monitor-backend/
├── src/
│   ├── index.ts                 # 入口，Fastify 启动
│   ├── config.ts                 # 环境变量配置
│   ├── plugins/
│   │   ├── websocket.ts          # WebSocket 插件注册
│   │   └── prisma.ts             # Prisma 客户端
│   ├── routes/
│   │   ├── agent.ts              # Agent 注册/注销 API
│   │   ├── state.ts               # 状态上报 API
│   │   ├── history.ts             # 历史数据查询 API
│   │   └── health.ts              # 健康检查
│   ├── services/
│   │   ├── agentRegistry.ts      # Agent 节点注册表
│   │   ├── stateCollector.ts      # 状态收集器（核心逻辑）
│   │   ├── wsBroadcaster.ts       # WebSocket 广播器
│   │   └── metricsProcessor.ts   # 指标计算/聚合
│   ├── types/
│   │   └── index.ts               # 共享类型定义
│   └── utils/
│       └── logger.ts
├── prisma/
│   └── schema.prisma
└── package.json
```

---

## 4. 核心类型定义

```typescript
// src/types/index.ts

export interface AgentInfo {
  id: string;
  name: string;
  version: string;
  startedAt: number;      // unix timestamp ms
  lastHeartbeat: number;
  metadata?: Record<string, string>;
}

export interface AgentState {
  agentId: string;
  timestamp: number;
  // CPU / Memory
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  // 进程
  uptimeSec: number;
  requestCount: number;       // 累计请求数
  errorCount: number;          // 累计错误数
  avgResponseTimeMs: number;  // 平均响应时间
  // 运行时
  nodeMemoryHeapUsedMb: number;
  nodeMemoryHeapTotalMb: number;
  activeHandles: number;
  activeRequests: number;
  // 自定义指标（可扩展）
  customMetrics?: Record<string, number>;
}

export interface WsMessage {
  type: 'state_update' | 'agent_online' | 'agent_offline' | 'alert' | 'ping';
  payload: unknown;
  timestamp: number;
}
```

---

## 5. API 路由设计

### 5.1 Agent 注册与注销

```
POST /api/agents/register
Content-Type: application/json

{
  "id": "agent-001",
  "name": "主客服 Agent",
  "version": "1.2.0",
  "metadata": {
    "env": "production",
    "region": "shanghai"
  }
}

Response 200:
{ "success": true, "message": "Agent registered" }
```

```
DELETE /api/agents/:id

Response 200:
{ "success": true }
```

### 5.2 状态上报

```
POST /api/agents/:id/state
Content-Type: application/json
X-Agent-Token: <agent-secret-token>

{
  "cpuPercent": 45.2,
  "memoryUsedMb": 512,
  "memoryTotalMb": 2048,
  "uptimeSec": 86400,
  "requestCount": 125000,
  "errorCount": 23,
  "avgResponseTimeMs": 120,
  "nodeMemoryHeapUsedMb": 180,
  "nodeMemoryHeapTotalMb": 512,
  "activeHandles": 42,
  "activeRequests": 8,
  "customMetrics": {
    "queueSize": 5,
    "activeConnections": 12
  }
}

Response 200:
{ "success": true, "receivedAt": 1743038400000 }
```

### 5.3 实时状态查询

```
GET /api/agents

Response 200:
{
  "agents": [
    {
      "id": "agent-001",
      "name": "主客服 Agent",
      "status": "online",
      "lastHeartbeat": 1743038399000,
      "currentState": { ... }
    }
  ],
  "total": 1,
  "online": 1
}
```

```
GET /api/agents/:id

Response 200:
{
  "info": { ... },
  "currentState": { ... },
  "stateHistory": [ ... ]   // 最近 N 条
}
```

### 5.4 历史数据查询

```
GET /api/history/:agentId?start=1743034800000&end=1743038400000&interval=5m

Response 200:
{
  "agentId": "agent-001",
  "start": 1743034800000,
  "end": 1743038400000,
  "interval": "5m",
  "dataPoints": [
    {
      "timestamp": 1743034800000,
      "cpuPercent": 42.1,
      "memoryUsedMb": 500,
      "requestCount": 124500,
      ...
    }
  ]
}
```

### 5.5 健康检查

```
GET /health

Response 200:
{
  "status": "ok",
  "uptime": 3600,
  "connectedAgents": 3,
  "timestamp": 1743038400000
}
```

---

## 6. WebSocket 推送设计

### 6.1 连接建立

```
ws://host:3000/ws?token=<jwt-or-agent-token>
```

### 6.2 推送事件类型

| 事件 type | 触发时机 | payload 示例 |
|-----------|---------|-------------|
| `agent_online` | 新 Agent 注册 | `{ agentId, name, timestamp }` |
| `agent_offline` | Agent 心跳超时（>30s）| `{ agentId, lastSeen }` |
| `state_update` | 收到状态上报 | `{ agentId, state, timestamp }` |
| `alert` | CPU > 80%、内存 > 90% 等 | `{ agentId, alertType, value, threshold }` |
| `ping` | 心跳（每 15s 发给客户端）| `{ timestamp }` |

### 6.3 客户端订阅（可选过滤）

客户端可在连接后发送订阅消息：

```json
{
  "action": "subscribe",
  "events": ["state_update", "alert"],
  "agentIds": ["agent-001", "agent-002"]  // 空数组 = 全部
}
```

### 6.4 广播策略

```typescript
// src/services/wsBroadcaster.ts

class WsBroadcaster {
  private clients = new Set<FastifyWebsocket>()

  // 广播给所有客户端
  broadcast(message: WsMessage) {
    const payload = JSON.stringify(message)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
      }
    }
  }

  // 只广播给订阅了特定 agent 的客户端（高级用法）
  broadcastToAgent(agentId: string, message: WsMessage) { ... }

  addClient(socket: FastifyWebsocket) { this.clients.add(socket) }
  removeClient(socket: FastifyWebsocket) { this.clients.delete(socket) }
}
```

---

## 7. 状态收集逻辑（核心）

### 7.1 StateCollector 服务

```typescript
// src/services/stateCollector.ts

export class StateCollector {
  // 内存缓存：最新状态（热点数据）
  private latestStates = new Map<string, AgentState>()
  // 告警阈值
  private alertThresholds = {
    cpuPercent: 80,
    memoryPercent: 90,
    avgResponseTimeMs: 5000,
    errorRatePerMin: 10,  // 每分钟错误数阈值
  }

  // 接收并处理状态上报
  async collect(agentId: string, state: AgentState) {
    // 1. 存储最新状态
    this.latestStates.set(agentId, state)

    // 2. 检查告警
    const alerts = this.checkAlerts(agentId, state)
    for (const alert of alerts) {
      wsBroadcaster.broadcast({
        type: 'alert',
        payload: alert,
        timestamp: Date.now(),
      })
    }

    // 3. 持久化到数据库（异步，不阻塞响应）
    this.persistAsync(agentId, state)

    // 4. 广播状态更新
    wsBroadcaster.broadcast({
      type: 'state_update',
      payload: { agentId, state },
      timestamp: Date.now(),
    })
  }

  // 批量从 DB 查询（给 history API 用）
  async getHistory(agentId: string, start: number, end: number) {
    return prisma.agentState.findMany({
      where: { agentId, timestamp: { gte: start, lte: end } },
      orderBy: { timestamp: 'asc' },
    })
  }
}
```

### 7.2 Agent 心跳超时检测

```typescript
// src/services/agentRegistry.ts 中内置

// 每 10 秒检查一次
setInterval(() => {
  const now = Date.now()
  const TIMEOUT_MS = 30_000  // 30 秒无心跳视为离线

  for (const [agentId, agent] of agentRegistry.agents) {
    if (now - agent.lastHeartbeat > TIMEOUT_MS) {
      agentRegistry.setOffline(agentId)
      wsBroadcaster.broadcast({
        type: 'agent_offline',
        payload: { agentId, lastSeen: agent.lastHeartbeat },
        timestamp: now,
      })
    }
  }
}, 10_000)
```

### 7.3 数据持久化策略

```typescript
// 状态数据写入策略：批量写入，避免频繁 IO

class StatePersister {
  private buffer: AgentState[] = []
  private flushInterval = 5_000  // 每 5 秒批量写一次

  async push(state: AgentState) {
    this.buffer.push(state)
  }

  async flush() {
    if (this.buffer.length === 0) return
    const toWrite = [...this.buffer]
    this.buffer = []

    // 批量写入 Prisma
    await prisma.agentState.createMany({
      data: toWrite.map(s => ({
        agentId: s.agentId,
        timestamp: s.timestamp,
        cpuPercent: s.cpuPercent,
        memoryUsedMb: s.memoryUsedMb,
        memoryTotalMb: s.memoryTotalMb,
        uptimeSec: s.uptimeSec,
        requestCount: s.requestCount,
        errorCount: s.errorCount,
        avgResponseTimeMs: s.avgResponseTimeMs,
        nodeMemoryHeapUsedMb: s.nodeMemoryHeapUsedMb,
        nodeMemoryHeapTotalMb: s.nodeMemoryHeapTotalMb,
        activeHandles: s.activeHandles,
        activeRequests: s.activeRequests,
        customMetrics: s.customMetrics as Prisma.JsonValue,
      })),
    })
  }
}
```

---

## 8. Prisma 数据模型

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Agent {
  id          String   @id  // 对应 AgentInfo.id
  name        String
  version     String
  metadata    String?  // JSON string
  startedAt   BigInt
  lastHeartbeat BigInt
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  states      AgentState[]

  @@index([lastHeartbeat])
}

model AgentState {
  id                  Int      @id @default(autoincrement())
  agentId             String
  timestamp           BigInt
  cpuPercent          Float
  memoryUsedMb        Float
  memoryTotalMb       Float
  uptimeSec           Float
  requestCount        Int
  errorCount          Int
  avgResponseTimeMs   Float
  nodeMemoryHeapUsedMb Float
  nodeMemoryHeapTotalMb Float
  activeHandles       Int
  activeRequests      Int
  customMetrics       String?  // JSON string

  agent               Agent    @relation(fields: [agentId], references: [id])

  @@index([agentId, timestamp])
}
```

---

## 9. 关键设计决策

### 9.1 为什么用 Fastify 而不是 Express？
- 同样的代码量 QPS 高出 2x
- 原生 WebSocket 支持（@fastify/websocket）
- Schema 验证内置（避免大量 if 判断）
- 日志（Pino）内置，开箱即用

### 9.2 为什么用 SQLite 而不是 PostgreSQL？
- 单机部署场景 SQLite 完全够用
- 无需额外部署数据库服务
- Prisma 支持 SQLite，生产环境可一键切换 PG

### 9.3 状态存储策略
- **热点数据**（最新状态）→ 内存 Map，毫秒级访问
- **历史数据** → SQLite，定期归档到时序数据库（可选扩展）
- **告警状态** → 实时计算，不落库

### 9.4 心跳超时机制
- Agent 每 10s 上报一次状态
- 服务端 30s 没收到视为离线
- 每 10s 轮询检查，避免 setTimeout 过多

### 9.5 扩展方向（后续可做）
- [ ] Redis Pub/Sub 支持多实例部署
- [ ] 接入 Prometheus + Grafana
- [ ] 告警规则可配置（而非硬编码阈值）
- [ ] 状态数据定时归档到 TimescaleDB
