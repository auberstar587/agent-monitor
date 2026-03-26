# Agent Monitor 开会可视化系统 - 架构细化设计

*版本: v1.0*
*日期: 2026-03-26*
*作者: Tim (架构设计)*

---

## 1. 消息捕获方案

### 1.1 OpenClaw Gateway 消息获取机制

#### 核心问题：如何从 OpenClaw Gateway 获取实时消息？

**方案选择：Gateway WebSocket 监听 + HTTP API 轮询**

OpenClaw Gateway 提供两种消息获取方式：

| 方式 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **WebSocket 监听** | 实时性高，低延迟 | 需要维护长连接 | 实时消息捕获 |
| **HTTP API 轮询** | 稳定可靠，易于实现 | 有轮询间隔延迟 | 状态同步、备份 |

**推荐方案：WebSocket 为主 + HTTP API 为辅**

```typescript
// src/services/gateway/GatewayConnector.ts

interface GatewayConfig {
  gatewayUrl: string;        // ws://localhost:18789 或 http://host:18792
  apiUrl: string;             // http://localhost:18792
  reconnectDelay: number;    // 重连延迟，默认 3000ms
  heartbeatInterval: number; // 心跳间隔，默认 30000ms
  maxReconnectAttempts: number; // 最大重试次数，默认 10
}

class GatewayConnector {
  private ws: WebSocket | null = null;
  private reconnectCount = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageBuffer: GatewayMessage[] = [];
  private eventEmitter: EventEmitter;

  // 消息队列：防止消息丢失
  private messageQueue: Array<{
    msg: GatewayMessage;
    timestamp: number;
    retryCount: number;
  }> = [];

  // 连接状态
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' = 'disconnected';

  /**
   * 建立 WebSocket 连接
   */
  async connect(): Promise<void> {
    if (this.connectionState === 'connected') return;

    this.connectionState = 'connecting';
    this.emit('status', { state: 'connecting' });

    try {
      // OpenClaw Gateway WebSocket 端点
      const wsUrl = `${this.config.gatewayUrl}/ws`;

      this.ws = new WebSocket(wsUrl, {
        handshakeTimeout: 10000,
      });

      this.ws.on('open', () => this.handleOpen());
      this.ws.on('message', (data) => this.handleMessage(data));
      this.ws.on('close', (code, reason) => this.handleClose(code, reason));
      this.ws.on('error', (error) => this.handleError(error));
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  /**
   * WebSocket 连接建立成功
   */
  private handleOpen(): void {
    console.log('[Gateway] WebSocket connected');
    this.connectionState = 'connected';
    this.reconnectCount = 0;
    this.emit('status', { state: 'connected' });

    // 启动心跳
    this.startHeartbeat();

    // 重放缓冲消息
    this.replayBuffer();

    // 订阅消息类型
    this.subscribe(['session_message', 'session_start', 'session_end', 'agent_event']);
  }

  /**
   * 订阅指定类型的消息
   */
  private subscribe(types: string[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const subscribeMsg = {
      action: 'subscribe',
      types: types,
      clientId: this.config.clientId,
    };

    this.ws.send(JSON.stringify(subscribeMsg));
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: GatewayMessage = JSON.parse(data.toString());

      // 添加时间戳用于延迟计算
      message.receivedAt = Date.now();

      // 消息确认：如果 Gateway 需要确认
      if (message.requiresAck) {
        this.sendAck(message.id);
      }

      // 加入缓冲队列
      this.messageBuffer.push(message);

      // 限流：保持最近 1000 条消息
      if (this.messageBuffer.length > 1000) {
        this.messageBuffer = this.messageBuffer.slice(-500);
      }

      // 触发事件
      this.eventEmitter.emit(message.type, message);

    } catch (error) {
      console.error('[Gateway] Failed to parse message:', error);
    }
  }

  /**
   * 发送消息确认
   */
  private sendAck(messageId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'ack',
        messageId: messageId,
        timestamp: Date.now(),
      }));
    }
  }
}
```

### 1.2 WebSocket 连接管理

#### 1.2.1 连接建立流程

```
Client                      Gateway                    Monitor Backend
  |                            |                            |
  |------- TCP Connect ------->|                            |
  |                            |                            |
  |<------ 101 Switching ---->|                            |
  |                            |                            |
  |------- Auth Request ----->|                            |
  |                            |                            |
  |<----- Auth Response ------|                            |
  |                            |                            |
  |------- Subscribe -------->|                            |
  |   (session_message etc)   |                            |
  |                            |                            |
  |<====== 双向消息流 ========>|                            |
  |                            |                            |
```

#### 1.2.2 连接保活机制

```typescript
// src/services/gateway/ConnectionManager.ts

class ConnectionManager {
  private readonly PING_INTERVAL = 25000;    // 25秒 ping 一次
  private readonly PING_TIMEOUT = 5000;       // 5秒内没响应视为断开
  private readonly RECONNECT_BASE_DELAY = 1000; // 基础重连延迟
  private readonly RECONNECT_MAX_DELAY = 30000; // 最大重连延迟

  private pingTimer: NodeJS.Timeout | null = null;
  private pingRespTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;

  /**
   * 启动连接保活
   */
  startKeepAlive(): void {
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, this.PING_INTERVAL);
  }

  /**
   * 发送 Ping 并等待 Pong
   */
  private sendPing(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.scheduleReconnect();
      return;
    }

    const pingId = `ping_${Date.now()}`;
    this.ws.send(JSON.stringify({ type: 'ping', id: pingId }));

    // 设置 Pong 超时
    this.pingRespTimer = setTimeout(() => {
      const latency = Date.now() - this.lastPongTime;
      if (latency > this.PING_TIMEOUT) {
        console.warn('[Gateway] Pong timeout, reconnecting...');
        this.ws?.terminate();
      }
    }, this.PING_TIMEOUT);
  }

  /**
   * 处理 Pong 响应
   */
  handlePong(pingId: string): void {
    if (this.pingRespTimer) {
      clearTimeout(this.pingRespTimer);
      this.pingRespTimer = null;
    }
    this.lastPongTime = Date.now();
  }
}
```

### 1.3 断线重连策略

#### 1.3.1 指数退避重连

