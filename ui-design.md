# Agent Monitor 开会展示界面设计

## 整体风格说明

### 设计定位
- **场景**: 投屏展示 / 大屏监控
- **基调**: 科技感、专业、实时
- **色系**: 深色主题（便于长时间观看，减少视觉疲劳）

### 配色方案
```
主背景:     #0d1117 (深夜蓝黑)
卡片背景:   #161b22 (略浅蓝黑)
边框:      #30363d (柔和灰)
主文字:    #e6edf3 (柔和白)
次要文字:  #8b949e (灰色)
强调色-主: #58a6ff (科技蓝)
强调色-次: #f78166 (暖橙)
决策高亮:  #3fb950 (决策绿)
警告色:    #d29922 (黄)
Agent-1:   #a371f7 (紫)
Agent-2:   #79c0ff (浅蓝)
Agent-3:   #7ee787 (绿)
```

### 字体
- 主字体: `'JetBrains Mono', 'Fira Code', monospace` (代码/时间戳)
- 界面字体: `'Inter', 'PingFang SC', sans-serif` (正文)

---

## 界面整体布局

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER: 项目名称 + 会议时长 + Agent在线状态 + 全局操作按钮        │
├────────────────┬─────────────────────────────────────────────────┤
│                │                                                 │
│   Agent 列表   │              消息时间线 (主区域)                 │
│   (左侧边栏)   │                                                 │
│                │   - 按时间倒序，最新在上                         │
│   - 头像       │   - 消息卡片含: 发送者头像、时间、内容            │
│   - 名称       │   - 决策节点用特殊高亮边框                        │
│   - 状态       │                                                 │
│   - 实时指示   │                                                 │
│                ├─────────────────────────────────────────────────┤
│                │              决策面板 (底部)                      │
│                │   - 当前决策摘要                                 │
│                │   - 决策依据标签                                  │
│                │   - 投票/结论状态                                 │
└────────────────┴─────────────────────────────────────────────────┘
```

---

## 模块1: Agent头像展示

### HTML结构
```html
<div class="agent-card" data-agent-id="agent-1">
  <div class="avatar-container">
    <div class="avatar-ring status-active"></div>
    <img class="avatar-img" src="/avatars/agent-1.png" alt="Agent 1" />
    <div class="status-dot online"></div>
  </div>
  <div class="agent-info">
    <div class="agent-name">Tim</div>
    <div class="agent-role">主决策者</div>
    <div class="agent-status-text">思考中...</div>
  </div>
  <div class="activity-bar">
    <div class="activity-fill" style="width: 78%"></div>
  </div>
</div>
```

### CSS样式
```css
.agent-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.3s ease;
}

.agent-card:hover {
  border-color: var(--agent-color);
  box-shadow: 0 0 20px rgba(agent-color, 0.15);
}

.avatar-container {
  position: relative;
  width: 56px;
  height: 56px;
}

.avatar-ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid var(--agent-color);
  animation: pulse-ring 2s infinite;
}

.avatar-ring.status-active {
  opacity: 1;
}

.avatar-ring.status-idle {
  opacity: 0.3;
  animation: none;
}

@keyframes pulse-ring {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: 0.7; }
}

.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: #21262d;
}

.status-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #161b22;
}

