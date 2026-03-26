# Agent Monitor 开会可视化系统 - 需求细化文档

> 版本: 1.0.0
> 日期: 2026-03-26
> 状态: 需求细化完成

---

## 1. 开会流程（详细描述）

### 1.1 会议生命周期

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           会议生命周期                                   │
└─────────────────────────────────────────────────────────────────────────┘

  [准备阶段]          [开始阶段]          [进行阶段]          [结束阶段]
  ─────────          ─────────          ─────────          ─────────
      │                  │                  │                  │
      ▼                  ▼                  ▼                  ▼
  发起人创建 ──▶ 邀请参与者 ──▶ 角色移动到 ──▶ 讨论进行 ──▶ 会议总结 ──▶ 角色返回
   会议议程      确认加入     会议室座位         │            │         工位
      │              │            │            ▼            ▼
      │              │            │       新消息产生 ──▶ 会议存档
      │              │            │            │
      │              │            ▼            ▼
      │              │       气泡展示 ◀────────┘
      │              │            │
      └──────────────┴────────────┘
              (任何时刻可取消)
```

### 1.2 会议发起机制

**三种发起方式：**

| 方式 | 触发者 | 场景 | 优先级 |
|------|--------|------|--------|
| **手动发起** | User (Tim) | 主动安排会议 | P0 |
| **指令发起** | Agent | 检测到协作需求时 | P1 |
| **自动发起** | System | 定时任务、事件触发 | P2 |

**手动发起流程：**
```
1. User 调用 API/UI: POST /api/meeting/start
   {
     "title": "方案评审会议",
     "agenda": ["方案A对比", "决策", "分工"],
     "participants": ["canmou", "creator", "yunying"],
     "hostId": "tim"
   }

2. Server 创建会议记录 (state: "preparing")
   - 生成 meetingId: "meeting_20260326_001"
   - 初始化议程队列
   - 向参与者发送邀请

3. 参与者接收邀请 (WebSocket event: "meeting:invite")
   - Agent 进入 "meeting_invited" 状态
   - UI 显示邀请弹窗

4. 参与者响应邀请
   - accept → 进入 "joining" 状态，开始移动动画
   - decline → 发送拒绝原因，返回 idle
   - timeout (30s) → 自动 decline

5. 所有参与者加入后，会议状态变为 "active"
```

**自动发起规则（P2，未来扩展）：**
- 当 subagent 数量 ≥ 2 且 idle 时间 > 10分钟 → 自动发起协作会议
- 定时会议：每天 10:00, 15:00 发送站会邀请

### 1.3 议程传递机制

**议程结构：**
```json
{
  "meetingId": "meeting_20260326_001",
  "title": "方案评审会议",
  "agenda": [
    {
      "id": "agenda_1",
      "topic": "方案A vs 方案B 对比",
      "status": "pending",      // pending | active | completed | skipped
      "speaker": "canmou",
      "duration": 300,          // 预计时长(秒)
      "notes": []
    },
    {
      "id": "agenda_2", 
      "topic": "技术方案决策",
      "status": "pending",
      "speaker": "creator",
      "duration": 180,
      "notes": []
    }
  ],
  "currentAgendaId": null,
  "createdAt": 1743000000000
}
```

**议程流转：**
1. 发起人可随时切换当前议程项 (`meeting:agenda:switch`)
2. 当前议程项状态变为 `active`，气泡高亮显示
3. 议程完成 → `completed`，自动进入下一项
4. 可跳过当前项 → `skipped`

### 1.4 会议状态机

```
                    ┌─────────────┐
                    │  preparing  │
                    └──────┬──────┘
                           │ all participants joined
                           ▼
┌─────────┐   invite   ┌─────────┐   start    ┌─────────┐
│ pending │◀──────────│preparing│───────────▶│ active  │
└─────────┘            └─────────┘            └────┬────┘
                                                   │ end
                                                   ▼
                                            ┌──────────┐
                                            │ completed│
                                            └──────────┘
```

---

## 2. 角色动画设计

### 2.1 场景定义

**两种场景：**

| 场景 | 描述 | 背景 |
|------|------|------|
| **工位模式** | Agent 在各自工位，可视化当前状态 | 4个独立工位，灰色调 |
| **会议室模式** | 所有参与者围坐会议室 | 会议桌，暖色调，氛围感 |

### 2.2 角色移动动画

**路径设计：**

```
【工位布局】                          【会议室布局】
                                       
┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐         ┌─────────────┐
│canmou│  │creator│ │yunying│ │evolver│         │   会议室    │
│ 🦉   │  │ 💡   │  │ 📊   │  │ 💧   │         │             │
└──────┘  └──────┘  └──────┘  └──────┘    ┌────┴────┐  ┌────┴────┐
                                          │ canmou │  │creator │
      ┌─────┐  移动路径(Bezier曲线) ──▶   │  🦉   │  │  💡   │
      │Tim  │                                └────────┘  └────────┘
      │ 👤 │                                     ┌─────────────┐
      └─────┘                                    │     👤     │
                                                  │    Tim     │
                                              ┌─────────────┘
                                              │
                                        ┌────┴────┐  ┌────┴────┐
                                        │yunying  │  │evolver │
                                        │  📊   │  │  💧   │
                                        └────────┘  └────────┘
```

**动画参数：**

| 参数 | 值 | 说明 |
|------|-----|------|
| 移动时长 | 800ms | 工位到会议室的移动时间 |
| 缓动函数 | cubic-bezier(0.34, 1.56, 0.64, 1) | 弹性效果，有点像飘 |
| 移动中状态 | `moving` | 特殊状态，优先级高于 idle/working |
| 拖尾效果 | 是 | 移动时留下淡淡残影 |
| 到达动画 | bounce 0.1s | 快到达时有轻微弹跳 |
| 并发移动 | 是 | 所有参与者同时开始移动 |
| 移动顺序 | 同时 | 不需要先后，强调团队感 |

**CSS 动画实现：**
```css
@keyframes move-to-meeting {
  0% {
    transform: translate(var(--desk-x), var(--desk-y)) scale(1);
    opacity: 1;
  }
  50% {
    transform: translate(calc(var(--desk-x) + var(--meeting-x) / 2), 
                        calc(var(--desk-y) - 50px)) scale(1.1);
    opacity: 0.8;
    filter: blur(2px);
  }
  100% {
    transform: translate(var(--meeting-x), var(--meeting-y)) scale(1);
    opacity: 1;
    filter: blur(0);
  }
}

.agent.moving {
  animation: move-to-meeting 800ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  z-index: 100;
}
```

### 2.3 会议室座位算法

**座位分配规则：**

| 角色 | 位置 | 规则 |
|------|------|------|
| Tim (Host) | 桌子顶端中央 | 固定位置，会议控制者 |
| canmou | 主机左侧 | 主发言人是首选位置 |
| creator | 主机右侧 | 第二顺位 |
| yunying | 左侧第一个 | 按角色优先级排列 |
| evolver | 右侧第一个 | 按角色优先级排列 |

**如果只有部分 Agent 参会：**
- 优先填满"主机侧"（Host 面对的方向）
- 座位从中央向两侧展开
- 缺席 Agent 的座位留空（显示虚线轮廓）

### 2.4 发言动画

**发言状态触发条件：**
- Agent 发送消息时 → 进入 `speaking` 状态
- 消息发送完成 → 退出 `speaking` 状态
- 如果消息较长（streaming）→ 持续 `speaking` 状态

**发言动画效果：**

| 动画元素 | 效果描述 | 时长 |
|---------|---------|------|
| 外发光 | 气泡边框 + 角色光环 | 持续 |
| 嘴型/表情 | 简单的缩放脉冲 | 300ms 循环 |
| 气泡入场 | 从角色方向滑入 + 弹性缩放 | 300ms |
| 打字效果 | 消息内容逐字显示 | 50ms/字 |
| 气泡展开 | 根据内容长度自适应高度 | 200ms |

```css
@keyframes speaking-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50% { transform: scale(1.05); box-shadow: 0 0 20px 5px rgba(16, 185, 129, 0.2); }
}

.agent.speaking {
  animation: speaking-pulse 1s ease-in-out infinite;
}

@keyframes bubble-enter {
  0% { 
    opacity: 0; 
    transform: translateX(-20px) scale(0.8); 
  }
  60% { transform: translateX(5px) scale(1.02); }
  100% { 
    opacity: 1; 
    transform: translateX(0) scale(1); 
  }
}