```typescript
// src/services/gateway/ReconnectStrategy.ts

interface ReconnectConfig {
  baseDelay: number;        // 基础延迟: 1000ms
  maxDelay: number;          // 最大延迟: 30000ms
  maxAttempts: number;      // 最大尝试次数: 0 = 无限
  jitterFactor: number;     // 抖动因子: 0.3 (30% 随机)
}

class ReconnectStrategy {
  private attemptCount = 0;
  private nextDelay: number;

  constructor(private config: ReconnectConfig) {
    this.nextDelay = config.baseDelay;
  }

  /**
   * 计算下次重连延迟
   * 使用指数退避 + 抖动防止惊群效应
   */
  getNextDelay(): number {
    const exponentialDelay = Math.min(
      this.nextDelay,
      this.config.maxDelay
    );

    // 添加随机抖动: ±jitterFactor
    const jitter = exponentialDelay * this.config.jitterFactor * (Math.random() * 2 - 1);
    const finalDelay = Math.round(exponentialDelay + jitter);

    // 更新下次延迟
    this.nextDelay = Math.min(
      this.nextDelay * 2,
      this.config.maxDelay
    );

    return finalDelay;
  }

  /**
   * 判断是否继续重连
   */
  shouldReconnect(): boolean {
    this.attemptCount++;
    return this.config.maxAttempts === 0 || this.attemptCount <= this.config.maxAttempts;
  }

  /**
   * 重置策略（连接成功后调用）
   */
  reset(): void {
    this.attemptCount = 0;
    this.nextDelay = this.config.baseDelay;
  }
}

/**
 * 重连执行器
 */
class ReconnectExecutor {
  private reconnectStrategy: ReconnectStrategy;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private gatewayConnector: GatewayConnector,
    private config: ReconnectConfig
  ) {
    this.reconnectStrategy = new ReconnectStrategy(config);
  }

  /**
   * 调度重连
   */
  scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    if (!this.reconnectStrategy.shouldReconnect()) {
      console.error('[Gateway] Max reconnect attempts reached');
      this.emit('reconnect_failed', { attempts: this.reconnectStrategy.attemptCount });
      return;
    }

    const delay = this.reconnectStrategy.getNextDelay();
    console.log(`[Gateway] Reconnecting in ${delay}ms (attempt ${this.reconnectStrategy.attemptCount})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.gatewayConnector.reconnect();
    }, delay);
  }

  /**
   * 连接成功时调用
   */
  onConnected(): void {
    this.reconnectStrategy.reset();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
```

#### 1.3.2 重连流程图

```
WebSocket 断开
      │
      ▼
┌─────────────┐
│ 检测断开    │ ◄── on('close') / on('error')
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 停止心跳    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 状态变更    │ ◄── 'reconnecting'
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ 计算延迟 (指数退避+抖动) │
└──────┬──────────────────┘
       │
       ▼
┌─────────────┐
│ 等待延迟    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     失败      ┌──────────────────┐
│ 发起重连    │──────────────►│ 检查最大重试次数  │
└──────┬──────┘               └────────┬─────────┘
       │成功                            │
       ▼                               ▼
┌─────────────┐               ┌──────────────────┐
│ 重置策略    │               │ 放弃，触发告警   │
│ 恢复心跳    │               └──────────────────┘
└─────────────┘
```

### 1.4 消息延迟要求与保障

| 消息类型 | 延迟要求 | 保障机制 |
|----------|----------|----------|
| Agent 状态变化 | < 500ms | WebSocket 实时推送 |
| 新消息气泡 | < 200ms | WebSocket 优先，队列异步 |
| 场景切换 | < 300ms | 状态同步 + CSS 动画 |
| 心跳/Keep-alive | < 30s | 独立心跳检测 |

```typescript
// 消息延迟监控
interface MessageLatency {
  messageId: string;
  gatewayTime: number;   // 消息在 Gateway 的时间戳
  receivedAt: number;     // 本地接收时间
  processedAt: number;    // 处理完成时间
  deliveredAt: number;    // 推送给客户端时间
}

// 延迟统计
class LatencyMonitor {
  private latencies: number[] = [];
  private readonly MAX_SAMPLES = 1000;

  record(message: GatewayMessage): number {
    const latency = Date.now() - message.timestamp;
    this.latencies.push(latency);
    if (this.latencies.length > this.MAX_SAMPLES) {
      this.latencies.shift();
    }
    return latency;
  }

  getStats(): { avg: number; p50: number; p95: number; p99: number } {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return {
      avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
}
```

---

## 2. 开会状态管理

### 2.1 会议状态判断

#### 2.1.1 会议状态定义

```typescript
// src/types/meeting.ts

interface Meeting {
  id: string;                    // 会议唯一 ID
  name: string;                   // 会议名称
  startedAt: number;             // 开始时间
  endedAt?: number;              // 结束时间
  status: MeetingStatus;          // 会议状态
  hostAgentId: string;            // 主持 Agent ID
  participants: Participant[];    // 参与者列表
  messages: Message[];            // 会议消息
  decisions: Decision[];          // 会议决策
}

enum MeetingStatus {
  /** 预定的会议，还未开始 */
  SCHEDULED = 'scheduled',
  /** 正在进行 */
  ACTIVE = 'active',
  /** 已暂停 */
  PAUSED = 'paused',
  /** 已结束 */
  ENDED = 'ended',
}

interface Participant {
  agentId: string;
  name: string;
  role: 'host' | 'speaker' | 'listener' | 'observer';
  joinedAt: number;
  leftAt?: number;
  speakingTimeMs: number;  // 发言时长统计
}

/**
 * 判断"现在是否在开会"
 */
class MeetingStateManager {
  private currentMeeting: Meeting | null = null;
  private meetingActivityTimeout: NodeJS.Timeout | null = null;

  // 无活动超时时间（毫秒）：30 分钟无新消息视为会议暂停
  private readonly INACTIVITY_TIMEOUT = 30 * 60 * 1000;

  /**
   * 判断是否正在进行会议
   */
  isInMeeting(): boolean {
    return this.currentMeeting?.status === MeetingStatus.ACTIVE;
  }

  /**
   * 获取当前会议
   */
  getCurrentMeeting(): Meeting | null {
    return this.currentMeeting;
  }

  /**
   * 开始新会议
   */
  startMeeting(meeting: Omit<Meeting, 'id' | 'startedAt' | 'status'>): Meeting {
    const newMeeting: Meeting = {
      ...meeting,
      id: `meeting_${Date.now()}_${nanoid(8)}`,
      startedAt: Date.now(),
      status: MeetingStatus.ACTIVE,
    };

    this.currentMeeting = newMeeting;
    this.resetActivityTimer();

    // 广播会议开始
    this.broadcastEvent('meeting_started', newMeeting);

    return newMeeting;
  }

  /**
   * 结束会议
   */
  endMeeting(): Meeting | null {
    if (!this.currentMeeting) return null;

    this.currentMeeting.status = MeetingStatus.ENDED;
    this.currentMeeting.endedAt = Date.now();

    const endedMeeting = this.currentMeeting;
    this.currentMeeting = null;

    // 停止活动计时器
    if (this.meetingActivityTimeout) {
      clearTimeout(this.meetingActivityTimeout);
    }

    // 广播会议结束
    this.broadcastEvent('meeting_ended', endedMeeting);

    // 持久化会议记录
    this.persistMeeting(endedMeeting);

    return endedMeeting;
  }

  /**
   * 处理会议中的消息（重置活动计时器）
   */
  onMeetingActivity(): void {
    if (this.currentMeeting?.status === MeetingStatus.ACTIVE) {
      this.resetActivityTimer();
    }
  }

  /**
   * 重置活动计时器
   */
  private resetActivityTimer(): void {
    if (this.meetingActivityTimeout) {
      clearTimeout(this.meetingActivityTimeout);
    }

    this.meetingActivityTimeout = setTimeout(() => {
      // 超时暂停会议
      if (this.currentMeeting?.status === MeetingStatus.ACTIVE) {
        console.log('[Meeting] Inactivity timeout, pausing meeting');
        this.currentMeeting.status = MeetingStatus.PAUSED;
        this.broadcastEvent('meeting_paused', { meetingId: this.currentMeeting.id });
      }
    }, this.INACTIVITY_TIMEOUT);
  }
}
```

### 2.2 会议状态存储

#### 2.2.1 存储方案对比

| 方案 | 优点 | 缺点 | 推荐场景 |
|------|------|------|----------|
| **内存 (Map)** | 访问速度极快 (< 1ms) | 重启丢失 | 当前会议状态 |
| **Redis** | 持久化 + 过期机制 + 集群 | 需要额外部署 | 多实例共享、会议中断恢复 |
| **SQLite/PostgreSQL** | 可靠持久化，支持查询 | 相对慢 | 会议历史存档 |

**推荐：混合存储方案**
- **当前会议状态**: 内存 (Map) + Redis Pub/Sub 同步
- **会议历史**: PostgreSQL/SQLite

```typescript
// src/services/meeting/MeetingStore.ts

class MeetingStore {
  // 内存存储：当前会议（最快的热路径）
  private currentMeeting: Meeting | null = null;

  // 参与者 Map：agentId -> Participant
  private participants: Map<string, Participant> = new Map();

  // 消息缓冲区：最近 500 条会议消息
  private messageBuffer: Message[] = [];

  // Redis 客户端（可选，用于多实例）
  private redis: Redis | null = null;

  constructor(private config: { useRedis: boolean; redisUrl?: string }) {
    if (config.useRedis && config.redisUrl) {
      this.redis = new Redis(config.redisUrl);
    }
  }

  /**
   * 保存当前会议状态到 Redis（用于崩溃恢复）
   */
  async persistToRedis(): Promise<void> {
    if (!this.redis || !this.currentMeeting) return;

    const key = `meeting:current:${this.currentMeeting.id}`;
    await this.redis.set(key, JSON.stringify({
      meeting: this.currentMeeting,
      participants: Array.from(this.participants.entries()),
      messageBuffer: this.messageBuffer,
      persistedAt: Date.now(),
    }), 'EX', 86400); // 24 小时过期
  }

  /**
   * 从 Redis 恢复会议状态
   */
  async restoreFromRedis(): Promise<Meeting | null> {
    if (!this.redis) return null;

    const keys = await this.redis.keys('meeting:current:*');
    if (keys.length === 0) return null;

    const data = await this.redis.get(keys[0]);
    if (!data) return null;

    const parsed = JSON.parse(data);
    this.currentMeeting = parsed.meeting;
    this.participants = new Map(parsed.participants);
    this.messageBuffer = parsed.messageBuffer;

    return this.currentMeeting;
  }

  /**
   * 获取参与者（带缓存）
   */
  getParticipant(agentId: string): Participant | undefined {
    return this.participants.get(agentId);
  }

  /**
   * 添加参与者
   */
  addParticipant(participant: Participant): void {
    this.participants.set(participant.agentId, participant);

    if (this.currentMeeting) {
      this.currentMeeting.participants.push(participant);
    }
  }

  /**
   * 移除参与者
   */
  removeParticipant(agentId: string): void {
    const participant = this.participants.get(agentId);
    if (participant) {
      participant.leftAt = Date.now();
      this.participants.delete(agentId);
    }
  }

  /**
   * 获取所有参与者
   */
  getAllParticipants(): Participant[] {
    return Array.from(this.participants.values());
  }

  /**
   * 添加会议消息
   */
  addMessage(message: Message): void {
    this.messageBuffer.push(message);

    // 保持缓冲区大小
    if (this.messageBuffer.length > 500) {
      this.messageBuffer = this.messageBuffer.slice(-500);
    }

    // 更新参与者发言时间
    const participant = this.participants.get(message.agentId);
    if (participant) {
      participant.speakingTimeMs += message.content.length * 50; // 估算
    }
  }
}
```

### 2.3 参与者列表管理

```typescript
// src/services/meeting/ParticipantManager.ts

class ParticipantManager {
  private participants: Map<string, ParticipantState> = new Map();

  interface ParticipantState {
    info: Participant;
    socketIds: Set<string>;        // 该参与者关联的 WebSocket 连接
    lastActivity: number;           // 最后活动时间
    speakingStats: {
      totalTimeMs: number;
      messageCount: number;
      avgMessageLength: number;
    };
  }

  /**
   * 参与者加入会议
   */
  join(participant: Participant, socketId?: string): void {
    const state: ParticipantState = {
      info: participant,
      socketIds: new Set(socketId ? [socketId] : []),
      lastActivity: Date.now(),
      speakingStats: {
        totalTimeMs: 0,
        messageCount: 0,
        avgMessageLength: 0,
      },
    };

    this.participants.set(participant.agentId, state);

    // 广播加入事件
    this.eventEmitter.emit('participant_joined', {
      participant: participant,
      currentCount: this.participants.size,
    });
  }

  /**
   * 参与者离开会议
   */
  leave(agentId: string, reason: 'voluntary' | 'kicked' | 'timeout'): void {
    const state = this.participants.get(agentId);
    if (!state) return;

    state.info.leftAt = Date.now();
    this.participants.delete(agentId);

    // 广播离开事件
    this.eventEmitter.emit('participant_left', {
      agentId,
      reason,
      participant: state.info,
      currentCount: this.participants.size,
    });
  }

  /**
   * 更新参与者活跃状态
   */
  updateActivity(agentId: string): void {
    const state = this.participants.get(agentId);
    if (state) {
      state.lastActivity = Date.now();
    }
  }

  /**
   * 记录发言
   */
  recordSpeech(agentId: string, messageLength: number): void {
    const state = this.participants.get(agentId);
    if (!state) return;

    state.speakingStats.messageCount++;
    state.speakingStats.totalTimeMs += messageLength * 50; // 估算
    state.speakingStats.avgMessageLength =
      state.speakingStats.totalTimeMs / state.speakingStats.messageCount / 50;
  }

  /**
   * 获取发言统计排行
   */
  getSpeakingRanking(): Array<{ agentId: string; speakingTimeMs: number }> {
    return Array.from(this.participants.entries())
      .map(([agentId, state]) => ({
        agentId,
        speakingTimeMs: state.speakingStats.totalTimeMs,
      }))
      .sort((a, b) => b.speakingTimeMs - a.speakingTimeMs);
  }

  /**
   * 检测参与者超时（心跳）
   */
  checkTimeouts(timeoutMs: number = 60000): string[] {
    const now = Date.now();
    const timedOut: string[] = [];

    for (const [agentId, state] of this.participants) {
      if (now - state.lastActivity > timeoutMs) {
        timedOut.push(agentId);
      }
    }

    return timedOut;
  }

  /**
   * 绑定 WebSocket 连接
   */
  bindSocket(agentId: string, socketId: string): void {
    const state = this.participants.get(agentId);
    if (state) {
      state.socketIds.add(socketId);
    }
  }

  /**
   * 解绑 WebSocket 连接
   */
  unbindSocket(agentId: string, socketId: string): void {
    const state = this.participants.get(agentId);
    if (state) {
      state.socketIds.delete(socketId);
    }
  }
}
```

### 2.4 会议结束判断

```typescript
// src/services/meeting/MeetingEndDetector.ts

class MeetingEndDetector {
  // 结束条件配置
  private readonly END_CONDITIONS = {
    // 全部参与者离开
    allParticipantsLeft: true,
    // 无消息超时（分钟）
    noMessageTimeoutMin: 30,
    // 主持人手动结束
    hostEndRequired: false,
    // 最长会议时间（分钟）
    maxDurationMin: 480, // 8 小时
  };

  private lastMessageTime: number = Date.now();

  /**
   * 检测会议是否应该结束
   */
  shouldEnd(meeting: Meeting): { shouldEnd: boolean; reason: string } {
    const now = Date.now();

    // 条件1: 主持人手动结束
    if (meeting.endedAt) {
      return { shouldEnd: true, reason: 'host_ended' };
    }

    // 条件2: 全部参与者离开
    if (this.END_CONDITIONS.allParticipantsLeft) {
      const activeParticipants = meeting.participants.filter(p => !p.leftAt);
      if (activeParticipants.length === 0) {
        return { shouldEnd: true, reason: 'all_participants_left' };
      }
    }

    // 条件3: 无消息超时
    const noMessageDuration = (now - this.lastMessageTime) / 1000 / 60;
    if (noMessageDuration > this.END_CONDITIONS.noMessageTimeoutMin) {
      return { shouldEnd: true, reason: 'inactivity_timeout' };
    }

    // 条件4: 最长会议时间
    const durationMin = (now - meeting.startedAt) / 1000 / 60;
    if (durationMin > this.END_CONDITIONS.maxDurationMin) {
      return { shouldEnd: true, reason: 'max_duration_reached' };
    }

    return { shouldEnd: false, reason: '' };
  }

  /**
   * 记录消息时间
   */
  recordMessage(): void {
    this.lastMessageTime = Date.now();
  }

  /**
   * 启动结束检测循环
   */
  startDetectionLoop(meetingManager: MeetingStateManager): void {
    setInterval(() => {
      const meeting = meetingManager.getCurrentMeeting();
      if (!meeting) return;

      const { shouldEnd, reason } = this.shouldEnd(meeting);
      if (shouldEnd) {
        console.log(`[Meeting] Ending meeting due to: ${reason}`);
        meetingManager.endMeeting();
      }
    }, 60000); // 每分钟检测一次
  }
}
```

---

## 3. 数据流设计

### 3.1 完整数据流路径

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              完整数据流                                        │
└──────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
  │ OpenClaw    │      │  Monitor         │      │  Frontend       │
  │ Gateway     │      │  Backend         │      │  (Browser)      │
  │             │      │                  │      │                 │
  │ - WS Server │      │ ┌──────────────┐ │      │ ┌─────────────┐ │
  │ - Session   │      │ │ GatewayConn  │ │      │ │ Vue/React   │ │
  │   Events    │      │ │ (消息捕获)   │ │      │ │ (UI渲染)    │ │
  │ - Messages  │      │ └──────┬───────┘ │      │ └──────┬──────┘ │
  └──────┬──────┘      │        │          │      │        │         │
         │              │        ▼          │      │        │         │
         │ WebSocket    │ ┌──────────────┐ │      │        │         │
         │──────────────┼►│ Message      │ │      │        │         │
         │              │ │ Processor    │ │      │        │         │
         │              │ │ (过滤/解析)   │ │      │        │         │
         │              │ └──────┬───────┘ │      │        │         │
         │              │        │          │      │        │         │
         │              │        ▼          │      │        │         │
         │              │ ┌──────────────┐ │      │        │         │
         │              │ │ Meeting      │ │      │        │         │
         │              │ │ Manager      │ │      │        │         │
         │              │ │ (状态管理)   │ │      │        │         │
         │              │ └──────┬───────┘ │      │        │         │
         │              │        │          │      │        │         │
         │              │        ▼          │      │        │         │
         │              │ ┌──────────────┐ │      │        │         │
         │              │ │ Event        │ │      │        │         │
         │              │ │ Broadcaster │ │      │        │         │
         │              │ └──────┬───────┘ │      │        │         │
         │              │        │          │      │        │         │
         │              │        │ WebSocket│      │        │         │
         │              │        │──────────┼──────┼────────┘         │
         │              │        │          │      │                  │
         │              │        ▼          │      │                  │
         │              │ ┌──────────────┐  │      │ ┌─────────────┐  │
         │              │ │ Redis        │  │      │ │ Browser     │  │
         │              │ │ (可选缓存)   │  │      │ │ WebSocket   │  │
         │              │ └──────────────┘  │      │ │ Client      │  │
         │              │                   │      │ └─────────────┘  │
         │              │        │          │      │        │         │
         │              │        ▼          │      │        ▼         │
         │              │ ┌──────────────┐  │      │ ┌─────────────┐  │
         │              │ │ Database     │  │      │ │ DOM/CSS     │  │
         │              │ │ (Prisma)     │  │      │ │ Animation   │  │
         │              │ └──────────────┘  │      │ └─────────────┘  │
         │              │                   │      │                  │
         └──────────────┘                   └──────┴──────────────────┘

  消息流编号说明:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [1] Gateway → Backend (WebSocket)
      - 协议: ws://
      - 消息: session_message, agent_event, state_update
      - 延迟目标: < 50ms

  [2] Backend 内部处理
      - MessageProcessor: 消息解析、过滤、格式化
      - MeetingManager: 会议状态更新
      - 延迟目标: < 20ms

  [3] Backend → Frontend (WebSocket)
      - 协议: ws:// 或 wss://
      - 消息: bubble_message, participant_update, scene_change
      - 延迟目标: < 100ms

  [4] 可选缓存层
      - Redis Pub/Sub 用于多实例部署
      - 本地部署可省略

  [5] 持久化
      - 异步写入，不阻塞消息流
      - 批量写入优化
```

### 3.2 模块职责划分

```
┌─────────────────────────────────────────────────────────────────┐
│                      Monitor Backend                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    入口层 (Entry Layer)                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ index.ts    │  │ config.ts   │  │ server.ts      │   │  │
│  │  │ (启动入口)   │  │ (配置管理)   │  │ (HTTP/WS 服务器) │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                    插件层 (Plugin Layer)                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ ws-plugin   │  │ prisma-plug │  │ auth-plugin    │   │  │
│  │  │ (WebSocket) │  │ (ORM 客户端) │  │ (认证授权)     │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                   业务层 (Business Layer)                  │  │
│  │                                                           │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌───────────┐ │  │
│  │  │ GatewayConnector│  │ MessageProcessor│  │ Meeting   │ │  │
│  │  │ [消息捕获]       │──│ [消息处理]       │──│ Manager   │ │  │
│  │  │                 │  │                 │  │ [会议管理] │ │  │
│  │  └─────────────────┘  └─────────────────┘  └─────┬─────┘ │  │
│  │                                                  │       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐       │       │  │
│  │  │ ParticipantMgr  │  │ SceneManager    │◄──────┘       │  │
│  │  │ [参与者管理]     │  │ [场景管理]       │               │  │
│  │  └─────────────────┘  └─────────────────┘               │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────┼──────────────────────────────┐  │
│  │                   广播层 (Broadcast Layer)                 │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              WsBroadcaster                           │  │  │
│  │  │  - 管理所有客户端连接                                 │  │  │
│  │  │  - 消息广播（单播/广播/条件广播）                     │  │  │
│  │  │  - 连接状态管理                                       │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                   数据层 (Data Layer)                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ RedisStore  │  │ MeetingRepo │  │ MessageRepo     │   │  │
│  │  │ (缓存)      │  │ (会议仓储)   │  │ (消息仓储)      │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 模块间通信

```typescript
// src/core/EventBus.ts

/**
 * 事件总线：模块间通信中枢
 * 使用 TypeScript 泛型确保类型安全
 */
class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * 订阅事件
   */
  on<T = unknown>(event: string, handler: (data: T) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // 返回取消订阅函数
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * 发送事件（异步，不等待处理）
   */
  emit<T = unknown>(event: string, data: T): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;

    // 异步执行，不阻塞
    setImmediate(() => {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`[EventBus] Handler error for ${event}:`, error);
        }
      }
    });
  }

  /**
   * 发送事件（同步，等待所有处理器完成）
   */
  async emitSync<T = unknown>(event: string, data: T): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers) return;

    await Promise.all(
      Array.from(handlers).map(async (handler) => {
        try {
          await handler(data);
        } catch (error) {
          console.error(`[EventBus] Sync handler error for ${event}:`, error);
        }
      })
    );
  }
}

