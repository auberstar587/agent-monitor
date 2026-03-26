# Agent Monitor 开会展示系统 — 气泡 UI + 展示逻辑设计

## 1. 气泡 UI 设计

### 1.1 基础气泡样式

```
┌─────────────────────────────┐
│  [头像] [名称]    [时间戳]   │  ← Header 区
├─────────────────────────────┤
│                             │
│     消息内容区域             │
│                             │
└─────────────────────────────┘
              ↘ 尾巴
```

**CSS 关键参数：**

| 属性 | 值 |
|------|-----|
| border-radius | 16px（主体），8px（尾巴区域） |
| max-width | 70%（防止单行太长） |
| min-width | 120px |
| padding | 12px 16px |
| box-shadow | 0 2px 8px rgba(0,0,0,0.12) |
| 尾巴 | CSS ::after 伪元素，绝对定位，12px 三角形 |

### 1.2 角色颜色区分

| 角色 | 气泡背景色 | 文字色 | 头像底色 |
|------|-----------|--------|---------|
| **主持人 (Host)** | `#6366F1` 靛蓝 | `#FFFFFF` | `#4F46E5` |
| **主 Agent (Main)** | `#10B981` 翠绿 | `#FFFFFF` | `#059669` |
| **辅助 Agent (Support)** | `#F59E0B` 琥珀 | `#FFFFFF` | `#D97706` |
| **观察员 (Observer)** | `#6B7280` 灰 | `#FFFFFF` | `#4B5563` |
| **系统消息 (System)** | `#1F2937` 深灰 | `#F3F4F6` | `#111827`（无头像，圆点） |

**左右对齐规则：**
- **AI Agent** → 气泡在左侧，尾巴朝左
- **人类用户** → 气泡在右侧，尾巴朝右，背景色 `#3B82F6`（蓝）

### 1.3 时间戳与头像

```
头像位置：
  - 左侧气泡：头像在气泡左边，垂直居上对齐
  - 右侧气泡：头像在气泡右边，垂直居上对齐

时间戳位置：
  - 紧跟在气泡下方，小字 #9CA3AF，格式：HH:mm
  - 如果需要显示日期：MM/DD HH:mm

名字标签：
  - 左侧气泡：名字在气泡左上角，小字 bold
  - 右侧气泡：名字可省略（已知是当前用户）
```

---

## 2. 展示逻辑

### 2.1 消息队列管理

```javascript
// 消息队列数据结构
class MessageQueue {
  constructor(maxVisible = 50) {
    this.queue = []           // 所有消息存档
    this.visible = []         // 当前屏幕上显示的消息
    this.maxVisible = maxVisible
  }

  push(message) {
    this.queue.push(message)
    if (this.queue.length > 200) {
      // 超过200条历史，只保留必要信息
      this.queue = this.queue.slice(-200)
    }
    this._updateVisible()
  }

  _updateVisible() {
    // 策略：永远显示最新的 maxVisible 条
    this.visible = this.queue.slice(-this.maxVisible)
  }
}
```

**显示原则：**
- 新消息追加到列表底部，自动滚动
- 旧消息从顶部淡出移除
- 最大同时可见 **50 条**（可配置）

### 2.2 动画设计

**入场动画（Appear）：**
```css
@keyframes bubble-in {
  0%   { opacity: 0; transform: translateY(20px) scale(0.95); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
/* duration: 300ms, easing: cubic-bezier(0.34, 1.56, 0.64, 1) （弹性） */
```

**退场动画（Disappear）：**
```css
@keyframes bubble-out {
  0%   { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-10px) scale(0.95); }
}
/* duration: 200ms, easing: ease-out */
```

**打字机效果（AI 输出中）：**
```css
/* AI 正在输出时，气泡右边框闪烁动画 */
@keyframes typing-pulse {
  0%, 100% { border-right-color: rgba(255,255,255,0.3); }
  50%       { border-right-color: rgba(255,255,255,0.9); }
}
/* cursor-blink 动画配合文字逐字显示 */
```

### 2.3 刷屏处理策略

**阈值检测：**
- 5秒内收到 ≥ 5 条消息 → 触发刷屏保护

**刷屏保护模式：**
```
┌─────────────────────────────────────┐
│  ⚡ 消息密集 · 已暂停滚动     [查看全部]│
└─────────────────────────────────────┘
  [倒计时 3s] 后自动恢复，或用户点击展开
```

