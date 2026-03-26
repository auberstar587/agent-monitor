/**
 * Agent Monitor — Bubble Renderer
 * Based on bubble-ui-design.md v1.0
 *
 * Features:
 * - 5-role color scheme (host/main/support/observer/system/user)
 * - Message queue: max 50 visible / 200 history
 * - Flood protection: 5+ msgs in 5s → pause + countdown
 * - Streaming / typing cursor animation
 * - Collapse old messages (>20 visible → top collapse banner)
 */

// ---- Role Configuration ----
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
};

// ---- Default config fallback ----
const DEFAULT_ROLE = 'main';

// ---- Message Queue ----
class MessageQueue {
  constructor(maxVisible = 50, maxHistory = 200) {
    this.queue = [];           // full archive
    this.visible = [];         // currently rendered
    this.maxVisible = maxVisible;
    this.maxHistory = maxHistory;
  }

  push(message) {
    this.queue.push(message);
    if (this.queue.length > this.maxHistory) {
      // Compact old messages to keep only essential fields
      const overflow = this.queue.length - this.maxHistory;
      this.queue = [
        ...this.queue.slice(0, Math.floor(this.maxHistory * 0.3)).map(m => ({
          id: m.id,
          agentId: m.agentId,
          agentName: m.agentName,
          role: m.role,
          content: m.content,
          contentType: m.contentType,
          timestamp: m.timestamp,
          status: m.status,
          _compact: true
        })),
        ...this.queue.slice(-Math.floor(this.maxHistory * 0.7))
      ];
    }
    this._updateVisible();
  }

  _updateVisible() {
    if (this.queue.length <= this.maxVisible) {
      this.visible = [...this.queue];
    } else {
      // Always show newest maxVisible
      this.visible = this.queue.slice(-this.maxVisible);
    }
  }

  updateMessage(id, patch) {
    const msg = this.queue.find(m => m.id === id);
    if (msg) {
      Object.assign(msg, patch);
      this._updateVisible();
    }
  }

  getHistory(start, count) {
    return this.queue.slice(start, start + count);
  }

  get collapsedCount() {
    return Math.max(0, this.queue.length - this.maxVisible);
  }

  get lastVisibleTimestamp() {
    return this.visible.length > 0
      ? this.visible[this.visible.length - 1].timestamp
      : 0;
  }
}

// ---- Flood Protector ----
class FloodProtector {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 5000;       // 5s detection window
    this.threshold = options.threshold || 5;        // ≥5 msgs triggers protection
    this.protectionDuration = options.protectionDuration || 3000; // 3s pause
    this.messages = [];                             // timestamps within window
    this.isProtected = false;
    this._timer = null;
    this._onEnter = options.onEnter || (() => {});
    this._onExit = options.onExit || (() => {});
    this._onCountdown = options.onCountdown || (() => {});
  }

  record(timestamp = Date.now()) {
    if (this.isProtected) return false;

    this.messages.push(timestamp);
    // prune old
    const cutoff = timestamp - this.windowMs;
    this.messages = this.messages.filter(t => t > cutoff);

    if (this.messages.length >= this.threshold) {
      this._enter();
      return true;
    }
    return false;
  }

  _enter() {
    this.isProtected = true;
    this.messages = [];
    this._onEnter();
    let remaining = Math.ceil(this.protectionDuration / 1000);
    this._onCountdown(remaining);
    this._timer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this._exit();
      } else {
        this._onCountdown(remaining);
      }
    }, 1000);
  }

  _exit() {
    clearInterval(this._timer);
    this._timer = null;
    this.isProtected = false;
    this._onExit();
  }

  forceExit() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.isProtected = false;
    this._onExit();
  }
}

// ---- Bubble Renderer ----
class BubbleRenderer {
  constructor(container, options = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    this.options = {
      maxVisible: options.maxVisible || 50,
      maxHistory: options.maxHistory || 200,
      floodThreshold: options.floodThreshold || 5,
      floodWindowMs: options.floodWindowMs || 5000,
      floodPauseMs: options.floodPauseMs || 3000,
      renderThrottleMs: options.renderThrottleMs || 200,
      collapseThreshold: options.collapseThreshold || 20,
      autoScroll: options.autoScroll !== false,
      ...options
    };

    this.queue = new MessageQueue(this.options.maxVisible, this.options.maxHistory);

    // Flood protection
    this.floodProtector = new FloodProtector({
      windowMs: this.options.floodWindowMs,
      threshold: this.options.floodThreshold,
      protectionDuration: this.options.floodPauseMs,
      onEnter: () => this._showFloodBar(),
      onExit: () => this._hideFloodBar(),
      onCountdown: (n) => this._updateFloodCountdown(n)
    });

    // Render throttling
    this._renderPending = false;
    this._renderTimer = null;

    // Scroll state
    this._userScrolled = false;
    this._atBottom = true;

    // Agents registry (for avatars)
    this.agents = new Map();

    // Grouping: track last sender for rapid-fire grouping
    this._lastSenderId = null;
    this._lastSenderTime = 0;
    this._groupWindowMs = 3000; // group if same agent speaks within 3s

    // Streaming message tracking
    this._streamingElements = new Map();

    // Build DOM structure
    this._buildDOM();

    // Bind scroll events
    this._bindScroll();
  }