// 全局事件总线实例
const eventBus = new EventBus();

// 定义事件类型
const Events = {
  // Gateway 消息事件
  GATEWAY_MESSAGE: 'gateway:message',
  GATEWAY_CONNECTED: 'gateway:connected',
  GATEWAY_DISCONNECTED: 'gateway:disconnected',

  // 会议事件
  MEETING_STARTED: 'meeting:started',
  MEETING_ENDED: 'meeting:ended',
  MEETING_PAUSED: 'meeting:paused',
  MEETING_MESSAGE: 'meeting:message',

  // 参与者事件
  PARTICIPANT_JOINED: 'participant:joined',
  PARTICIPANT_LEFT: 'participant:left',
  PARTICIPANT_SPEAKING: 'participant:speaking',

  // 场景事件
  SCENE_CHANGED: 'scene:changed',

  // 前端推送事件
  PUSH_BUBBLE: 'push:bubble',
  PUSH_STATE: 'push:state',
  PUSH_SCENE: 'push:scene',
} as const;

// 使用示例
eventBus.on(Events.GATEWAY_MESSAGE, (message: GatewayMessage) => {
  // 消息处理器处理
});

eventBus.emit(Events.MEETING_MESSAGE, {
  meetingId: 'xxx',
  message: bubbleMessage,
});
```

### 3.4 消息处理流水线

```typescript
// src/services/MessagePipeline.ts

