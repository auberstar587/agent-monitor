# Skills 集成研究：agent-communication + 开会记录 + 记忆系统

*研究日期: 2026-03-26*
*输出路径: /root/.openclaw/workspace/projects/agent-monitor/skills-research.md*

---

## 一、agent-communication 技能用法

### 核心功能
标准化 agent 间通信协议，使用 `session_send` 工具进行跨 agent 通信。

### 通信方式选择

| 方式 | 适用场景 | 操作 |
|------|----------|------|
| **同步回复** | 简单问题，快速回答 | 直接在当前会话回复，不使用 session_send |
| **异步回复 (session_send)** | 复杂问题，需要时间处理 | 先说"稍后回复"，任务完成后用 session_send 发送结果 |

### 标准通信格式

```
【Agent 间通信】
发件方: <发送者名称>
收件方: <接收者名称>
通信目的: <明确目的>

用户需求: <用户原始需求>

我需要你:
1. <具体要求1>
2. <具体要求2>
3. <具体要求3>

期望响应格式:
- 使用 session_send 回复我
- 汇报状态：<完成/部分完成/失败>
- 核心内容：<详细输出>

---
上下文: <额外背景信息>
```

### 使用场景

#### 场景 1：向另一个 agent 学习技能
```bash
# 1. 先获取目标 agent 的 sessionKey
sessions_list

# 2. 使用 session_send 发送学习请求
session_send(target="xiaoz-zi", message="【Agent 间通信】...")
```

#### 场景 2：向另一个 agent 询问信息
- 获取配置信息、状态数据等
- 使用标准格式明确标注"信息提供完成"

#### 场景 3：与其他 agent 协作完成任务
- 任务分发 → 等待完成 → 整合结果
- 重要：回复发件方要标注"任务结束"

### 错误处理

| 错误类型 | 处理方式 |
|----------|----------|
| 目标 agent 不存在 | 列出可用 agents，请求确认 |
| 通信超时（30秒） | 稍后重试，检查 Gateway 状态 |

### 最佳实践
1. **先确认后通信**：使用 `sessions_list` 确认目标 agent 可用
2. **保持简洁**：消息内容简洁明了
3. **标注上下文**：提供足够背景帮助目标 agent 理解
4. **及时汇报**：重要通信节点主动向用户汇报状态
5. **学习归档**：学到的知识记录到学习日志

---

## 二、如何记录开会过程

### 开会模式工作流（参考 agent-monitor 项目）

```
1. 提出议题 → canmou 调研分析
2. 方案讨论 → 多人协作
3. 决策输出 → creator 记录
4. 执行跟踪 → yunying 监控
5. 复盘优化 → evolver 技能提升
```

### 会议记录结构

```markdown
# 会议记录: YYYY-MM-DD

## 会议信息
- 时间: HH:MM - HH:MM
- 参与人: @agent1, @agent2, @agent3
- 主持人: <name>

## 议程
1. <议题1>
2. <议题2>

## 讨论内容

### 议题1: <title>
- **提议人**: @agent
- **内容**: <详细说明>
- **讨论结果**: <结论>

### 议题2: <title>
- ...

## 决策
| 决策 | 负责人 | 截止时间 |
|------|--------|----------|
| <决策1> | @agent | YYYY-MM-DD |

## 行动项
- [ ] <行动1> - @agent - YYYY-MM-DD
- [ ] <行动2> - @agent - YYYY-MM-DD

## 会议摘要
<3句话以内总结>
```

### 技术实现方案

#### 方案 A：基于 sessions_history 的会议回放
```javascript
// 使用 sessions_history 获取会话记录
sessions_history(sessionKey="agent:main:canmou", limit=50)

// 提取关键消息构建时间线
const timeline = messages
  .filter(m => m.timestamp >= meetingStart)
  .map(m => ({
    time: m.timestamp,
    agent: m.agent,
    content: m.content,
    type: classify(m.content) // 提议/讨论/决策/行动
  }))
```

#### 方案 B：实时会议记录器
```javascript
class MeetingRecorder {
  constructor(meetingId, participants) {
    this.meetingId = meetingId;
    this.participants = participants;
    this.events = [];
  }

  // 记录发言
  recordStatement(agent, content, type = 'statement') {
    this.events.push({
      timestamp: Date.now(),
      agent,
      content,
      type
    });
  }

  // 记录决策
  recordDecision(decision, owner, deadline) {
    this.events.push({
      timestamp: Date.now(),
      type: 'decision',
      content: decision,
      owner,
      deadline
    });
  }

  // 导出会议记录
  export() {
    return formatMeetingRecord(this.events);
  }
}
```

#### 方案 C：使用 agent-team-orchestration 的任务流
- **Inbox → Spec → Build → Review → Done** 生命周期
- 每个阶段都有状态转换记录
- 天然支持会议过程中的任务追踪

### Web 展示层建议