.bubble.speaking {
  animation: bubble-enter 300ms ease-out forwards;
}
```

### 2.5 其他状态动画

| 状态 | 动画效果 | CSS 实现 |
|------|---------|----------|
| `idle` | 轻微呼吸 + 偶尔眨眼 | scale 1.0↔1.02, 4s 循环 |
| `working` | 快速微动 + 任务指示 | translate ±2px, 0.3s 循环 |
| `thinking` | 问号气泡 + 旋转 | opacity 闪烁 |
| `in-meeting` | 环形呼吸光环 | box-shadow 脉冲 |
| `away` | 变灰 + 半透明 | grayscale + opacity 0.5 |

---

## 3. 气泡对话机制

### 3.1 对话内容来源

**实时捕获方案（推荐）：**

```
┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  OpenClaw        │     │  Monitor        │     │   Frontend       │
│  Gateway         │────▶│  Backend        │────▶│   (Bubble UI)    │
│  (WebSocket)     │     │  (Socket.io)    │     │                  │
└──────────────────┘     └─────────────────┘     └──────────────────┘
         │                        │
         │ session:message        │ message:new
         │ (实时推送)             │ (WebSocket)
         │                        │
         ▼                        ▼
   消息内容示例:
   {
     "type": "session:message",
     "sessionId": "agent:main:subagent:xxx",
     "agentId": "canmou",
     "role": "agent",
     "content": "根据调研，建议采用A方案",
     "timestamp": 1743000123456,
     "meetingId": "meeting_20260326_001"  // 如果是会议中
   }
```

**备选方案：轮询 sessions_history**

```javascript
// 每 2 秒轮询一次
async function pollSessionHistory(sessionId) {
  const history = await openclaw.sessions_history(sessionId, { limit: 10 });
  return history.filter(m => m.timestamp > lastCheckTime);
}
```
- **缺点**: 最多 2 秒延迟，可能漏消息
- **适用**: Gateway WebSocket 不可用时降级

### 3.2 会议消息 vs 闲聊消息

**区分机制：**

| 特征 | 会议消息 | 闲聊消息 |
|------|---------|---------|
| **meetingId** | 有值（非 null） | null |
| **session 标签** | 包含 `in-meeting` | 不包含 |
| **发生时间** | 会议时间窗口内 | 任意时间 |
| **消息格式** | 结构化，可带决策标记 | 普通文本 |

**过滤逻辑：**
```javascript
function isMeetingMessage(msg) {
  // 方案1: 有 meetingId 标记
  if (msg.meetingId) return true;
  
  // 方案2: 在会议时间窗口内，且 session 有 in-meeting 标签
  const inMeetingWindow = activeMeetings.some(m => 
    msg.timestamp >= m.startTime && 
    (m.endTime === null || msg.timestamp <= m.endTime)
  );
  const hasMeetingLabel = msg.labels?.includes('in-meeting');
  
  return inMeetingWindow && hasMeetingLabel;
}
```

### 3.3 气泡展示顺序

**时间顺序（严格）：**
- 按 `timestamp` 升序排列
- 相同 timestamp（毫秒级）按 `agentId` 字母序

**分组策略（可选）：**
- 同一 Agent 连续消息（间隔 < 3秒）合并为一个气泡组
- 组内显示编号（如 "1/3", "2/3"）

**显示区域滚动：**
- 新消息 → 自动滚动到底部
- 用户主动滚动 → 暂停自动滚动，显示 "新消息 ↑" 按钮
- 点击按钮 → 滚动到底部

### 3.4 并发消息处理

**场景：多个 Agent 同时说话**

```
时间线:
t=0    canmou: "我觉得方案A更好"
t=50   yunying: "我同意，但成本呢？"
t=120  creator: "成本增加20%，但..."
t=200  canmou: "..." (打断，streaming)
```

**处理策略：**

| 策略 | 行为 | 适用场景 |
|------|------|---------|
| **队列串行** | 消息排队依次展示，间隔 100ms | 追求清晰，避免混乱 |
| **同屏并排** | 同时显示，左右分布 | 需要展示对话感 |
| **优先级** | Host > Main > Support > Observer | 重要会议 |

**推荐：队列串行 + 同时显示上限**

```javascript
class MessageQueue {
  constructor() {
    this.queue = [];
    this.maxConcurrent = 3;  // 同屏最多3个气泡
    this.displayDuration = 5000; // 每个气泡显示5秒后淡出
  }
  