/**
 * 消息处理流水线
 * Gateway 消息 -> 过滤器 -> 解析器 -> 格式化器 -> 广播器
 */
class MessagePipeline {
  constructor(
    private filters: MessageFilter[],
    private parser: MessageParser,
    private formatter: BubbleFormatter,
    private broadcaster: WsBroadcaster
  ) {}

  /**
   * 处理来自 Gateway 的消息
   */
  async process(rawMessage: GatewayMessage): Promise<void> {
    // Step 1: 过滤器链
    for (const filter of this.filters) {
      if (!filter.shouldProcess(rawMessage)) {
        return; // 被过滤掉
      }
    }

    // Step 2: 解析消息
    const parsed = await this.parser.parse(rawMessage);
    if (!parsed) {
      console.warn('[Pipeline] Parse failed:', rawMessage);
      return;
    }

    // Step 3: 格式化气泡
    const bubble = await this.formatter.format(parsed);

    // Step 4: 广播给前端
    this.broadcaster.broadcast({
      type: 'bubble_message',
      payload: bubble,
      timestamp: Date.now(),
    });

    // Step 5: 更新会议状态
    eventBus.emit(Events.MEETING_MESSAGE, bubble);
  }
}

/**
 * 消息过滤器
 */
interface MessageFilter {
  shouldProcess(message: GatewayMessage): boolean;
}

class MeetingMessageFilter implements MessageFilter {
  constructor(private meetingManager: MeetingStateManager) {}

  shouldProcess(message: GatewayMessage): boolean {
    // 只处理正在开会时的消息
    return this.meetingManager.isInMeeting();
  }
}

class DuplicateMessageFilter implements MessageFilter {
  private seenIds = new Set<string>();
  private readonly MAX_CACHE = 1000;

  shouldProcess(message: GatewayMessage): boolean {
    if (message.id && this.seenIds.has(message.id)) {
      return false; // 重复消息
    }
    this.seenIds.add(message.id);
    if (this.seenIds.size > this.MAX_CACHE) {
      const first = this.seenIds.values().next().value;
      this.seenIds.delete(first);
    }
    return true;
  }
}

/**
 * 消息解析器
 */
class MessageParser {
  parse(message: GatewayMessage): ParsedMessage | null {
    switch (message.type) {
      case 'session_message':
        return this.parseSessionMessage(message);
      case 'agent_event':
        return this.parseAgentEvent(message);
      default:
        return null;
    }
  }

  private parseSessionMessage(msg: GatewayMessage): ParsedMessage {
    return {
      id: msg.id,
      agentId: msg.sessionId, // 或从 payload 提取
      content: msg.payload?.content || '',
      contentType: msg.payload?.contentType || 'text',
      timestamp: msg.timestamp,
    };
  }

  private parseAgentEvent(msg: GatewayMessage): ParsedMessage {
    // 处理 agent 事件
    return {
      id: msg.id,
      agentId: msg.payload?.agentId || 'system',
      content: msg.payload?.description || '',
      contentType: 'event',
      timestamp: msg.timestamp,
    };
  }
}

/**
 * 气泡格式化器
 */
class BubbleFormatter {
  async format(parsed: ParsedMessage): Promise<BubbleMessage> {
    return {
      id: `bubble_${parsed.id}`,
      agentId: parsed.agentId,
      content: parsed.content,
      contentType: parsed.contentType,
      timestamp: parsed.timestamp,
      status: 'confirmed',
      avatar: await this.getAvatar(parsed.agentId),
    };
  }

  private async getAvatar(agentId: string): Promise<string> {
    // 从配置获取 agent 头像
    return AVATAR_CONFIG[agentId]?.avatar || 'default';
  }
}
```

---

## 4. 存储设计

### 4.1 存储需求分析

| 数据类型 | 存储需求 | 容量预估 | 保留策略 |
|----------|----------|----------|----------|
| 会议元数据 | 必需 | 每会议约 1KB | 永久保留 |
| 会议消息 | 必需 | 每消息约 0.5KB × 1000 = 500KB | 永久保留 |
| Agent 状态快照 | 可选 | 每快照约 2KB × 100 = 200KB | 30 天 |
| 场景快照 | 可选 | 每快照约 5KB | 30 天 |

### 4.2 数据库模型

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// 会议表
model Meeting {
  id          String    @id  // meeting_{timestamp}_{nanoid}
  name        String
  hostAgentId String    // 主持人 ID
  startedAt   BigInt   // 开始时间戳
  endedAt     BigInt?  // 结束时间戳
  status      String   // scheduled / active / paused / ended
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  participants Participant[]
  messages     Message[]
  decisions    Decision[]

  @@index([status])
  @@index([startedAt])
}

// 参与者表
model Participant {
  id            String   @id @default(cuid())
  meetingId     String
  agentId       String
  name          String
  role          String   // host / speaker / listener / observer
  joinedAt      BigInt
  leftAt        BigInt?
  speakingTimeMs BigInt @default(0)

  meeting       Meeting  @relation(fields: [meetingId], references: [id])
  messages      Message[]

  @@unique([meetingId, agentId])
  @@index([meetingId])
}

// 消息表
model Message {
  id          String   @id  // msg_{timestamp}_{nanoid}
  meetingId   String
  participantId String
  agentId     String
  content     String
  contentType String   // text / event / command
  timestamp   BigInt

  participant Participant @relation(fields: [participantId], references: [id])

  @@index([meetingId, timestamp])
  @@index([meetingId])
}

// 决策记录表
model Decision {
  id          String   @id @default(cuid())
  meetingId   String
  content     String
  madeBy      String   // agentId
  timestamp   BigInt
  metadata    String?  // JSON 扩展字段

  meeting     Meeting  @relation(fields: [meetingId], references: [id])

  @@index([meetingId])
}

// Agent 状态历史（可选，用于监控）
model AgentStateSnapshot {
  id          Int      @id @default(autoincrement())
  agentId     String
  timestamp   BigInt
  cpuPercent  Float
  memoryMb    Float
  status      String
  metadata    String?  // JSON

  @@index([agentId, timestamp])
  @@index([timestamp])
}
```

### 4.3 存储服务设计

