import { EventEmitter } from 'events';

/**
 * MessageRouter - 消息路由核心
 *
 * 监听 ChatRoom 的 message:new 事件，根据路由模式将消息转发到目标 Agent。
 * 支持 meeting（会议转发）、mention（@提及）、broadcast（广播）三种模式。
 *
 * 设计原则：
 * - fire-and-forget：绝不阻塞消息来源的响应
 * - 防环：跳过 forwarded 标记的消息，防止无限循环
 * - 容错：所有投递错误 catch 并 log，不影响其他投递
 *
 * 事件:
 * - 'routed' — 消息成功路由 { message, targets, results }
 * - 'delivery:success' — 单次投递成功 { agentId, platform }
 * - 'delivery:failed' — 单次投递失败 { agentId, platform, error }
 */

const ROUTING_MODES = ['meeting', 'mention', 'broadcast'];

export class MessageRouter extends EventEmitter {
  /**
   * @param {object} options
   * @param {import('./chat-room.js').ChatRoom} options.chatRoom - ChatRoom 实例
   * @param {import('../meeting-state.js').MeetingStateMachine} [options.meetingSM] - 会议状态机
   * @param {import('./delivery/adapter-registry.js').AdapterRegistry} options.registry - 适配器工厂
   * @param {string} [options.mode='meeting'] - 路由模式: meeting | mention | broadcast
   */
  constructor(options = {}) {
    super();
    this.chatRoom = options.chatRoom;
    this.meetingSM = options.meetingSM || null;
    this.registry = options.registry;
    this.mode = ROUTING_MODES.includes(options.mode) ? options.mode : 'meeting';

    // 统计
    this._stats = {
      routed: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
    };

    // 绑定事件处理器
    this._onMessage = this._onMessage.bind(this);
  }

  /**
   * 启动路由器
   */
  start() {
    if (!this.chatRoom) {
      console.warn('[MessageRouter] No ChatRoom, router not started');
      return;
    }

    this.chatRoom.on('message:new', this._onMessage);
    console.log(`[MessageRouter] Started (mode: ${this.mode})`);
  }

  /**
   * 停止路由器
   */
  stop() {
    if (this.chatRoom) {
      this.chatRoom.off('message:new', this._onMessage);
    }
    console.log('[MessageRouter] Stopped');
  }

  /**
   * 消息事件处理器
   * @param {object} message
   */
  _onMessage(message) {
    // 跳过系统消息
    if (message.agentId === 'system' || message.type === 'system') {
      return;
    }

    // 跳过已转发的消息（防环）
    if (message.metadata?.forwarded) {
      return;
    }

    // 解析目标
    const targets = this._resolveTargets(message);
    if (targets.length === 0) {
      this._stats.skipped++;
      return;
    }

    // 格式化信封
    const sourceAgent = this.chatRoom.getAgent(message.agentId);
    const envelope = this._formatEnvelope(message, sourceAgent);

    // 投递（并行，不等待）
    this._stats.routed++;
    const results = [];

    for (const targetId of targets) {
      // 异步投递，不 await（fire-and-forget）
      this._deliver(targetId, envelope, sourceAgent)
        .then((success) => {
          if (success) {
            this._stats.delivered++;
          } else {
            this._stats.failed++;
          }
          results.push({ agentId: targetId, success });

          // 所有投递完成后触发事件
          if (results.length === targets.length) {
            this.emit('routed', { message, targets, results });
          }
        })
        .catch(() => {
          // 绝对不会到这里（_deliver 内部 catch），但以防万一
          this._stats.failed++;
        });
    }
  }

  /**
   * 解析目标 Agent 列表
   * @param {object} message
   * @returns {string[]} 目标 Agent ID 列表
   */
  _resolveTargets(message) {
    switch (this.mode) {
      case 'meeting':
        return this._resolveMeetingTargets(message);
      case 'mention':
        return this._resolveMentionTargets(message);
      case 'broadcast':
        return this._resolveBroadcastTargets(message);
      default:
        return [];
    }
  }

  /**
   * 会议模式：转发给所有参会者（除发送者）
   * 如果没有显式参与者（直接 meeting:start 跳过了 invite 流程），
   * 则使用 ChatRoom 的在线 Agent 作为参会者。
   */
  _resolveMeetingTargets(message) {
    if (!this.meetingSM || !this.meetingSM.isInMeeting()) {
      return [];
    }

    const participants = this.meetingSM.getParticipantIds();

    // If explicit participants exist, use them
    if (participants.length > 0) {
      return participants.filter((id) => id !== message.agentId);
    }

    // Fallback: all online agents are considered meeting participants
    const onlineAgents = this.chatRoom.getOnlineAgents();
    return onlineAgents
      .filter((a) => a.agentId !== message.agentId)
      .map((a) => a.agentId);
  }

  /**
   * 提及模式：解析 @agentId
   */
  _resolveMentionTargets(message) {
    const mentionRegex = /@(\w[\w-]*)/g;
    const mentions = [];
    let match;

    while ((match = mentionRegex.exec(message.content)) !== null) {
      const mentionedId = match[1];
      // 确认被提及的 Agent 存在且在线
      const agent = this.chatRoom.getAgent(mentionedId);
      if (agent && agent.agentId !== message.agentId) {
        mentions.push(mentionedId);
      }
    }

    return [...new Set(mentions)]; // 去重
  }

  /**
   * 广播模式：转发给所有在线 Agent（除发送者）
   */
  _resolveBroadcastTargets(message) {
    const agents = this.chatRoom.getOnlineAgents();
    return agents
      .filter((a) => a.agentId !== message.agentId)
      .map((a) => a.agentId);
  }

  /**
   * 投递消息到单个目标
   * @param {string} targetId
   * @param {object} envelope
   * @param {object} sourceAgent
   * @returns {Promise<boolean>}
   */
  async _deliver(targetId, envelope, sourceAgent) {
    try {
      const agent = this.chatRoom.getAgent(targetId);
      if (!agent) {
        console.warn(`[MessageRouter] Target ${targetId} not found`);
        return false;
      }

      // 跳过 away 状态的 Agent
      if (agent.status === 'away') {
        return false;
      }

      const adapter = this.registry.getAdapter(agent.platform);
      if (!adapter) {
        console.warn(
          `[MessageRouter] No adapter for platform: ${agent.platform} (${targetId})`
        );
        return false;
      }

      const success = await adapter.deliver(targetId, envelope);

      if (success) {
        this.emit('delivery:success', { agentId: targetId, platform: agent.platform });
      } else {
        this.emit('delivery:failed', { agentId: targetId, platform: agent.platform, error: 'adapter returned false' });
      }

      return success;
    } catch (err) {
      console.warn(`[MessageRouter] Delivery error for ${targetId}: ${err.message}`);
      this.emit('delivery:failed', { agentId: targetId, platform: 'unknown', error: err.message });
      return false;
    }
  }

  /**
   * 格式化投递信封
   * @param {object} message
   * @param {object} sourceAgent
   * @returns {object}
   */
  _formatEnvelope(message, sourceAgent) {
    return {
      sourceAgentId: message.agentId,
      sourceAgentName: message.agentName || sourceAgent?.agentName || message.agentId,
      content: message.content,
      type: message.type || 'text',
      context: message.context || null,
      timestamp: message.timestamp || Date.now(),
    };
  }

  /**
   * 获取路由统计
   * @returns {object}
   */
  getStats() {
    return { ...this._stats, mode: this.mode };
  }
}
