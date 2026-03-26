/**
 * Agent Monitor — Bubble Renderer
 * Updated: Sprint 1 - Real-time message support
 * Based on bubble-ui-design.md v1.0 + ui-ux-细化.md
 *
 * Features:
 * - Receives Socket.io message:new events
 * - Max 50 visible messages
 * - Auto-scroll to bottom on new messages
 * - White bubble bg + colored border per role (from role theme color)
 * - Tail direction follows role alignment
 * - 300ms spring entrance animation
 *
 * Message format:
 * {
 *   id: "msg_xxx",
 *   agentId: "canmou",
 *   content: "消息内容",
 *   timestamp: 1234567890,
 *   status: "confirmed" // confirmed/streaming/failed
 * }
 */

// ---- Role Configuration ----
// Border color sourced from role theme color; background is always white
const ROLE_CONFIG = {
  host: {
    label: '主持人',
    color: '#6366F1',      // border color
    bg: '#FFFFFF',         // bubble background (always white)
    avatarBg: '#4F46E5',
    align: 'left',
    tail: 'left'
  },
  main: {
    label: '主 Agent',
    color: '#10B981',
    bg: '#FFFFFF',
    avatarBg: '#059669',
    align: 'left',
    tail: 'left'
  },
  support: {
    label: '辅助',
    color: '#F59E0B',
    bg: '#FFFFFF',
    avatarBg: '#D97706',
    align: 'left',
    tail: 'left'
  },
  observer: {
    label: '观察',
    color: '#6B7280',
    bg: '#FFFFFF',
    avatarBg: '#4B5563',
    align: 'left',
    tail: 'left'
  },
  system: {
    label: '系统',
    color: '#1F2937',
    bg: '#1F2937',
    avatarBg: '#111827',
    align: 'center',
    tail: 'none'
  },
  user: {
    label: '我',
    color: '#3B82F6',
    bg: '#FFFFFF',
    avatarBg: '#2563EB',
    align: 'right',
    tail: 'right'
  }
};

const DEFAULT_ROLE = 'main';
const MAX_VISIBLE = 50; // max 50 messages shown

// ---- Message Queue ----
class MessageQueue {
  constructor(maxVisible = MAX_VISIBLE) {
    this.queue = [];
    this.visible = [];
    this.maxVisible = maxVisible;
  }

  push(message) {
    this.queue.push(message);
    this._updateVisible();
  }

  _updateVisible() {
    // Always show newest maxVisible
    this.visible = this.queue.slice(-this.maxVisible);
  }

  updateMessage(id, patch) {
    const msg = this.queue.find(m => m.id === id);
    if (msg) {
      Object.assign(msg, patch);
      this._updateVisible();
    }
  }

  get collapsedCount() {
    return Math.max(0, this.queue.length - this.maxVisible);
  }
}

// ---- Bubble Renderer ----
class BubbleRenderer {
  constructor(container, options = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    this.options = {
      maxVisible: options.maxVisible || MAX_VISIBLE,
      autoScroll: options.autoScroll !== false,
      ...options
    };

    this.queue = new MessageQueue(this.options.maxVisible);
    this.agents = new Map();
    this._streamingElements = new Map();
    this._lastSenderId = null;
    this._lastSenderTime = 0;
    this._groupWindowMs = 3000;

    // Socket.io instance (set via initSocket or auto-detect)
    this._io = null;

    this._buildDOM();
    this._bindScroll();
  }

  // ---- DOM Build ----
  _buildDOM() {
    this.container.innerHTML = '';
    this.container.classList.add('chat-panel');

    this._header = document.createElement('div');
    this._header.className = 'chat-panel-header';
    this._header.innerHTML = `
      <span class="chat-panel-title">🤖 Agent Monitor</span>
      <span class="chat-panel-meta" id="bubble-meta">参会成员 0 人</span>
    `;
    this.container.appendChild(this._header);

    this._messageList = document.createElement('div');
    this._messageList.className = 'chat-messages';
    this._messageList.id = 'chat-messages';
    this.container.appendChild(this._messageList);

    this._scrollHint = document.createElement('div');
    this._scrollHint.className = 'scroll-hint';
    this._scrollHint.textContent = '↓ 新消息';
    this._scrollHint.addEventListener('click', () => this.scrollToBottom(true));
    this.container.appendChild(this._scrollHint);
  }