```typescript
// src/services/storage/MeetingStorage.ts

class MeetingStorage {
  constructor(private prisma: PrismaClient) {}

  /**
   * 创建会议
   */
  async createMeeting(data: {
    name: string;
    hostAgentId: string;
  }): Promise<Meeting> {
    return this.prisma.meeting.create({
      data: {
        id: `meeting_${Date.now()}_${nanoid(8)}`,
        name: data.name,
        hostAgentId: data.hostAgentId,
        startedAt: BigInt(Date.now()),
        status: 'active',
      },
    });
  }

  /**
   * 保存会议消息（批量优化）
   */
  async saveMessages(messages: Array<{
    meetingId: string;
    participantId: string;
    agentId: string;
    content: string;
    contentType: string;
    timestamp: number;
  }>): Promise<void> {
    if (messages.length === 0) return;

    // 批量写入，最多 100 条一批
    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      await this.prisma.message.createMany({
        data: batch.map(m => ({
          id: `msg_${m.timestamp}_${nanoid(6)}`,
          ...m,
          timestamp: BigInt(m.timestamp),
        })),
      });
    }
  }

  /**
   * 查询会议历史
   */
  async getMeetingHistory(options: {
    page: number;
    pageSize: number;
    status?: string;
    startDate?: number;
    endDate?: number;
  }): Promise<{ meetings: Meeting[]; total: number }> {
    const where: any = {};

    if (options.status) where.status = options.status;
    if (options.startDate || options.endDate) {
      where.startedAt = {};
      if (options.startDate) where.startedAt.gte = BigInt(options.startDate);
      if (options.endDate) where.startedAt.lte = BigInt(options.endDate);
    }

    const [meetings, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
        include: {
          _count: {
            select: { messages: true, participants: true },
          },
        },
      }),
      this.prisma.meeting.count({ where }),
    ]);

    return { meetings, total };
  }

  /**
   * 获取会议详情（含消息）
   */
  async getMeetingDetail(meetingId: string, options?: {
    messageLimit?: number;
    messageOffset?: number;
  }): Promise<Meeting & { messages: Message[] }> {
    const meeting = await this.prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      include: {
        participants: true,
        messages: {
          orderBy: { timestamp: 'asc' },
          take: options?.messageLimit || 100,
          skip: options?.messageOffset || 0,
        },
        decisions: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    return meeting;
  }

  /**
   * 清理旧数据（定时任务）
   */
  async cleanupOldData(retentionDays: number = 90): Promise<number> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    // 删除旧消息
    const messageResult = await this.prisma.message.deleteMany({
      where: {
        timestamp: { lt: BigInt(cutoffTime) },
      },
    });

    // 删除旧状态快照（保留最近 30 天）
    const snapshotResult = await this.prisma.agentStateSnapshot.deleteMany({
      where: {
        timestamp: { lt: BigInt(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    return messageResult.count;
  }
}
```

### 4.4 历史会议查看

```typescript
// src/routes/history.ts

/**
 * 历史会议列表 API
 */
async function getMeetingHistory(fastify: FastifyInstance) {
  fastify.get('/api/meetings', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'string', enum: ['active', 'ended', 'paused'] },
          startDate: { type: 'integer' },
          endDate: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const { page, pageSize, status, startDate, endDate } = request.query;

    const result = await meetingStorage.getMeetingHistory({
      page: Number(page),
      pageSize: Number(pageSize),
      status,
      startDate: startDate ? Number(startDate) : undefined,
      endDate: endDate ? Number(endDate) : undefined,
    });

    return {
      meetings: result.meetings.map(m => ({
        id: m.id,
        name: m.name,
        hostAgentId: m.hostAgentId,
        startedAt: Number(m.startedAt),
        endedAt: m.endedAt ? Number(m.endedAt) : null,
        status: m.status,
        participantCount: (m as any)._count?.participants || 0,
        messageCount: (m as any)._count?.messages || 0,
      })),
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total: result.total,
        totalPages: Math.ceil(result.total / Number(pageSize)),
      },
    };
  });
}

/**
 * 单个会议详情 API
 */
async function getMeetingDetail(fastify: FastifyInstance) {
  fastify.get('/api/meetings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const meeting = await meetingStorage.getMeetingDetail(id);

    return {
      ...meeting,
      startedAt: Number(meeting.startedAt),
      endedAt: meeting.endedAt ? Number(meeting.endedAt) : null,
      messages: meeting.messages.map(m => ({
        ...m,
        timestamp: Number(m.timestamp),
      })),
    };
  });
}

/**
 * 导出会议记录（JSON 格式）
 */
async function exportMeeting(fastify: FastifyInstance) {
  fastify.get('/api/meetings/:id/export', async (request, reply) => {
    const { id } = request.params;
    const meeting = await meetingStorage.getMeetingDetail(id, {
      messageLimit: 10000, // 最大导出 10000 条消息
    });

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="meeting_${id}.json"`);

    return {
      exportTime: Date.now(),
      meeting: {
        id: meeting.id,
        name: meeting.name,
        hostAgentId: meeting.hostAgentId,
        startedAt: Number(meeting.startedAt),
        endedAt: meeting.endedAt ? Number(meeting.endedAt) : null,
        participants: meeting.participants.map(p => ({
          agentId: p.agentId,
          name: p.name,
          role: p.role,
          joinedAt: Number(p.joinedAt),
          leftAt: p.leftAt ? Number(p.leftAt) : null,
          speakingTimeMs: Number(p.speakingTimeMs),
        })),
        decisions: meeting.decisions.map(d => ({
          content: d.content,
          madeBy: d.madeBy,
          timestamp: Number(d.timestamp),
        })),
      },
      messages: meeting.messages.map(m => ({
        id: m.id,
        agentId: m.agentId,
        content: m.content,
        contentType: m.contentType,
        timestamp: Number(m.timestamp),
      })),
    };
  });
}
```

---

## 5. 可靠性设计

### 5.1 消息丢失防护

#### 5.1.1 多层消息缓冲

```typescript
// src/services/reliability/MessageBuffer.ts

/**
 * 多层消息缓冲机制
 *
 * Layer 1: 内存环形缓冲区（热数据，毫秒级访问）
 * Layer 2: Redis 缓冲区（中转，防止进程崩溃丢失）
 * Layer 3: 数据库持久化（冷数据，最终保证）
 */

class MultiLayerMessageBuffer {
  // Layer 1: 内存环形缓冲区
  private ringBuffer: Array<GatewayMessage | null>;
  private ringHead = 0;
  private ringSize = 1000;

  // Layer 2: Redis 缓冲区
  private redisListKey = 'gateway:message:buffer';
  private redisMaxLen = 5000;

  // 待确认消息
  private pendingAcks: Map<string, {
    message: GatewayMessage;
    sentAt: number;
    retryCount: number;
  }> = new Map();

  constructor(private redis: Redis | null) {
    this.ringBuffer = new Array(this.ringSize).fill(null);
  }

  /**
   * 添加消息到缓冲区
   */
  async push(message: GatewayMessage): Promise<void> {
    // Layer 1: 写入内存环
    this.ringBuffer[this.ringHead] = message;
    this.ringHead = (this.ringHead + 1) % this.ringSize;

    // Layer 2: 写入 Redis
    if (this.redis) {
      await this.redis.lpush(this.redisListKey, JSON.stringify(message));
      await this.redis.ltrim(this.redisListKey, 0, this.redisMaxLen - 1);
    }
  }

  /**
   * 获取缓冲消息
   */
  async getBuffered(count: number = 100): Promise<GatewayMessage[]> {
    if (this.redis) {
      const raw = await this.redis.lrange(this.redisListKey, 0, count - 1);
      return raw.map(r => JSON.parse(r)).reverse();
    }

    // Fallback: 从内存环读取
    const result: GatewayMessage[] = [];
    for (let i = 0; i < count && i < this.ringSize; i++) {
      const idx = (this.ringHead - 1 - i + this.ringSize) % this.ringSize;
      if (this.ringBuffer[idx]) {
        result.push(this.ringBuffer[idx]!);
      }
    }
    return result;
  }

  /**
   * 消息确认处理
   */
  async ack(messageId: string): Promise<void> {
    this.pendingAcks.delete(messageId);
  }

  /**
   * 重发未确认消息
   */
  async resendUnacked(maxRetries: number = 3): Promise<void> {
    const now = Date.now();
    const timeout = 5000; // 5秒超时

    for (const [id, entry] of this.pendingAcks) {
      if (now - entry.sentAt > timeout) {
        if (entry.retryCount >= maxRetries) {
          console.warn(`[Buffer] Message ${id} exceeded max retries, dropping`);
          this.pendingAcks.delete(id);
        } else {
          entry.retryCount++;
          entry.sentAt = now;
          // 重新发送
          this.emit('resend', entry.message);
        }
      }
    }
  }
}
```

#### 5.1.2 Gateway 消息补抓

```typescript
// src/services/gateway/MessageRecovery.ts

/**
 * Gateway 消息恢复机制
 * 当 WebSocket 断开重连后，补抓丢失的消息
 */
class MessageRecovery {
  private lastProcessedId: string | null = null;
  private lastProcessedTime: number = Date.now();

  constructor(private gatewayApiUrl: string) {}

  /**
   * 重连后补抓消息
   */
  async recoverMissedMessages(
    sinceMessageId?: string,
    sinceTime?: number
  ): Promise<GatewayMessage[]> {
    const since = sinceMessageId || this.lastProcessedId;
    const time = sinceTime || this.lastProcessedTime;

    try {
      // 调用 Gateway HTTP API 获取消息历史
      const response = await fetch(
        `${this.gatewayApiUrl}/api/sessions/messages?since=${since}&sinceTime=${time}&limit=500`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(`Gateway API error: ${response.status}`);
      }

      const messages: GatewayMessage[] = await response.json();

      // 过滤已处理的消息
      const newMessages = messages.filter(msg =>
        !this.lastProcessedId || this.compareMessageId(msg.id, this.lastProcessedId) > 0
      );

      // 更新游标
      if (messages.length > 0) {
        const last = messages[messages.length - 1];
        this.lastProcessedId = last.id;
        this.lastProcessedTime = last.timestamp;
      }

      console.log(`[Recovery] Recovered ${newMessages.length} missed messages`);
      return newMessages;

    } catch (error) {
      console.error('[Recovery] Failed to recover messages:', error);
      return [];
    }
  }