.status-dot.online { background: #3fb950; }
.status-dot.busy { background: #f78166; }
.status-dot.idle { background: #8b949e; }

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 16px;
  font-weight: 600;
  color: #e6edf3;
}

.agent-role {
  font-size: 12px;
  color: #8b949e;
  margin-top: 2px;
}

.agent-status-text {
  font-size: 11px;
  color: var(--agent-color);
  margin-top: 4px;
  font-family: 'JetBrains Mono', monospace;
}

.activity-bar {
  width: 100%;
  height: 3px;
  background: #30363d;
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}

.activity-fill {
  height: 100%;
  background: var(--agent-color);
  border-radius: 2px;
  transition: width 0.5s ease;
}
```

---

## 模块2: 消息时间线

### HTML结构
```html
<div class="timeline-container">
  <div class="timeline-header">
    <span class="timeline-title">实时讨论</span>
    <span class="message-count">23 条消息</span>
  </div>
  
  <div class="timeline-scroll">
    <!-- 普通消息 -->
    <div class="message-item" data-ts="1711425600">
      <div class="message-avatar">
        <img src="/avatars/agent-1.png" />
      </div>
      <div class="message-content">
        <div class="message-meta">
          <span class="sender-name">Tim</span>
          <span class="message-time">14:23:45</span>
        </div>
        <div class="message-bubble">
          分析完成，建议采用方案A
        </div>
      </div>
    </div>

    <!-- 决策节点消息 -->
    <div class="message-item decision-node" data-decision-id="d-001">
      <div class="decision-indicator">
        <div class="decision-icon">⚡</div>
        <div class="decision-line"></div>
      </div>
      <div class="message-content">
        <div class="decision-header">
          <span class="decision-badge">决策 #001</span>
          <span class="decision-time">14:24:00</span>
        </div>
        <div class="decision-bubble">
          <div class="decision-question">采用哪个部署策略？</div>
          <div class="decision-options">
            <div class="option option-selected">
              <span class="option-label">A. 滚动更新</span>
              <span class="option-votes">3票</span>
            </div>
            <div class="option">
              <span class="option-label">B. 蓝绿部署</span>
              <span class="option-votes">1票</span>
            </div>
          </div>
          <div class="decision-result">
            <span class="result-badge success">已确认</span>
            <span class="result-summary">采纳方案A，用时12秒</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 引用回复 -->
    <div class="message-item reply-node" data-reply-to="d-001">
      <div class="message-avatar">
        <img src="/avatars/agent-2.png" />
      </div>
      <div class="message-content">
        <div class="message-meta">
          <span class="reply-indicator">↩ 回复 Tim</span>
          <span class="sender-name">Alice</span>
          <span class="message-time">14:24:05</span>
        </div>
        <div class="message-bubble reply">
          同意，滚动更新风险更低
        </div>
      </div>
    </div>
  </div>
</div>
```

### CSS样式
```css
.timeline-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d1117;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
}

.timeline-title {
  font-size: 16px;
  font-weight: 600;
  color: #e6edf3;
}

.message-count {
  font-size: 12px;
  color: #8b949e;
  background: #21262d;
  padding: 4px 10px;
  border-radius: 12px;
}

.timeline-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;
}

.timeline-scroll::-webkit-scrollbar {
  width: 6px;
}

.timeline-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.timeline-scroll::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 3px;
}

.message-item {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  animation: slide-in 0.3s ease;
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-avatar {
  flex-shrink: 0;
}

.message-avatar img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #21262d;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.sender-name {
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
}

.message-time {
  font-size: 11px;
  color: #8b949e;
  font-family: 'JetBrains Mono', monospace;
}

.reply-indicator {
  font-size: 11px;
  color: #58a6ff;
  margin-right: 4px;
}

.message-bubble {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.5;
  color: #e6edf3;
  max-width: 600px;
}

.message-bubble.reply {
  border-left: 2px solid #58a6ff;
}
```

---

## 模块3: 决策高亮

### 决策节点专用样式
```css
/* 决策节点 */
.message-item.decision-node {
  margin: 24px 0;
}

.decision-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
  flex-shrink: 0;
}

.decision-icon {
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #f78166, #d29922);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  box-shadow: 0 0 16px rgba(247, 129, 102, 0.4);
}