  push(msg) {
    this.queue.push(msg);
    this.processQueue();
  }
  
  processQueue() {
    if (this.visibleCount >= this.maxConcurrent) return;
    
    const next = this.queue.shift();
    if (next) {
      this.show(next);
      setTimeout(() => this.hide(next), this.displayDuration);
      setTimeout(() => this.processQueue(), 100); // 100ms后处理下一个
    }
  }
}
```

### 3.5 气泡内容处理

**内容截断规则：**
- 单条消息最大显示 200 字
- 超过 → 显示前 200 字 + "..." + "展开"
- 展开 → 显示完整内容

**特殊内容渲染：**
| 内容类型 | 渲染方式 |
|---------|---------|
| 纯文本 | 普通渲染 |
| 代码片段 | 等宽字体，高亮背景 |
| 决策结论 | 高亮边框 + 🎯 图标 |
| 任务分配 | 高亮 + 📋 图标 |
| 引用回复 | 缩进 + 竖线 |

---

## 4. 状态机设计

### 4.1 Agent 状态扩展

**现有状态（从 SPEC.md）：**
- `idle` | `working` | `meeting` | `away`

**扩展状态（细化版）：**

| 状态 | 父状态 | 说明 | 触发场景 |
|------|--------|------|---------|
| `idle` | - | 空闲等待 | 初始化、无任务 |
| `working` | - | 执行任务 | 工具调用、处理中 |
| `meeting_invited` | - | 收到会议邀请 | 会议创建 |
| `meeting_joining` | - | 前往会议室中 | 接受邀请 |
| `meeting` | - | 开会中（参会） | 进入会议室 |
| `meeting_speaking` | meeting | 发言中 | 发送消息 |
| `meeting_presenting` | meeting | 演示中 | 屏幕共享/展示 |
| `away` | - | 离开 | 超时/手动 |
| `disconnected` | - | 断线 | 网络问题 |

**状态优先级（高优先级覆盖低优先级）：**
```
disconnected > away > meeting_presenting > meeting_speaking > meeting > meeting_joining > meeting_invited > working > idle
```

### 4.2 状态转换图

```
                    ┌────────────────────────────────────────┐
                    │              会议相关状态                 │
                    └────────────────────────────────────────┘
                                 │
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │meeting_  │ │meeting_  │ │meeting   │
              │invited   │ │joining   │ │(active)  │
              └────┬─────┘ └────┬─────┘ └────┬─────┘
                   │            │            │
                   │ accept     │ arrived    │ speaking
                   │            │            │
                   │            │            ▼
                   │            │     ┌──────────────┐
                   │            │     │meeting_      │
                   │            │     │speaking      │
                   │            │     └──────┬───────┘
                   │            │            │
                   │            │            │ done
                   │            │            │
                   │            │     ┌──────┴───────┐
                   │            │     │              │
                   │ decline    │     ▼              ▼
                   │◀───────────┼──── 继续开会      结束会议
                   │            │     │              │
                   │            │     └──────┬───────┘
                   │            │            │
                   │            ▼            ▼
                   │       ┌────────┐   ┌────────┐
                   │       │meeting │   │ 返回   │
                   │       │(继续)   │   │工位    │
                   │       └────────┘   └────────┘
                   │                             │
                   └─────────────────────────────┘
                        (任何 meeting_* 状态可被
                         away/disconnected 中断)