  /**
   * 比较消息 ID（假设 ID 包含时间戳）
   */
  private compareMessageId(id1: string, id2: string): number {
    // 简单实现：假设 ID 格式为 msg_{timestamp}_{nanoid}
    const time1 = parseInt(id1.split('_')[1] || '0');
    const time2 = parseInt(id2.split('_')[1] || '0');
    return time1 - time2;
  }
}
```

### 5.2 高并发处理

#### 5.2.1 WebSocket 连接管理

```typescript
// src/services/ws/ConnectionPool.ts

/**
 * WebSocket 连接池
 * 支持连接限流、心跳检测、优雅关闭
 */
class ConnectionPool {
  private connections: Map<string, WebSocketConnection> = new Map();
  private connectionCounter = 0;

  // 配置
  private readonly MAX_CONNECTIONS = 1000;    // 最大连接数
  private readonly MAX_PER_IP = 50;             // 单 IP 最大连接
  private readonly HEARTBEAT_INTERVAL = 30000; // 30秒心跳

  private ipCounts: Map<string, number> = new Map();

  /**
   * 添加连接
   */
  add(socket: WebSocket, request: IncomingMessage): ConnectionResult {
    const ip = this.getClientIp(request);

    // 检查连接数限制
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      return { success: false, reason: 'server_full' };
    }

    // 检查单 IP 限制
    const currentIpCount = this.ipCounts.get(ip) || 0;
    if (currentIpCount >= this.MAX_PER_IP) {
      return { success: false, reason: 'ip_limit_exceeded' };
    }

    // 创建连接对象
    const connId = `conn_${++this.connectionCounter}`;
    const conn: WebSocketConnection = {
      id: connId,
      socket,
      ip,
      userId: null,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      subscribedEvents: new Set(['meeting_message', 'meeting_state']),
    };

    this.connections.set(connId, conn);
    this.ipCounts.set(ip, currentIpCount + 1);

    // 设置心跳
    this.startHeartbeat(connId);

    return { success: true, connId };
  }

  /**
   * 移除连接
   */
  remove(connId: string): void {
    const conn = this.connections.get(connId);
    if (!conn) return;

    // 清理 IP 计数
    const ipCount = this.ipCounts.get(conn.ip);
    if (ipCount) {
      if (ipCount <= 1) {
        this.ipCounts.delete(conn.ip);
      } else {
        this.ipCounts.set(conn.ip, ipCount - 1);
      }
    }

    // 停止心跳
    conn.heartbeatTimer?.forEach(t => clearInterval(t));

    this.connections.delete(connId);
  }

  /**
   * 广播消息
   */
  broadcast(event: string, payload: unknown, filter?: (conn: WebSocketConnection) => boolean): number {
    let sent = 0;

    for (const conn of this.connections.values()) {
      if (conn.socket.readyState !== WebSocket.OPEN) continue;

      // 应用过滤器
      if (filter && !filter(conn)) continue;

      // 检查订阅
      if (!conn.subscribedEvents.has(event)) continue;

      try {
        conn.socket.send(JSON.stringify({ event, payload, timestamp: Date.now() }));
        sent++;
      } catch (error) {
        console.error(`[Pool] Failed to send to ${conn.id}:`, error);
      }
    }

    return sent;
  }

  /**
   * 获取连接统计
   */
  getStats(): ConnectionStats {
    return {
      total: this.connections.size,
      byIp: Object.fromEntries(this.ipCounts),
      oldestConnection: this.getOldestConnectionAge(),
    };
  }
}
```

#### 5.2.2 消息发送限流

```typescript
// src/services/ws/ThrottledSender.ts

/**
 * 限流消息发送器
 * 防止高频消息刷屏，保护前端渲染
 */
class ThrottledSender {
  // 每客户端发送队列
  private clientQueues: Map<string, MessageQueue> = new Map();

  // 全局限流配置
  private readonly MAX_MESSAGES_PER_SECOND = 20;  // 每秒最多 20 条
  private readonly BURST_ALLOWANCE = 30;          // 允许的突发量

  // 速率限制器（令牌桶）
  private rateLimiter = new TokenBucket({
    capacity: this.BURST_ALLOWANCE,
    refillRate: this.MAX_MESSAGES_PER_SECOND,
  });

  constructor(private broadcaster: ConnectionPool) {}

  /**
   * 排队发送消息（自动限流）
   */
  queueMessage(connId: string, event: string, payload: unknown): void {
    if (!this.clientQueues.has(connId)) {
      this.clientQueues.set(connId, new MessageQueue(connId, this.broadcaster));
    }

    const queue = this.clientQueues.get(connId)!;
    queue.enqueue({ event, payload });

    // 触发发送循环
    queue.startDrain();
  }

  /**
   * 广播消息（带限流）
   */
  broadcastThrottled(event: string, payload: unknown): number {
    // 检查全局速率限制
    if (!this.rateLimiter.tryConsume(1)) {
      console.warn('[ThrottledSender] Global rate limit exceeded, queuing');
      // 放入全局重试队列
      setTimeout(() => this.broadcastThrottled(event, payload), 1000);
      return 0;
    }

    return this.broadcaster.broadcast(event, payload);
  }
}

/**
 * 单客户端消息队列
 */
class MessageQueue {
  private queue: Array<{ event: string; payload: unknown }> = [];
  private draining = false;
  private readonly DRAIN_INTERVAL = 100; // 100ms 发送一次

  constructor(
    private connId: string,
    private broadcaster: ConnectionPool
  ) {}

  enqueue(item: { event: string; payload: unknown }): void {
    this.queue.push(item);

    // 限流：最多排队 50 条
    if (this.queue.length > 50) {
      this.queue = this.queue.slice(-50);
    }
  }

  startDrain(): void {
    if (this.draining) return;
    this.draining = true;

    const drain = () => {
      if (this.queue.length === 0) {
        this.draining = false;
        return;
      }

      const item = this.queue.shift()!;
      this.broadcaster.broadcast(item.event, item.payload, conn => conn.id === this.connId);

      setTimeout(drain, this.DRAIN_INTERVAL);
    };

    setImmediate(drain);
  }
}

/**
 * 令牌桶算法
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRate: number // 每秒补充的令牌数
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(count: number = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefill = now;
  }
}
```

### 5.3 资源占用控制

```typescript
// src/services/ResourceController.ts

/**
 * 资源控制器
 * 监控并限制 CPU、内存、连接数
 */
class ResourceController {
  private readonly MAX_MEMORY_MB = 512;     // 最大内存 512MB
  private readonly GC_THRESHOLD_MB = 400;    // 触发 GC 阈值

  private metrics: ResourceMetrics = {
    memoryUsedMb: 0,
    cpuPercent: 0,
    eventLoopLag: 0,
    rssClients: 0,
  };

  constructor(private connectionPool: ConnectionPool) {
    this.startMonitoring();
  }

  /**
   * 启动资源监控
   */
  private startMonitoring(): void {
    setInterval(() => {
      this.collectMetrics();
      this.checkLimits();
    }, 10000); // 每 10 秒检查
  }

  /**
   * 收集资源指标
   */
  private collectMetrics(): void {
    const memUsage = process.memoryUsage();

    this.metrics = {
      memoryUsedMb: memUsage.heapUsed / 1024 / 1024,
      cpuPercent: os.loadavg()[0], // 1 分钟平均
      eventLoopLag: this.getEventLoopLag(),
      rssClients: this.connectionPool.getStats().total,
    };

    // 输出日志
    console.log(`[Resource] Memory: ${this.metrics.memoryUsedMb.toFixed(1)}MB, ` +
      `CPU: ${this.metrics.cpuPercent.toFixed(1)}, ` +
      `Clients: ${this.metrics.rssClients}`);
  }

  /**
   * 检查资源限制
   */
  private checkLimits(): void {
    // 内存超限
    if (this.metrics.memoryUsedMb > this.MAX_MEMORY_MB) {
      console.error('[Resource] Memory limit exceeded!');
      this.emit('memory_critical', this.metrics);
    }

    // 内存过高，尝试 GC
    if (this.metrics.memoryUsedMb > this.GC_THRESHOLD_MB && global.gc) {
      console.log('[Resource] Triggering GC...');
      global.gc();
    }

    // 连接数超限
    const stats = this.connectionPool.getStats();
    if (stats.total > this.connectionPool.getMaxConnections() * 0.9) {
      console.warn('[Resource] Connection limit approaching');
      this.emit('connection_warning', stats);
    }
  }

  /**
   * 获取事件循环延迟
   */
  private getEventLoopLag(): number {
    const start = Date.now();
    setImmediate(() => {});
    return Date.now() - start;
  }

  getMetrics(): ResourceMetrics {
    return { ...this.metrics };
  }
}
```

---

## 6. API 设计

### 6.1 REST API

#### 6.1.1 会议管理 API

```
POST   /api/meetings              创建会议
GET    /api/meetings              获取会议列表
GET    /api/meetings/:id          获取会议详情
PUT    /api/meetings/:id          更新会议
DELETE /api/meetings/:id          删除会议
POST   /api/meetings/:id/end       结束会议

POST   /api/meetings/:id/participants     添加参与者
DELETE /api/meetings/:id/participants/:agentId   移除参与者

GET    /api/meetings/:id/messages         获取会议消息
GET    /api/meetings/:id/export            导出会议记录
```

#### 6.1.2 实时状态 API

```
GET    /api/status                获取系统状态
GET    /api/status/agents         获取 Agent 状态列表
GET    /api/status/meeting        获取当前会议状态
```

#### 6.1.3 历史记录 API

```
GET    /api/history/meetings      获取历史会议列表
GET    /api/history/meetings/:id  获取历史会议详情
GET    /api/history/decisions     获取所有决策记录
```

#### 6.1.4 API 详细定义

```typescript
// src/routes/meetings.ts

