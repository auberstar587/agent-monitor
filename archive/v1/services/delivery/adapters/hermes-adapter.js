/**
 * HermesAdapter - 通过 Hermes API Server 投递消息
 *
 * 使用 OpenAI 兼容 API (/v1/chat/completions) 将 Monitor 聊天室消息
 * 路由到 Hermes Agent。
 *
 * Hermes Gateway API:
 *   POST http://localhost:8642/v1/chat/completions
 *   { model: "...", messages: [{ role: "user", content: "..." }] }
 */

import { BaseDeliveryAdapter } from './base.js';

export class HermesAdapter extends BaseDeliveryAdapter {
  /**
   * @param {object} config
   * @param {string} config.apiUrl - Hermes API URL (default: http://localhost:8642)
   * @param {string} [config.model] - 使用的模型名称
   * @param {number} [config.timeout=3000] - 投递超时(ms)
   */
  constructor(config = {}) {
    super(config);
    this.apiUrl = config.apiUrl || 'http://localhost:8642';
    this.model = config.model || 'default';
  }

  /**
   * 通过 Hermes API 投递消息
   * @param {string} agentId - 目标 Agent ID (用作消息标识)
   * @param {object} envelope - 消息信封
   * @returns {Promise<boolean>}
   */
  async deliver(agentId, envelope) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const messageContent = this._buildMessage(envelope);

      const response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: messageContent,
            },
          ],
          // Hermes-specific: route to specific agent
          agent_id: agentId,
          // Don't wait for a response
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(
          `[HermesAdapter] API returned ${response.status} for ${agentId}`
        );
        return false;
      }

      console.log(`[HermesAdapter] Delivered to ${agentId}`);
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`[HermesAdapter] Timeout delivering to ${agentId}`);
      } else {
        console.warn(
          `[HermesAdapter] Failed to deliver to ${agentId}: ${err.message}`
        );
      }
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 构建投递消息文本
   * @param {object} envelope
   * @returns {string}
   */
  _buildMessage(envelope) {
    const lines = [
      `[Agent Monitor 转发消息]`,
      `发件方: ${envelope.sourceAgentName} (${envelope.sourceAgentId})`,
      `时间: ${new Date(envelope.timestamp).toLocaleString('zh-CN')}`,
      ``,
      `---`,
      `${envelope.content}`,
      `---`,
    ];

    if (envelope.context) {
      lines.push(`上下文: ${envelope.context}`);
    }

    return lines.join('\n');
  }
}