```
┌─────────────────────────────────────────┐
│  开会展示面板                            │
├─────────────────────────────────────────┤
│  参与者状态: ●canmou ●creator ●yunying  │
├─────────────────────────────────────────┤
│  会议时间线                              │
│  ├─ 14:00 议题提出 (canmou)             │
│  ├─ 14:05 调研分析 (canmou)              │
│  ├─ 14:15 方案讨论 (全员)                │
│  ├─ 14:30 决策确认 (creator记录)         │
│  └─ 14:45 任务分配 (yunying)             │
├─────────────────────────────────────────┤
│  当前议题: <title>                      │
│  发言: @agent - <content>               │
└─────────────────────────────────────────┘
```

---

## 三、与记忆系统集成

### 记忆系统架构

```
┌─────────────────────────────────────────┐
│           记忆存储层                      │
├─────────────────────────────────────────┤
│  MEMORY.md     - 长期记忆（精简版）       │
│  memory/       - 每日笔记                │
│  learning-logs/ - 学习日志              │
│  LanceDB (vector) - 向量记忆            │
└─────────────────────────────────────────┘
```

### 集成点

#### 1. 会议记录 → 记忆存储

```javascript
// 会议结束后自动存储关键信息
async function meetingToMemory(meetingRecord) {
  // 存储决策到 MEMORY.md
  await memory_store({
    text: `会议决策: ${meetingRecord.decisions.join('; ')}`,
    category: 'decision',
    importance: 0.9
  });

  // 提取行动项到每日记忆
  await appendToDailyMemory({
    type: 'action-items',
    items: meetingRecord.actionItems,
    owner: 'meeting'
  });
}
```

#### 2. agent-communication → 记忆归档

根据 agent-communication 技能要求：
```javascript
// 重要通信后自动归档
async function archiveCommunication(communication) {
  const logPath = `learning-logs/${getDate()}-outcome.md`;
  
  await writeFile(logPath, `
# 跨 Agent 通信记录

## 通信概要
- 发件方: ${communication.from}
- 收件方: ${communication.to}
- 目的: ${communication.purpose}
- 结果: ${communication.status}

## 核心内容
${communication.content}

## 状态
${communication.status === 'completed' ? '✅ 完成' : '❌ 失败'}
  `);
}
```

#### 3. 会议过程 → agent 协作记忆

```javascript
// 让团队成员记住会议上下文
async function syncMeetingContext(meetingId, participants) {
  for (const agent of participants) {
    await session_send({
      target: agent.sessionKey,
      message: `【上下文同步】
会议ID: ${meetingId}
当前议题: ${currentTopic}
你的角色: ${getRole(agent)}
会议目标: ${meetingGoal}
      ` });
  }
}
```

### 记忆写入规则（来自 AGENTS.md）

| 时机 | 目标文件 | 格式 |
|------|----------|------|
| 重要决策后 | learning-logs/YYYY-MM-DD-decisions.md | 决策+理由+结果 |
| 任务完成/失败后 | learning-logs/YYYY-MM-DD-outcomes.md | 任务+结果+问题 |
| 发现新模式后 | learning-logs/YYYY-MM-DD-patterns.md | 模式描述+应用场景 |
| 会话接近压缩时 | MEMORY.md | 精华浓缩版 |

### 置信度追踪

```javascript
// 记录技能调用置信度
const confidenceLog = {
  timestamp: Date.now(),
  skill: 'agent-communication',
  context: 'meeting-collaboration',
  confidence: 0.85, // c=0.85
  note: '待实测验证'
};
```

---

## 四、集成方案总结

### Skills 调用链路

```
用户请求
    ↓
agent-communication (session_send)
    ↓
agent-team-orchestration (任务分发)
    ↓
┌─────────────────────────────────┐
│        开会过程                  │
│  1. canmou 调研                 │
│  2. 多人协作讨论                 │
│  3. creator 记录                │
│  4. yunying 监控                │
└─────────────────────────────────┘
    ↓
记忆系统归档 (memory-hygiene)
    ↓
汇报给用户 (session_send 回复)
```

### 关键 Skills

| Skill | 用途 | 触发场景 |
|-------|------|----------|
| agent-communication | agent 间通信 | 需要跨 agent 协作时 |
| agent-team-orchestration | 多 agent 团队管理 | 建立团队、定义任务流时 |
| memory-hygiene | 向量记忆维护 | 记忆清理、索引优化时 |
| agent-reach | 主动联系用户/agent | 需要推送通知时 |

### 待验证项

- [ ] skills 技能调用链路实测（置信度 c=0.80）
- [ ] 会议记录自动归档流程
- [ ] 多 agent 实时协作的 WebSocket 推送

---

## 五、参考资料

1. `/root/.openclaw/skills/agent-communication/SKILL.md` - agent 间通信协议
2. `/root/.openclaw/workspace/skills/agent-team-orchestration/SKILL.md` - 多 agent 团队编排
3. `/root/.openclaw/workspace/skills/memory-hygiene/SKILL.md` - 记忆维护
4. `/root/.openclaw/workspace/projects/agent-monitor/README.md` - Agent Monitor 项目

---

*研究完成: 2026-03-26 09:50 GMT+8*