/**
 * POST /api/meetings - 创建会议
 */
{
  method: 'POST',
  url: '/api/meetings',
  schema: {
    body: {
      type: 'object',
      required: ['name', 'hostAgentId'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100 },
        hostAgentId: { type: 'string' },
        participantIds: { type: 'array', items: { type: 'string' } },
      },
    },
  },
}

// Response 201
{
  "success": true,
  "data": {
    "id": "meeting_1711432000_abc123",
    "name": "Q1 规划会议",
    "hostAgentId": "canmou",
    "status": "active",
    "startedAt": 1711432000000,
    "participants": [
      { "agentId": "canmou", "name": "数据分析师", "role": "host" }
    ]
  }
}

/**
 * POST /api/meetings/:id/participants - 添加参与者
 */
{
  method: 'POST',
  url: '/api/meetings/:id/participants',
  schema: {
    body: {
      type: 'object',
      required: ['agentId', 'name'],
      properties: {
        agentId: { type: 'string' },
        name: { type: 'string' },
        role: { type: 'string', enum: ['host', 'speaker', 'listener', 'observer'] },
      },
    },
  },
}

// Response 200
{
  "success": true,
  "data": {
    "agentId": "creator",
    "name": "创意助手",
    "role": "speaker",
    "joinedAt": 1711432100000
  }
}

/**
 * GET /api/status/meeting - 获取当前会议状态
 */
{
  method: 'GET',
  url: '/api/status/meeting',
}

// Response 200
{
  "inMeeting": true,
  "meeting": {
    "id": "meeting_1711432000_abc123",
    "name": "Q1 规划会议",
    "status": "active",
    "startedAt": 1711432000000,
    "participants": [
      {
        "agentId": "canmou",
        "name": "数据分析师",
        "role": "host",
        "joinedAt": 1711432000000,
        "speakingTimeMs": 125000
      },
      {
        "agentId": "creator",
        "name": "创意助手",
        "role": "speaker",
        "joinedAt": 1711432100000,
        "speakingTimeMs": 89000
      }
    ],
    "messageCount": 47,
    "lastActivity": 1711432500000
  }
}

// Response 200 (不在会议中)
{
  "inMeeting": false,
  "meeting": null
}
```

### 6.2 WebSocket 事件设计

#### 6.2.1 连接与认证

```typescript
// WebSocket 连接
ws://host:3000/ws?token=<auth_token>

// 连接成功后发送欢迎消息
{
  "event": "connected",
  "payload": {
    "clientId": "conn_123",
    "serverTime": 1711432000000,
    "meetingStatus": {
      "inMeeting": true,
      "meetingId": "meeting_xxx"
    }
  },
  "timestamp": 1711432000000
}
```

#### 6.2.2 服务器 -> 客户端 事件

| 事件名 | 说明 | payload 示例 | 触发时机 |
|--------|------|-------------|----------|
| `connected` | 连接成功 | `{ clientId, serverTime }` | 连接建立 |
| `meeting_started` | 会议开始 | `{ meeting: {...} }` | 主持人开始会议 |
| `meeting_ended` | 会议结束 | `{ meetingId, summary: {...} }` | 会议正常结束 |
| `meeting_paused` | 会议暂停 | `{ meetingId, reason }` | 超时暂停 |
| `participant_joined` | 参与者加入 | `{ participant: {...} }` | 新人加入 |
| `participant_left` | 参与者离开 | `{ agentId, reason }` | 有人离开 |
| `bubble_message` | 新消息气泡 | `{ id, agentId, content, ... }` | 新消息 |
| `typing_start` | 开始输入 | `{ agentId }` | Agent 开始输入 |
| `typing_end` | 结束输入 | `{ agentId }` | Agent 完成输入 |
| `scene_change` | 场景切换 | `{ from, to, participants }` | 场景变化 |
| `decision_made` | 决策生成 | `{ content, madeBy, timestamp }` | AI 做决策 |
| `alert` | 告警 | `{ type, message }` | 系统告警 |
| `ping` | 心跳 | `{ timestamp }` | 15 秒一次 |

#### 6.2.3 客户端 -> 服务器 事件

| 事件名 | 说明 | payload 示例 | 用途 |
|--------|------|-------------|------|
| `subscribe` | 订阅事件 | `{ events: ['bubble_message', ...] }` | 订阅特定事件 |
| `unsubscribe` | 取消订阅 | `{ events: ['alert'] }` | 取消订阅 |
| `meeting_action` | 会议操作 | `{ action: 'start'\|'end'\|'pause', ... }` | 控制会议 |
| `scene_action` | 场景操作 | `{ action: 'switch', scene: 'meeting_room' }` | 切换场景 |
| `pong` | 心跳响应 | `{ timestamp }` | 响应服务器 ping |

```typescript
// 订阅消息示例
{
  "event": "subscribe",
  "payload": {
    "events": ["bubble_message", "participant_joined", "participant_left", "scene_change"],
    "meetingId": "meeting_xxx" // 可选，指定会议
  },
  "timestamp": 1711432000000
}

// 会议操作示例
{
  "event": "meeting_action",
  "payload": {
    "action": "start",
    "name": "Q1 规划会议",
    "hostAgentId": "canmou"
  },
  "timestamp": 1711432000000
}
```

### 6.3 前后端消息格式

#### 6.3.1 统一消息 envelope

```typescript
// 所有 WebSocket 消息统一格式
interface WsEnvelope<T = unknown> {
  event: string;       // 事件名
  payload: T;          // 载荷
  timestamp: number;   // 服务器时间戳
  id?: string;         // 消息 ID（可选，用于追踪）
}

// 示例
{
  "event": "bubble_message",
  "payload": {
    "id": "bubble_msg_001",
    "agentId": "canmou",
    "agentName": "数据分析师",
    "agentRole": "speaker",
    "avatar": "canmou-owl",
    "content": "根据调研结果，建议采用 A 方案",
    "contentType": "text",
    "timestamp": 1711432000000,
    "status": "confirmed"
  },
  "timestamp": 1711432000000,
  "id": "env_001"
}
```

#### 6.3.2 气泡消息 payload 详细定义

```typescript
// 前端渲染所需的气泡消息格式
interface BubbleMessagePayload {
  // 基础信息
  id: string;
  agentId: string;
  agentName: string;
  agentRole: 'host' | 'speaker' | 'listener' | 'observer';
  avatar: string;  // SVG 组件名或 URL

  // 消息内容
  content: string;
  contentType: 'text' | 'event' | 'command' | 'decision';
  streaming?: boolean;  // 是否正在流式输出

  // 时间与状态
  timestamp: number;
  status: 'pending' | 'streaming' | 'confirmed' | 'error';

  // 扩展
  metadata?: {
    replyTo?: string;    // 回复的消息 ID
    mentions?: string[]; // 提及的 agent ID
    reactions?: Record<string, string[]>; // 表情反应
  };
}
```

#### 6.3.3 场景消息 payload

```typescript
interface SceneChangePayload {
  sceneId: string;
  sceneName: string;
  participants: Array<{
    agentId: string;
    position: { x: number; y: number };
    targetPosition?: { x: number; y: number }; // 动画目标位置
  }>;
  transition: 'instant' | 'slide' | 'fade' | 'morph';
  duration: number; // 动画时长，毫秒
}
```

---

## 7. 模块职责划分

### 7.1 核心模块清单

```
src/
├── index.ts                          # 应用入口
├── config.ts                         # 配置管理
│
├── plugins/                          # Fastify 插件
│   ├── websocket.ts                  # WebSocket 插件
│   ├── prisma.ts                     # Prisma ORM 插件
│   └── auth.ts                       # 认证插件
│
├── routes/                           # 路由层
│   ├── meetings.ts                   # 会议管理 API
│   ├── history.ts                    # 历史记录 API
│   ├── status.ts                     # 状态查询 API
│   └── health.ts                     # 健康检查
│
├── services/                         # 业务逻辑层
│   │
│   ├── gateway/                      # Gateway 连接模块
│   │   ├── GatewayConnector.ts       # WebSocket 连接管理
│   │   ├── ConnectionManager.ts      # 连接保活
│   │   ├── ReconnectStrategy.ts      # 重连策略
│   │   ├── MessageRecovery.ts        # 消息恢复
│   │   └── types.ts                  # Gateway 消息类型
│   │
│   ├── meeting/                      # 会议管理模块
│   │   ├── MeetingStateManager.ts    # 会议状态机
│   │   ├── MeetingStore.ts           # 会议存储
│   │   ├── ParticipantManager.ts     # 参与者管理
│   │   ├── MeetingEndDetector.ts     # 结束检测
│   │   └── types.ts                  # 会议类型定义
│   │
│   ├── message/                      # 消息处理模块
│   │   ├── MessagePipeline.ts         # 消息处理流水线
│   │   ├── MessageParser.ts          # 消息解析
│   │   ├── BubbleFormatter.ts        # 气泡格式化
│   │   ├── DuplicateFilter.ts        # 去重过滤
│   │   └── types.ts                  # 消息类型定义
│   │
│   ├── ws/                           # WebSocket 模块
│   │   ├── WsBroadcaster.ts          # 消息广播器
│   │   ├── ConnectionPool.ts         # 连接池管理
│   │   ├── ThrottledSender.ts        # 限流发送
│   │   └── SubscriptionManager.ts    # 订阅管理
│   │
│   ├── storage/                      # 存储模块
│   │   ├── MeetingStorage.ts          # 会议持久化
│   │   ├── MessageRepository.ts       # 消息仓储
│   │   └── CleanupService.ts          # 清理服务
│   │
│   ├── reliability/                  # 可靠性模块
│   │   ├── MessageBuffer.ts           # 多层消息缓冲
│   │   └── ResourceController.ts      # 资源控制
│   │
│   └── scene/                        # 场景管理模块
│       ├── SceneManager.ts           # 场景状态管理
│       └── SceneRenderer.ts          # 场景渲染数据
│
├── core/                             # 核心组件
│   ├── EventBus.ts                   # 事件总线
│   └── Logger.ts                     # 日志封装
│
├── types/                            # 共享类型
│   ├── index.ts                      # 主类型文件
│   ├── meeting.ts                    # 会议类型
│   ├── message.ts                    # 消息类型
│   └── ws.ts                         # WebSocket 类型
│
└── utils/                           # 工具函数
    ├── nanoid.ts                     # ID 生成
    └── time.ts                       # 时间处理