```

### 4.3 状态转换事件

| 事件 | 触发条件 | 状态变化 | 副作用 |
|------|---------|---------|-------|
| `meeting:created` | 会议创建 | idle → meeting_invited | 发送邀请通知 |
| `meeting:invite:accept` | 参与者接受 | meeting_invited → meeting_joining | 启动移动动画 |
| `meeting:invite:decline` | 参与者拒绝 | meeting_invited → idle | 通知其他参与者 |
| `meeting:arrived` | 移动完成 | meeting_joining → meeting | 显示就座 |
| `meeting:message:start` | 开始发送消息 | meeting → meeting_speaking | 显示发言动画 |
| `meeting:message:end` | 消息发送完成 | meeting_speaking → meeting | 停止发言动画 |
| `meeting:end` | 会议结束 | meeting → idle | 启动返回动画 |
| `agent:away` | 心跳超时 | any → away | 灰色显示 |
| `agent:heartbeat` | 收到心跳 | away → idle | 恢复颜色 |

### 4.4 状态存储

**Redis Key 设计：**

```
agent:state:{agentId}          # Agent 当前状态 (TTL: 30s)
agent:meeting:{agentId}         # Agent 当前所在会议
agent:position:{agentId}        # Agent 当前位置 {x, y, scene}
```

**状态事件发布：**
```
Channel: agent:events:state
{
  "type": "state_changed",
  "agentId": "canmou",
  "prevState": "working",
  "nextState": "meeting_invited",
  "meetingId": "meeting_20260326_001",
  "timestamp": 1743000000000
}
```

---

## 5. 数据来源方案

### 5.1 消息来源对比

| 来源 | 获取方式 | 延迟 | 可靠性 | 实现难度 |
|------|---------|------|--------|---------|
| **Gateway WebSocket** | ws://gateway:18789/ws/sessions | <100ms | 高 | ⭐⭐⭐ |
| **sessions_history API** | HTTP polling /api/sessions/:id/history | 1-5s | 中 | ⭐ |
| **Subagent Hook** | 消息回调 | 即时 | 高 | ⭐⭐⭐⭐ |

**推荐：Gateway WebSocket（实时） + sessions_history（兜底）**

### 5.2 实时消息捕获架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                     消息捕获完整数据流                                 │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐                    ┌─────────────────┐
│   Frontend   │◀───────────────────│   Monitor       │
│   (Bubble UI)│    WebSocket        │   Backend       │
└──────────────┘    message:new      └────────┬────────┘
                                              │
                            ┌─────────────────┼─────────────────┐
                            │                 │                 │
                            ▼                 ▼                 ▼
                    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                    │ Redis Buffer  │  │ SQLite 存档  │  │ Gateway WS   │
                    │ (last 100)   │  │ (历史)        │  │ (Real-time)  │
                    └──────────────┘  └──────────────┘  └──────────────┘
                                                                   │
                                                                   │ session:message
                                                                   ▼
                                                           ┌──────────────┐
                                                           │ OpenClaw     │
                                                           │ Gateway      │
                                                           └──────────────┘
```

### 5.3 会议消息识别流程

```javascript
async function handleSessionMessage(msg) {
  // 1. 解析消息
  const parsed = parseMessage(msg);
  
  // 2. 判断是否为会议消息
  const activeMeeting = findActiveMeetingByParticipant(parsed.agentId);
  
  if (activeMeeting) {
    // 会议消息处理
    parsed.meetingId = activeMeeting.id;
    parsed.isMeetingMessage = true;
    
    // 推送给前端
    socket.emit('meeting:message:new', {
      meetingId: activeMeeting.id,
      message: parsed
    });
    
    // 更新议程上下文
    updateAgendaContext(activeMeeting.id, parsed);
    
    // 检测决策关键词
    if (containsDecision(parsed.content)) {
      markAsDecision(activeMeeting.id, parsed);
    }
  } else {
    // 闲聊消息处理（可选，是否显示）
    parsed.isMeetingMessage = false;
    // 可选择是否推送到工位状态面板
  }
  
  // 3. 存档
  await saveToDatabase(parsed);
}
```

### 5.4 区分"会议对话"和"平时闲聊"的具体实现

**方案：多条件叠加判断**

```javascript
function classifyMessageContext(msg, currentMeetings) {
  const { agentId, timestamp, content, sessionId, labels } = msg;
  
  // 条件1: 有明确的 meetingId
  if (msg.meetingId) {
    return 'meeting';
  }
  
  // 条件2: 在会议时间窗口内
  const inMeetingWindow = currentMeetings.some(m => 
    m.participants.includes(agentId) &&
    timestamp >= m.startTime &&
    (m.endTime === null || timestamp <= m.endTime + 30000) // 会议结束后30秒内仍算会议
  );
  
  if (inMeetingWindow) {
    return 'meeting';
  }
  
  // 条件3: Session 有 in-meeting 标签
  if (labels?.includes('in-meeting')) {
    return 'meeting';
  }
  
  // 条件4: 消息内容包含会议相关关键词（兜底）
  const meetingKeywords = ['我们开会', '会议', '讨论一下', '评审', '对齐'];
  const hasMeetingKeyword = meetingKeywords.some(k => content.includes(k));
  
  if (hasMeetingKeyword && currentMeetings.length > 0) {
    return 'meeting'; // 有会议正在进行时，触发会议模式
  }
  
  return 'casual';
}
```