.decision-line {
  flex: 1;
  width: 2px;
  background: linear-gradient(to bottom, #f78166, transparent);
  margin-top: 4px;
}

.decision-bubble {
  background: linear-gradient(135deg, #161b22, #1c2128);
  border: 1px solid #f78166;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 
    0 0 30px rgba(247, 129, 102, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.decision-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.decision-badge {
  background: linear-gradient(90deg, #f78166, #d29922);
  color: #0d1117;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.decision-time {
  font-size: 11px;
  color: #8b949e;
  font-family: 'JetBrains Mono', monospace;
}

.decision-question {
  font-size: 15px;
  font-weight: 600;
  color: #e6edf3;
  margin-bottom: 12px;
}

.decision-options {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.option {
  flex: 1;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s ease;
}

.option.option-selected {
  border-color: #3fb950;
  background: rgba(63, 185, 80, 0.1);
}

.option.option-rejected {
  border-color: #f85149;
  opacity: 0.5;
}

.option-label {
  font-size: 13px;
  color: #e6edf3;
}

.option-votes {
  font-size: 12px;
  color: #8b949e;
  font-family: 'JetBrains Mono', monospace;
}

.option.option-selected .option-votes {
  color: #3fb950;
}

.decision-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid #30363d;
}

.result-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}

.result-badge.success {
  background: rgba(63, 185, 80, 0.2);
  color: #3fb950;
}

.result-badge.pending {
  background: rgba(210, 153, 34, 0.2);
  color: #d29922;
}

.result-summary {
  font-size: 12px;
  color: #8b949e;
}
```

---

## 模块4: JavaScript交互

```javascript
class MeetingMonitor {
  constructor(config) {
    this.container = document.getElementById('timeline');
    this.agents = new Map();
    this. decisions = new Map();
    this.ws = null;
    this.init();
  }

  init() {
    this.setupWebSocket();
    this.setupAutoScroll();
    this.startClock();
  }

  setupWebSocket() {
    // 连接实时消息通道
    this.ws = new WebSocket(config.wsUrl);
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };
    
    this.ws.onclose = () => {
      setTimeout(() => this.setupWebSocket(), 3000);
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'message':
        this.appendMessage(data.payload);
        break;
      case 'decision':
        this.showDecision(data.payload);
        break;
      case 'agent_status':
        this.updateAgentStatus(data.payload);
        break;
      case 'vote':
        this.updateVote(data.payload);
        break;
    }
  }

  appendMessage(msg) {
    const template = this.createMessageTemplate(msg);
    this.container.insertAdjacentHTML('afterbegin', template);
    this.animateNewMessage();
  }

  showDecision(decision) {
    this.decisions.set(decision.id, decision);
    const template = this.createDecisionTemplate(decision);
    this.container.insertAdjacentHTML('afterbegin', template);
    
    // 高亮动画
    const el = document.querySelector(`[data-decision-id="${decision.id}"]`);
    el.classList.add('decision-highlight');
    setTimeout(() => el.classList.remove('decision-highlight'), 2000);
  }

  updateAgentStatus(status) {
    const card = document.querySelector(`[data-agent-id="${status.agentId}"]`);
    if (card) {
      card.querySelector('.agent-status-text').textContent = status.text;
      card.querySelector('.activity-fill').style.width = status.activity + '%';
      
      const statusDot = card.querySelector('.status-dot');
      statusDot.className = `status-dot ${status.state}`;
    }
  }

  setupAutoScroll() {
    // 新消息时平滑滚动
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.addedNodes.length) {
          this.container.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }
      });
    });
    
    observer.observe(this.container, { childList: true });
  }

  startClock() {
    const clockEl = document.getElementById('meeting-duration');
    const startTime = Date.now();
    
    setInterval(() => {
      const elapsed = Date.now() - startTime;
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      clockEl.textContent = `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
    }, 1000);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  window.monitor = new MeetingMonitor({
    wsUrl: 'wss://api.example.com/monitor/live'
  });
});
```

---

## 布局响应式说明

### 大屏 (>1400px)
- 左侧Agent栏固定宽度 280px
- 主时间线区域自适应

### 中屏 (900-1400px)
- Agent栏收缩为头像列表（仅显示头像和状态点）
- 悬浮显示Agent信息

### 小屏 (<900px)
- Agent栏改为顶部横向滚动条
- 时间线单列显示
- 决策面板折叠为可展开抽屉

---

## 动效清单

| 动效 | 描述 | 时长 |
|------|------|------|
| 消息入场 | 从上方滑入 + 淡入 | 300ms |
| 决策高亮 | 边框发光脉冲 | 2000ms |
| Agent状态切换 | 颜色渐变 | 500ms |
| 投票更新 | 进度条宽度过渡 | 400ms |
| 新消息标记 | 时间戳闪烁 | 1次 |

---

## 无障碍考虑

- 所有颜色对比度 ≥ 4.5:1
- 决策节点有 aria-label 标识
- 支持键盘导航（Tab/Enter）
- 减少动画模式（prefers-reduced-motion）