  // ---- DOM Build ----
  _buildDOM() {
    this.container.innerHTML = '';
    this.container.classList.add('chat-panel');

    // Header
    this._header = document.createElement('div');
    this._header.className = 'chat-panel-header';
    this._header.innerHTML = `
      <span class="chat-panel-title">🤖 Agent Monitor</span>
      <span class="chat-panel-meta" id="bubble-meta">参会成员 0 人</span>
    `;
    this.container.appendChild(this._header);

    // Flood protection bar
    this._floodBar = document.createElement('div');
    this._floodBar.className = 'flood-protection-bar';
    this._floodBar.innerHTML = `
      <span class="flood-icon">⚡</span>
      <span class="flood-text">消息密集 · 已暂停滚动</span>
      <span class="flood-countdown"></span>
      <button class="flood-expand-btn">展开全部</button>
    `;
    this._floodBar.querySelector('.flood-expand-btn').addEventListener('click', () => {
      this.floodProtector.forceExit();
    });
    this.container.appendChild(this._floodBar);

    // Collapse old messages banner
    this._collapseBanner = document.createElement('div');
    this._collapseBanner.className = 'collapse-banner';
    this._collapseBanner.innerHTML = '⬆ 展开 N 条历史消息';
    this._collapseBanner.addEventListener('click', () => this._expandHistory());
    this.container.appendChild(this._collapseBanner);

    // Message list
    this._messageList = document.createElement('div');
    this._messageList.className = 'chat-messages';
    this._messageList.id = 'chat-messages';
    this.container.appendChild(this._messageList);

    // Scroll-to-bottom hint
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
      this._atBottom = scrollHeight - scrollTop - clientHeight < 60;
      if (this._atBottom) {
        this._userScrolled = false;
        this._scrollHint.classList.remove('visible');
      } else {
        this._userScrolled = true;
      }
    });
  }

  // ---- Register Agent ----
  registerAgent(agent) {
    const existing = this.agents.get(agent.agentId);
    if (!existing) {
      this.agents.set(agent.agentId, agent);
      this._updateMeta();
    } else {
      Object.assign(existing, agent);
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

  // ---- Push Message ----
  pushMessage(message) {
    // Normalize role
    if (!ROLE_CONFIG[message.role]) {
      message.role = DEFAULT_ROLE;
    }

    // Stamp ID if missing
    if (!message.id) {
      message.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    this.queue.push(message);

    // Flood check
    this.floodProtector.record(message.timestamp);

    // Throttled render
    this._scheduleRender();
  }

  // ---- Update Streaming Message ----
  updateStreamingMessage(id, patch) {
    this.queue.updateMessage(id, patch);
    this._scheduleRender();
  }

  // ---- Render Throttling ----
  _scheduleRender() {
    if (this._renderTimer) return;
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      this._doRender();
    }, this.options.renderThrottleMs);
  }

  // ---- Full Render ----
  _doRender() {
    const messages = this.queue.visible;
    const collapsedCount = this.queue.collapsedCount;

    // Show collapse banner if needed
    if (collapsedCount > 0 && messages.length >= this.options.collapseThreshold) {
      this._collapseBanner.querySelector('span').textContent =
        `⬆ 展开 ${collapsedCount} 条历史消息`;
      this._collapseBanner.classList.add('visible');
    } else {
      this._collapseBanner.classList.remove('visible');
    }

    // Build HTML
    const html = this._buildMessagesHTML(messages);
    this._messageList.innerHTML = html;

    // Re-attach streaming animations
    messages.forEach(msg => {
      if (msg.status === 'streaming') {
        const el = document.getElementById(`bubble-${msg.id}`);
        if (el) {
          el.classList.add('streaming');
          this._streamingElements.set(msg.id, el);
        }
      }
    });

    // Auto scroll
    if (this.options.autoScroll && !this._userScrolled && !this.floodProtector.isProtected) {
      this.scrollToBottom(true);
    } else if (!this._atBottom) {
      this._scrollHint.classList.add('visible');
    }
  }

  // ---- Build Single Message HTML ----
  _buildMessageHTML(msg, index) {
    const role = msg.role || DEFAULT_ROLE;
    const config = ROLE_CONFIG[role];
    const isStreaming = msg.status === 'streaming';
    const isCenter = config.align === 'center';

    // Avatar
    let avatarHtml = '';
    if (role !== 'system') {
      const initial = (msg.agentName || config.label || '?').charAt(0).toUpperCase();
      const bgColor = config.avatarBg;
      avatarHtml = `<div class="bubble-avatar" style="background:${bgColor}">${initial}</div>`;
    } else {
      avatarHtml = `<div class="bubble-avatar no-avatar"></div>`;
    }

    // Timestamp format
    const time = new Date(msg.timestamp);
    const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    // Content (escape HTML)
    const content = this._escapeHtml(msg.content || '');

    // Status indicator
    let statusHtml = '';
    if (role !== 'system') {
      if (isStreaming) {
        statusHtml = `<div class="bubble-status"><span class="typing-cursor"></span></div>`;
      } else if (msg.status === 'failed') {
        statusHtml = `<div class="bubble-status failed">发送失败 ⚠</div>`;
      }
    }

    // Grouping: hide avatar+name if same sender within _groupWindowMs
    const prevMsg = this.queue.visible[index - 1];
    const isGrouped = prevMsg &&
      prevMsg.agentId === msg.agentId &&
      (msg.timestamp - prevMsg.timestamp) < this._groupWindowMs &&
      !isStreaming;

    if (isGrouped) {
      // Return just the bubble content, no header/avatar
      return `
        <div class="bubble-bubble${isStreaming ? ' streaming' : ''}"
             style="border-radius: var(--bubble-radius);"
             id="bubble-${msg.id}"
             data-id="${msg.id}">
          <div class="bubble-content">${content}${isStreaming ? '<span class="typing-cursor"></span>' : ''}</div>
          ${statusHtml}
        </div>`;
    }

    if (isCenter) {
      return `
        <div class="bubble-row system center" data-id="${msg.id}">
          <div class="bubble-avatar no-avatar"></div>
          <div class="bubble-bubble" id="bubble-${msg.id}">
            <div class="bubble-content">${content}</div>
          </div>
        </div>`;
    }

    const nameHtml = config.align === 'right'
      ? ''
      : `<span class="bubble-name">${this._escapeHtml(msg.agentName || config.label)}</span>`;

    const tailClass = config.tail === 'right' ? 'right' : 'left';

    return `
      <div class="bubble-row ${role} ${tailClass}" data-id="${msg.id}">
        ${avatarHtml}
        <div class="bubble-bubble${isStreaming ? ' streaming' : ''}"
             id="bubble-${msg.id}">
          <div class="bubble-header">
            ${nameHtml}
            <span class="bubble-timestamp">${timeStr}</span>
          </div>
          <div class="bubble-content">${content}${isStreaming ? '<span class="typing-cursor"></span>' : ''}</div>
          ${statusHtml}
        </div>
      </div>`;
  }

  // ---- Build All Messages HTML ----
  _buildMessagesHTML(messages) {
    // Add collapse banner as first child if visible
    let html = '';
    const collapsedCount = this.queue.collapsedCount;
    if (collapsedCount > 0 && messages.length >= this.options.collapseThreshold) {
      html += `<div class="collapse-banner visible">
        <span>⬆ 展开 ${collapsedCount} 条历史消息</span>
      </div>`;
    }

    // Group consecutive messages from same agent
    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      const prevMsg = messages[i - 1];
      const isGrouped = prevMsg &&
        prevMsg.agentId === msg.agentId &&
        (msg.timestamp - prevMsg.timestamp) < this._groupWindowMs &&
        msg.status !== 'streaming' &&
        prevMsg.status !== 'streaming';

      if (!isGrouped && msg.role !== 'system') {
        html += `<div class="bubble-group">`;
      }

      html += this._buildMessageHTML(msg, i);

      if (!isGrouped && msg.role !== 'system') {
        html += `</div>`;
      }

      i++;
    }

    return html;
  }

  // ---- Flood Bar ----
  _showFloodBar() {
    this._floodBar.classList.add('visible');
    this._scrollHint.classList.remove('visible');
  }

  _hideFloodBar() {
    this._floodBar.classList.remove('visible');
    if (this._atBottom) {
      this.scrollToBottom(true);
    }
  }

  _updateFloodCountdown(n) {
    const countdown = this._floodBar.querySelector('.flood-countdown');
    if (countdown) countdown.textContent = `[${n}s]`;
  }

  // ---- Expand History ----
  _expandHistory() {
    const collapsedCount = this.queue.collapsedCount;
    // Temporarily increase maxVisible to show all
    const original = this.options.maxVisible;
    this.options.maxVisible = this.queue.queue.length;
    this.queue.maxVisible = this.queue.queue.length;
    this.queue._updateVisible();
    this._doRender();
    this.options.maxVisible = original;
    this.queue.maxVisible = original;
    this.queue._updateVisible();
    this.scrollToBottom(true);
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
    this._atBottom = true;
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
    this.queue = new MessageQueue(this.options.maxVisible, this.options.maxHistory);
    this._messageList.innerHTML = '';
    this._streamingElements.clear();
    this.floodProtector.forceExit();
  }

  // ---- Public: Get State ----
  getState() {
    return {
      queueLength: this.queue.queue.length,
      visibleLength: this.queue.visible.length,
      isFloodProtected: this.floodProtector.isProtected,
      collapsedCount: this.queue.collapsedCount
    };
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BubbleRenderer, MessageQueue, FloodProtector, ROLE_CONFIG };
}