---

## 6. 技术风险与解决方案

### 6.1 实时性要求

| 操作 | 目标延迟 | 实际可达 | 风险 |
|------|---------|---------|------|
| 状态变化 → 前端显示 | <500ms | ~200ms | 低 |
| 消息产生 → 气泡显示 | <200ms | ~100ms | 低 |
| 会议开始 → 角色移动 | <1s | ~800ms | 低 |
| 整体页面加载 | <2s | ~1s | 低 |

**优化手段：**
- WebSocket 优于 HTTP 轮询
- Redis Pub/Sub 跨进程同步
- 前端本地缓存 + diff 渲染
- 消息合并（100ms 内的同 Agent 消息合并）

### 6.2 Gateway 不稳定的应对

**降级策略（三级）：**

```
┌─────────────────────────────────────────────────────────────────┐
│                      降级策略                                     │
└─────────────────────────────────────────────────────────────────┘

Level 1: Gateway WebSocket 可用
├── 连接 ws://gateway:18789/ws/sessions
├── 接收实时消息 (<100ms)
└── 状态: 🟢 正常

Level 2: Gateway HTTP 可用, WebSocket 不可用
├── 每 2 秒轮询 /api/sessions/:id/history
├── 延迟增加到 1-2s
└── 状态: 🟡 降级

Level 3: Gateway 完全不可用
├── 使用本地 agents.json 配置
├── 消息捕获降级到手动触发
└── 状态: 🔴 最小可用
```

**重连机制：**
```javascript
class GatewayConnector {
  constructor() {
    this.reconnectDelay = 1000;  // 初始1秒
    this.maxReconnectDelay = 30000;  // 最大30秒
    this.maxRetries = Infinity;  // 无限重试
  }
  
  async connect() {
    try {
      await this.websocket.connect();
      this.reconnectDelay = 1000; // 重置
      this.emit('connected');
    } catch (err) {
      this.scheduleReconnect();
    }
  }
  
  scheduleReconnect() {
    setTimeout(() => {
      console.log(`尝试重连... (${this.reconnectDelay}ms后)`);
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }
}
```

### 6.3 消息丢失处理

**消息丢失场景：**

| 场景 | 原因 | 处理方案 |
|------|------|---------|
| Gateway WS 断线 | 网络波动 | 本地 buffer + 重连后同步 |
| Monitor Backend 重启 | 服务重启 | Redis 持久化消息 |
| 前端断线 | 用户断网 | 自动重连 + 本地缓存 |
| 消息发送失败 | 目的地不可达 | 重试队列 + 死信队列 |

**消息确认机制：**

```
消息流程：
1. Gateway 发送消息 ──▶ Monitor Backend 接收 ──▶ ACK
2. Monitor Backend 推送 ──▶ Frontend 接收 ──▶ ACK
3. 如无 ACK，5秒后重试，最多3次
```

**消息缓冲区设计：**

```javascript
class MessageBuffer {
  constructor(maxSize = 100) {
    this.buffer = new Map(); // meetingId -> Message[]
    this.maxSize = maxSize;
  }
  
  add(meetingId, message) {
    if (!this.buffer.has(meetingId)) {
      this.buffer.set(meetingId, []);
    }
    
    const msgs = this.buffer.get(meetingId);
    msgs.push(message);
    
    // 超过上限，移除最老的
    if (msgs.length > this.maxSize) {
      msgs.shift();
    }
  }
  
  // 用于断线重连后获取丢失的消息
  getSince(meetingId, sinceTimestamp) {
    const msgs = this.buffer.get(meetingId) || [];
    return msgs.filter(m => m.timestamp > sinceTimestamp);
  }
}
```

### 6.4 性能风险