```

### 7.2 模块依赖关系

```
                    ┌─────────────────────────────────────────┐
                    │              index.ts                    │
                    │           (应用入口)                     │
                    └────────────────────┬────────────────────┘
                                         │
         ┌───────────────────────────────┼───────────────────────────────┐
         │                               │                               │
         ▼                               ▼                               ▼
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│   plugins/      │          │    routes/      │          │   services/    │
│                 │          │                 │          │                 │
│ ┌─────────────┐ │          │ ┌─────────────┐ │          │ ┌─────────────┐ │
│ │  websocket  │ │          │ │  meetings  │ │          │ │  gateway/   │ │
│ └─────────────┘ │          │ └──────┬──────┘ │          │ └──────┬──────┘ │
│ ┌─────────────┐ │          │ ┌──────┴──────┐ │          │ ┌──────┴──────┐ │
│ │   prisma    │ │          │ │  history    │ │          │ │  meeting/   │ │
│ └─────────────┘ │          │ └─────────────┘ │          │ └──────┬──────┘ │
│ ┌─────────────┐ │          │ ┌─────────────┐ │          │ ┌──────┴──────┐ │
│ │    auth     │ │          │ │   status    │ │          │ │   message/  │ │
│ └─────────────┘ │          │ └─────────────┘ │          │ └──────┬──────┘ │
└────────┬────────┘          └────────┬────────┘          │ ┌──────┴──────┐ │
         │                            │                   │ │     ws/     │ │
         │                            │                   │ └──────┬──────┘ │
         │                            │                   │ ┌──────┴──────┐ │
         │                            │                   │ │   scene/   │ │
         │                            │                   │ └──────┬──────┘ │
         │                            │                   │ ┌──────┴──────┐ │
         │                            │                   │ │   storage/ │ │
         │                            │                   │ └──────┬──────┘ │
         │                            │                   │ ┌──────┴──────┐ │
         │                            │                   │ │ reliability/│ │
         │                            │                   │ └─────────────┘ │
         └────────────────────────────┴───────────────────┴────────────────┘
                                          │
                                          ▼
                               ┌─────────────────────┐
                               │      core/           │
                               │  ┌─────────────────┐ │
                               │  │   EventBus      │ │
                               │  │   (全局事件中枢)  │ │
                               │  └────────┬─────────┘ │
                               │  ┌────────┴─────────┐ │
                               │  │     Logger        │ │
                               │  │   (日志封装)      │ │
                               │  └─────────────────┘ │
                               └──────────────────────┘
```

### 7.3 核心模块详细职责

#### GatewayConnector
- **职责**: 负责与 OpenClaw Gateway 建立和管理 WebSocket 连接
- **对外接口**:
  - `connect()`: 建立连接
  - `disconnect()`: 断开连接
  - `subscribe(types)`: 订阅消息类型
  - `on(event, handler)`: 监听事件
- **依赖**: EventBus, ReconnectStrategy

#### MeetingStateManager
- **职责**: 管理会议生命周期（创建、进行中、结束）
- **对外接口**:
  - `startMeeting(data)`: 开始会议
  - `endMeeting()`: 结束会议
  - `pauseMeeting()`: 暂停会议
  - `isInMeeting()`: 是否在会议中
  - `getCurrentMeeting()`: 获取当前会议
- **依赖**: EventBus, ParticipantManager, MeetingStore

#### WsBroadcaster
- **职责**: 管理所有 WebSocket 客户端连接，负责消息广播
- **对外接口**:
  - `broadcast(event, payload)`: 广播消息
  - `sendTo(connId, event, payload)`: 单播消息
  - `addClient(socket)`: 添加客户端
  - `removeClient(connId)`: 移除客户端
- **依赖**: ConnectionPool, ThrottledSender

#### MessagePipeline
- **职责**: 处理来自 Gateway 的原始消息，转换为前端可用的气泡消息
- **对外接口**:
  - `process(rawMessage)`: 处理消息
  - `addFilter(filter)`: 添加过滤器
- **依赖**: EventBus, BubbleFormatter

#### EventBus
- **职责**: 模块间事件通信中枢
- **对外接口**:
  - `emit(event, data)`: 发送事件
  - `on(event, handler)`: 订阅事件
  - `off(event, handler)`: 取消订阅
- **依赖**: 无

### 7.4 错误处理策略

```typescript
// src/core/ErrorHandler.ts

/**
 * 分层错误处理
 *
 * Layer 1: 模块级 try-catch（每个服务内部）
 * Layer 2: 路由级错误处理（Fastify 错误钩子）
 * Layer 3: 全局未捕获异常处理（process.on('uncaughtException')）
 */

class ErrorHandler {
  /**
   * 错误分类
   */
  static classify(error: Error): ErrorCategory {
    if (error instanceof ValidationError) return 'validation';
    if (error instanceof NotFoundError) return 'not_found';
    if (error instanceof UnauthorizedError) return 'unauthorized';
    if (error instanceof GatewayError) return 'gateway';
    if (error instanceof StorageError) return 'storage';
    return 'internal';
  }

  /**
   * 路由级错误处理
   */
  static routeError(error: Error, request: FastifyRequest, reply: FastifyReply) {
    const category = this.classify(error);
    const statusCode = this.getStatusCode(category);

    // 记录日志
    request.log.error({ err: error, category }, 'Request error');

    // 发送错误响应
    reply.status(statusCode).send({
      success: false,
      error: {
        category,
        message: error.message,
        code: (error as any).code,
      },
      timestamp: Date.now(),
    });
  }

  private static getStatusCode(category: ErrorCategory): number {
    switch (category) {
      case 'validation': return 400;
      case 'unauthorized': return 401;
      case 'not_found': return 404;
      case 'gateway': return 502;
      case 'storage': return 503;
      default: return 500;
    }
  }
}

/**
 * 错误类定义
 */
class GatewayError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'GatewayError';
  }
}

class StorageError extends Error {
  constructor(message: string, public operation: string) {
    super(message);
    this.name = 'StorageError';
  }
}

// 全局错误处理
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  // 记录堆栈
  fs.appendFileSync(
    'crash.log',
    `[${new Date().toISOString()}] ${error.stack}\n`
  );
  // 优雅退出
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
});
```

---

## 附录

### A. 关键配置项

```typescript
// src/config.ts

export const config = {
  // 服务器
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
  },

  // OpenClaw Gateway
  gateway: {
    wsUrl: process.env.GATEWAY_WS_URL || 'ws://localhost:18789',
    apiUrl: process.env.GATEWAY_API_URL || 'http://localhost:18792',
    reconnectDelay: 3000,
    heartbeatInterval: 25000,
    maxReconnectAttempts: 10,
  },

  // 数据库
  database: {
    url: process.env.DATABASE_URL || 'file:./dev.db',
  },

  // Redis (可选)
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // 会议
  meeting: {
    inactivityTimeoutMs: 30 * 60 * 1000,  // 30 分钟
    maxDurationMs: 8 * 60 * 60 * 1000,    // 8 小时
  },

  // WebSocket
  websocket: {
    maxConnections: 1000,
    maxPerIp: 50,
    heartbeatInterval: 30000,
    messageThrottle: {
      maxPerSecond: 20,
      burstAllowance: 30,
    },
  },

  // 存储
  storage: {
    messageRetentionDays: 90,
    snapshotRetentionDays: 30,
    cleanupIntervalHours: 24,
  },
};
```

### B. 环境变量清单

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | 否 | 3000 | 服务端口 |
| `HOST` | 否 | 0.0.0.0 | 服务地址 |
| `GATEWAY_WS_URL` | 是 | ws://localhost:18789 | Gateway WebSocket URL |
| `GATEWAY_API_URL` | 是 | http://localhost:18792 | Gateway API URL |
| `DATABASE_URL` | 否 | file:./dev.db | 数据库连接字符串 |
| `REDIS_ENABLED` | 否 | false | 是否启用 Redis |
| `REDIS_URL` | 否 | redis://localhost:6379 | Redis 连接字符串 |

### C. 健康检查端点

```
GET /health

Response 200:
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": 1711432000000,
  "components": {
    "gateway": {
      "connected": true,
      "latencyMs": 45
    },
    "database": {
      "status": "connected",
      "queryTimeMs": 2
    },
    "redis": {
      "status": "connected"
    },
    "websocket": {
      "connections": 12
    }
  },
  "currentMeeting": {
    "inMeeting": true,
    "meetingId": "meeting_xxx",
    "participantCount": 4
  }
}
```