  // ---- Scroll Binding ----
  _bindScroll() {
    this._messageList.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this._messageList;
      const atBottom = scrollHeight - scrollTop - clientHeight < 60;
      if (atBottom) {
        this._userScrolled = false;
        this._scrollHint.classList.remove('visible');
      } else {
        this._userScrolled = true;
      }
    });
  }

  // ---- Register Agent ----
  registerAgent(agent) {
    if (!this.agents.has(agent.agentId)) {
      this.agents.set(agent.agentId, agent);
      this._updateMeta();
    } else {
      Object.assign(this.agents.get(agent.agentId), agent);
    }
  }

  registerAgents(agents) {
    agents.forEach(a => this.registerAgent(a));
  }

  _updateMeta() {
    const metaEl = this.container.querySelector('#bubble-meta');
    if (metaEl) {
      metaEl.textContent = `参会成员 ${this.agents.size} 人`;
    }
  }

  // ---- Socket.io Integration ----
  // Call this to connect renderer to a Socket.io namespace/room
  initSocket(io, options = {}) {
    const room = options.room || 'monitor';
    this._io = io;

    io.on('message:new', (message) => {
      this.pushMessage(message);
    });

    io.on('message:update', (patch) => {
      // patch format: { id, ...fields }
      this.updateStreamingMessage(patch.id, patch);
    });

    io.emit('room:join', room);
  }

  // Push a message (from socket or programmatic)
  pushMessage(message) {
    if (!message.id) {
      message.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    if (!message.role) {
      message.role = this._inferRole(message.agentId);
    }

    this.queue.push(message);
    this._doRender();

    // Auto scroll to bottom
    if (this.options.autoScroll && !this._userScrolled) {
      this.scrollToBottom(true);
    } else if (this._userScrolled) {
      this._scrollHint.classList.add('visible');
    }
  }

  // Update a streaming or existing message by id
  updateStreamingMessage(id, patch) {
    this.queue.updateMessage(id, patch);
    this._doRender();
  }

  // Infer role from agentId (for agents not in registry)
  _inferRole(agentId) {
    const agent = this.agents.get(agentId);
    return agent ? agent.role : DEFAULT_ROLE;
  }

  // ---- Render ----
  _doRender() {
    const messages = this.queue.visible;
    const html = this._buildMessagesHTML(messages);
    this._messageList.innerHTML = html;

    // Re-attach streaming state
    messages.forEach(msg => {
      if (msg.status === 'streaming') {
        const el = document.getElementById(`bubble-${msg.id}`);
        if (el) el.classList.add('streaming');
      }
    });

    // Auto scroll
    if (this.options.autoScroll && !this._userScrolled) {
      this.scrollToBottom(true);
    }
  }

  // ---- Build Messages HTML ----
  _buildMessagesHTML(messages) {
    let html = '';
    for (let i = 0; i < messages.length; i++) {
      html += this._buildMessageHTML(messages[i], i);
    }
    return html;
  }

  // ---- Build Single Message HTML ----
  _buildMessageHTML(msg, index) {
    const role = msg.role || DEFAULT_ROLE;
    const config = ROLE_CONFIG[role];
    const isStreaming = msg.status === 'streaming';
    const isCenter = config.align === 'center';
    const tailDir = config.tail; // 'left' | 'right' | 'none'

    // Avatar
    let avatarHtml = '';
    if (role !== 'system') {
      const initial = (msg.agentName || config.label || '?').charAt(0).toUpperCase();
      avatarHtml = `<div class="bubble-avatar" style="background:${config.avatarBg}">${initial}</div>`;
    }

    // Timestamp
    const time = new Date(msg.timestamp);
    const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    // Content (escape HTML)
    const content = this._escapeHtml(msg.content || '');

    // Status
    let statusHtml = '';
    if (role !== 'system' && isStreaming) {
      statusHtml = `<div class="bubble-status"><span class="typing-cursor"></span></div>`;
    } else if (role !== 'system' && msg.status === 'failed') {
      statusHtml = `<div class="bubble-status failed">发送失败 ⚠</div>`;
    }

    // Grouping: hide avatar+header if same agent within 3s
    const prevMsg = this.queue.visible[index - 1];
    const isGrouped = prevMsg &&
      prevMsg.agentId === msg.agentId &&
      (msg.timestamp - prevMsg.timestamp) < this._groupWindowMs &&
      !isStreaming;

    // Bubble class: includes role + tail direction
    const bubbleClasses = `bubble-bubble${isStreaming ? ' streaming' : ''}`;
    const bubbleStyle = `border-color: ${config.color};`;

    // System message (centered, no tail)
    if (isCenter) {
      return `
        <div class="bubble-row system center" data-id="${msg.id}">
          <div class="bubble-bubble" id="bubble-${msg.id}" style="border-color:${config.color}">
            <div class="bubble-content">${content}</div>
          </div>
        </div>`;
    }

    // Grouped: just bubble content
    if (isGrouped) {
      return `
        <div class="${bubbleClasses}"
             id="bubble-${msg.id}"
             data-id="${msg.id}"
             style="${bubbleStyle}">
          <div class="bubble-content">${content}${isStreaming ? '<span class="typing-cursor"></span>' : ''}</div>
        </div>`;
    }

    // Name
    const nameHtml = config.align === 'right'
      ? ''
      : `<span class="bubble-name" style="color:${config.color}">${this._escapeHtml(msg.agentName || config.label)}</span>`;

    const rowClass = `bubble-row ${role} tail-${tailDir}`;

    return `
      <div class="${rowClass}" data-id="${msg.id}">
        ${avatarHtml}
        <div class="${bubbleClasses}"
             id="bubble-${msg.id}"
             style="${bubbleStyle}">
          <div class="bubble-header">
            ${nameHtml}
            <span class="bubble-timestamp">${timeStr}</span>
          </div>
          <div class="bubble-content">${content}${isStreaming ? '<span class="typing-cursor"></span>' : ''}</div>
          ${statusHtml}
        </div>
      </div>`;
  }

  // ---- Scroll ----
  scrollToBottom(animated = false) {
    if (animated) {
      this._messageList.scrollTo({
        top: this._messageList.scrollHeight,
        behavior: 'smooth'
      });
    } else {
      this._messageList.scrollTop = this._messageList.scrollHeight;
    }
    this._userScrolled = false;
    this._scrollHint.classList.remove('visible');
  }

  // ---- Utilities ----
  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- Public: Clear ----
  clear() {
    this.queue = new MessageQueue(this.options.maxVisible);
    this._messageList.innerHTML = '';
    this._streamingElements.clear();
  }

  // ---- Public: Get State ----
  getState() {
    return {
      queueLength: this.queue.queue.length,
      visibleLength: this.queue.visible.length,
      collapsedCount: this.queue.collapsedCount
    };
  }
}

// Auto-init: try to connect to Socket.io if available on page
// Looks for io() from /socket.io/socket.io.js
function autoInitBubble(containerOrSelector, options = {}) {
  const container = typeof containerOrSelector === 'string'
    ? document.querySelector(containerOrSelector)
    : containerOrSelector;

  const renderer = new BubbleRenderer(container, options);

  if (typeof io !== 'undefined') {
    const socket = io();
    renderer.initSocket(socket, options);
  }

  return renderer;
}

// Auto-init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.bubbleAutoInit !== 'false') {
    window.bubbleRenderer = autoInitBubble('#chat-panel', {
      maxVisible: 50,
      autoScroll: true
    });
  }
});

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BubbleRenderer, MessageQueue, ROLE_CONFIG, autoInitBubble };
}