| 风险 | 阈值 | 影响 | 解决方案 |
|------|------|------|---------|
| 消息量过大 | >100条/分钟 | 气泡刷屏 | 折叠 + 限速 |
| Agent 数量过多 | >20个 | 渲染卡顿 | 虚拟列表 |
| 会议时间过长 | >1小时 | 内存增长 | 消息归档 |
| 同时开多会议 | >3个 | 状态冲突 | 隔离通道 |

**限流策略：**
```javascript
class MessageRateLimiter {
  constructor(perSecond = 2, burst = 5) {
    this.perSecond = perSecond;
    this.burst = burst;
    this.tokens = burst;
    this.lastRefill = Date.now();
  }
  
  tryConsume() {
    this.refill();
    
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }
  
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.perSecond);
    this.lastRefill = now;
  }
}
```

---

## 7. 优先级排序（MoSCoW）

### 7.1 Must Have（必须有）

| 功能 | 说明 | 验收标准 |
|------|------|---------|
| **会议发起与结束** | User 能发起/结束会议 | API 可调用，状态正确 |
| **角色工位→会议室移动** | Agent 接受邀请后平滑移动 | 800ms 动画，无跳跃 |
| **会议气泡展示** | 实时显示消息气泡 | <200ms 延迟 |
| **状态机转换** | idle/working/meeting 等状态正确切换 | 事件触发正确 |
| **会议消息过滤** | 区分会议消息和闲聊 | 准确率 >95% |

### 7.2 Should Have（应该有）

| 功能 | 说明 | 验收标准 |
|------|------|---------|
| **座位分配算法** | 合理的会议室座位布局 | 符合优先级规则 |
| **发言动画** | 发言时气泡 + 光效 | 动画流畅 |
| **议程管理** | 议程创建、切换、完成 | 支持 CRUD |
| **会议存档** | 会议记录持久化 | SQLite 存储 |
| **Gateway 降级** | WebSocket 不可用时降级轮询 | 延迟 <5s |

### 7.3 Could Have（可以有）

| 功能 | 说明 | 备注 |
|------|------|------|
| **消息合并** | 连续同 Agent 消息合并 | 提升可读性 |
| **决策高亮** | 检测并高亮决策内容 | 🎯 标记 |
| **打字效果** | 消息逐字显示 | streaming 场景 |
| **历史会议回放** | 查看历史会议 | 复杂度较高 |
| **多会议并行** | 同时进行多个会议 | 需隔离设计 |

### 7.4 Won't Have（本次不做）

| 功能 | 原因 |
|------|------|
| **语音/视频** | 超出现有系统范围 |
| **屏幕共享** | 未来可扩展 |
| **会议纪要自动生成** | 需要 AI 能力，后续迭代 |
| **跨时区会议** | 当前团队同地域 |
| **会议录音录像** | 隐私/存储问题 |

---

## 附录

### A. 关键 API 端点

```
会议管理:
POST   /api/meeting/start          # 创建会议
POST   /api/meeting/:id/end        # 结束会议
GET    /api/meeting/:id            # 获取会议详情
GET    /api/meeting/:id/messages   # 获取会议消息
POST   /api/meeting/:id/agenda     # 添加议程

WebSocket 事件:
→ meeting:invite:accept           # 接受邀请
→ meeting:invite:decline           # 拒绝邀请
→ meeting:message:new             # 新消息
← meeting:start                   # 会议开始
← meeting:end                     # 会议结束
← meeting:message:new             # 推送新消息
```

### B. 数据模型

```typescript
// 会议
interface Meeting {
  id: string;
  title: string;
  hostId: string;
  participants: string[];
  agenda: AgendaItem[];
  status: 'preparing' | 'active' | 'completed';
  startTime: number;
  endTime: number | null;
}

// 议程项
interface AgendaItem {
  id: string;
  topic: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  speaker: string;
  duration: number;
}

// 消息
interface MeetingMessage {
  id: string;
  meetingId: string;
  agentId: string;
  content: string;
  timestamp: number;
  isDecision: boolean;
}
```

### C. 实现检查清单

- [ ] 会议状态机实现
- [ ] 邀请/响应流程
- [ ] 移动动画（CSS + JS）
- [ ] 座位分配算法
- [ ] 气泡渲染组件
- [ ] 消息队列管理
- [ ] WebSocket 实时通信
- [ ] 降级轮询机制
- [ ] 会议存档
- [ ] 前端状态同步