**具体策略：**
1. **合并模式**：同 Agent 的连续消息合并显示（类似 Slack 的 thread collapsed）
2. **速率限制**：每 200ms 最多渲染 1 条新消息（防卡顿）
3. **暂停滚动**：用户手动滚动查看历史时，暂停自动滚动
4. **折叠旧消息**：超过 20 条时，顶部旧消息折叠为 "↑ 展开 N 条历史消息"

---

## 3. 数据结构设计

### 3.1 消息 JSON 格式

```json
{
  "id": "msg_1708752000000_abc123",
  "agentId": "agent_001",
  "agentName": "Tim",
  "role": "main",
  "content": "我来分析一下这个问题...",
  "contentType": "text",
  "timestamp": 1708752000000,
  "status": "completed",
  "metadata": {
    "parentId": null,
    "replyTo": null,
    "attachments": [],
    "tags": []
  }
}
```

### 3.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一 ID，格式 `msg_{timestamp}_{random}` |
| `agentId` | string | Agent 唯一标识 |
| `agentName` | string | 显示名称 |
| `role` | enum | `host` \| `main` \| `support` \| `observer` \| `system` \| `user` |
| `content` | string | 消息文本内容 |
| `contentType` | enum | `text` \| `markdown` \| `code` \| `image` \| `file` \| `system` |
| `timestamp` | number | Unix ms 时间戳 |
| `status` | enum | `streaming` \| `completed` \| `failed` |
| `metadata.parentId` | string \| null | 回复哪条消息 ID |
| `metadata.replyTo` | string \| null | 回复哪位 Agent |
| `metadata.attachments` | array | 附件列表 |
| `metadata.tags` | array | 自定义标签 |

### 3.3 角色映射配置

```javascript
const ROLE_CONFIG = {
  host: {
    label: '主持人',
    color: '#6366F1',
    avatarBg: '#4F46E5',
    align: 'left',
    tail: 'left'
  },
  main: {
    label: '主 Agent',
    color: '#10B981',
    avatarBg: '#059669',
    align: 'left',
    tail: 'left'
  },
  support: {
    label: '辅助',
    color: '#F59E0B',
    avatarBg: '#D97706',
    align: 'left',
    tail: 'left'
  },
  observer: {
    label: '观察',
    color: '#6B7280',
    avatarBg: '#4B5563',
    align: 'left',
    tail: 'left'
  },
  system: {
    label: '系统',
    color: '#1F2937',
    avatarBg: '#111827',
    align: 'center',
    tail: 'none'
  },
  user: {
    label: '我',
    color: '#3B82F6',
    avatarBg: '#2563EB',
    align: 'right',
    tail: 'right'
  }
}
```

---

## 4. 组件接口概要

```typescript
interface BubbleMessage {
  // 渲染 props
  message: Message
  config: RoleConfig
  onTailClick?: (messageId: string) => void

  // 内部状态
  isStreaming: boolean   // 打字机效果进行中
  isHovered: boolean     // 显示操作按钮
  isCollapsed: boolean   // 被折叠（刷屏保护时）
}

interface ChatPanel {
  // 核心 props
  messages: Message[]
  agents: Agent[]

  // 控制
  autoScroll: boolean
  onScrollHistory: () => void

  // 刷屏保护状态
  isFloodProtected: boolean
  floodCount: number
  floodTimer: number
}
```

---

## 5. 布局示意

```
┌──────────────────────────────────────────────────────┐
│  🤖 Agent Monitor                    [参会成员 4人]  │  ← 顶栏
├──────────────────────────────────────────────────────┤
│                                                      │
│  [👤] Tim (主 Agent)          10:30                  │
│  ┌────────────────────────────────┐                   │
│  │ 好的，我们来看一下这个问题...  │←尾巴              │
│  └────────────────────────────────┘                   │
│                        [👤] 10:30                     │
│                        ┌────────────────────────────────┐ │
│                        │  我认为可以先做...            │→尾巴
│                        └────────────────────────────────┘ │
│                                                      │
│  [👤] Support Agent            10:31                  │
│  ┌────────────────────────────────┐                   │
│  │ 补充一点：还需要考虑...        │←尾巴              │
│  └────────────────────────────────┘                   │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │ ⚡ 消息密集 · 3s后恢复滚动           [展开全部]  ││  ← 刷屏保护条
│  └──────────────────────────────────────────────────┘│
│                                                      │
├──────────────────────────────────────────────────────┤
│  [输入框]                              [发送]        │  ← 底栏（可选）
└──────────────────────────────────────────────────────┘
```

---

*设计版本：v1.0*
*更新日期：2026-03-26*
