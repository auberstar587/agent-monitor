import { EventEmitter } from 'events';

/**
 * ChatRoom - 聊天室核心服务
 *
 * 作为 Agent Monitor 的中立消息中心，管理 Agent 接入和消息分发。
 * Agent 通过 HTTP API 主动注册、更新状态、发送消息。
 *
 * 两种接入通道：
 * - Hook 通道: Agent 状态变更时自动推送（上线/离线/忙碌）
 * - Skill 通道: Agent 主动调用发言（开会讨论、汇报工作）
 *
 * 事件:
 * - 'agent:join' — Agent 加入
 * - 'agent:leave' — Agent 离开
 * - 'agent:status' — Agent 状态变更
 * - 'message:new' — 新消息
 */

// Valid agent statuses
const VALID_STATUSES = ['idle', 'working', 'meeting', 'away', 'speaking'];

// Default heartbeat timeout (60s, longer than before since agents push their own status)
const DEFAULT_HEARTBEAT_TIMEOUT = 60000;

// Max messages kept in memory
const MAX_MESSAGES = 200;

// Color palette for dynamic assignment
const COLOR_PALETTE = [
  '#f97316', // orange
  '#3fb950', // green
  '#58a6ff', // blue
  '#f59e0b', // amber
  '#a371f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#ef4444', // red
  '#8b5cf6', // violet
];

// Deterministic color assignment based on agentId
function getAgentColor(agentId) {
  let hash = 0;
  for (const ch of agentId) hash = ((hash << 5) - hash) + ch.charCodeAt(0);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

export class ChatRoom extends EventEmitter {
  constructor(options = {}) {
    super();

    this.heartbeatTimeout = options.heartbeatTimeout || DEFAULT_HEARTBEAT_TIMEOUT;
    this.maxMessages = options.maxMessages || MAX_MESSAGES;

    // Online agents: Map<agentId, AgentInfo>
    this.agents = new Map();

    // Message history
    this.messages = [];

    // Heartbeat check timer
    this._heartbeatTimer = null;
  }

  /**
   * Start the chat room
   */
  start() {
    // Start heartbeat check
    this._heartbeatTimer = setInterval(() => this._checkHeartbeats(), 15000);
    console.log('[ChatRoom] Started');
  }

  /**
   * Stop the chat room
   */
  stop() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    console.log('[ChatRoom] Stopped');
  }

  /**
   * Agent joins the chat room
   * @param {string} agentId
   * @param {object} info - { agentName, role, model, platform, ... }
   * @returns {object} agent info
   */
  join(agentId, info = {}) {
    const now = Date.now();
    const existing = this.agents.get(agentId);

    const agent = {
      agentId,
      agentName: info.agentName || info.name || agentId,
      type: info.type || null,
      role: info.role || 'agent',
      model: info.model || null,
      platform: info.platform || 'unknown',
      color: info.color || getAgentColor(agentId),
      status: info.status || 'idle',
      task: info.task || null,
      todayTasks: info.todayTasks || 0,
      successRate: info.successRate || null,
      joinedAt: existing?.joinedAt || now,
      lastSeen: now,
      metadata: info.metadata || {},
    };

    this.agents.set(agentId, agent);

    const isRejoin = !!existing;
    this.emit('agent:join', { agent, isRejoin });

    console.log(`[ChatRoom] ${agent.agentName}(${agentId}) ${isRejoin ? 're-joined' : 'joined'} [${this.agents.size} online]`);

    return agent;
  }

  /**
   * Agent leaves the chat room
   * @param {string} agentId
   */
  leave(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    this.agents.delete(agentId);
    this.emit('agent:leave', { agent });

    console.log(`[ChatRoom] ${agent.agentName}(${agentId}) left [${this.agents.size} online]`);
  }

  /**
   * Update agent status (hook channel)
   * @param {string} agentId
   * @param {string} status - idle | working | meeting | away | speaking
   * @param {object} extra - { task, metadata, ... }
   * @returns {object|null} updated agent
   */
  updateStatus(agentId, status, extra = {}) {
    if (!VALID_STATUSES.includes(status)) {
      console.warn(`[ChatRoom] Invalid status "${status}" for ${agentId}`);
      return null;
    }

    let agent = this.agents.get(agentId);

    // Auto-join if not registered yet
    if (!agent) {
      agent = this.join(agentId, { status, ...extra });
      return agent;
    }

    const prevStatus = agent.status;
    agent.status = status;
    agent.lastSeen = Date.now();
    if (extra.task !== undefined) agent.task = extra.task;
    if (extra.agentName) agent.agentName = extra.agentName;
    if (extra.type !== undefined) agent.type = extra.type;
    if (extra.model !== undefined) agent.model = extra.model;
    if (extra.todayTasks !== undefined) agent.todayTasks = extra.todayTasks;
    if (extra.successRate !== undefined) agent.successRate = extra.successRate;
    if (extra.metadata) Object.assign(agent.metadata, extra.metadata);

    if (prevStatus !== status) {
      this.emit('agent:status', { agent, prevStatus, status });
      console.log(`[ChatRoom] ${agent.agentName}(${agentId}): ${prevStatus} → ${status}`);
    }

    return agent;
  }

  /**
   * Agent sends a message (skill channel)
   * @param {string} agentId
   * @param {string} content
   * @param {object} opts - { type, context, replyTo, metadata }
   * @returns {object} the message
   */
  sendMessage(agentId, content, opts = {}) {
    const agent = this.agents.get(agentId);

    // Auto-join if not registered
    if (!agent) {
      this.join(agentId, opts);
    }

    const now = Date.now();
    const message = {
      id: opts.id || `msg_${now}_${Math.random().toString(36).slice(2, 7)}`,
      agentId,
      agentName: agent?.agentName || agentId,
      content,
      type: opts.type || 'text',
      context: opts.context || null,
      replyTo: opts.replyTo || null,
      timestamp: now,
      status: 'confirmed',
      metadata: opts.metadata || {},
    };

    this.messages.push(message);

    // Trim to max
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }

    // Update agent last seen
    if (agent) {
      agent.lastSeen = now;
    }

    this.emit('message:new', message);
    console.log(`[ChatRoom] ${message.agentName}: ${content.slice(0, 60)}${content.length > 60 ? '...' : ''}`);

    return message;
  }

  /**
   * Send a system message
   * @param {string} content
   * @param {object} opts
   * @returns {object}
   */
  sendSystemMessage(content, opts = {}) {
    const now = Date.now();
    const message = {
      id: `sys_${now}`,
      agentId: 'system',
      agentName: '系统',
      role: 'system',
      content,
      type: 'system',
      timestamp: now,
      status: 'confirmed',
      ...opts,
    };

    this.messages.push(message);
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }

    this.emit('message:new', message);
    return message;
  }

  /**
   * Get all online agents
   * @returns {object[]}
   */
  getAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get all agents that are NOT away
   * @returns {object[]}
   */
  getOnlineAgents() {
    return Array.from(this.agents.values()).filter((a) => a.status !== 'away');
  }

  /**
   * Get a single agent
   * @param {string} agentId
   * @returns {object|null}
   */
  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get recent messages
   * @param {number} limit
   * @returns {object[]}
   */
  getMessages(limit = 50) {
    return this.messages.slice(-limit);
  }

  /**
   * Get messages by agent
   * @param {string} agentId
   * @param {number} limit
   * @returns {object[]}
   */
  getMessagesByAgent(agentId, limit = 50) {
    return this.messages
      .filter(m => m.agentId === agentId)
      .slice(-limit);
  }

  /**
   * Clear all messages
   */
  clearMessages() {
    this.messages = [];
  }

  /**
   * Check heartbeats — mark agents as away if timed out
   */
  _checkHeartbeats() {
    const now = Date.now();
    for (const [agentId, agent] of this.agents) {
      if (agent.status === 'away') continue;

      const elapsed = now - agent.lastSeen;
      if (elapsed > this.heartbeatTimeout) {
        const prevStatus = agent.status;
        agent.status = 'away';
        this.emit('agent:status', { agent, prevStatus, status: 'away' });
        console.log(`[ChatRoom] ${agent.agentName}(${agentId}): ${prevStatus} → away (timeout ${elapsed}ms)`);
      }
    }
  }

  /**
   * Get stats
   * @returns {object}
   */
  getStats() {
    const byStatus = {};
    for (const [, agent] of this.agents) {
      byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
    }
    return {
      onlineAgents: this.agents.size,
      totalMessages: this.messages.length,
      byStatus,
    };
  }
}

export { VALID_STATUSES, COLOR_PALETTE, getAgentColor };
export default ChatRoom;
