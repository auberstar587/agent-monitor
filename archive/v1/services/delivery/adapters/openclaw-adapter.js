/**
 * OpenClawAdapter - 通过 OpenClaw Gateway RPC 投递消息
 *
 * 使用 sessions_send API（timeoutSeconds: 0 = fire-and-forget）
 * 将 Monitor 聊天室消息路由到其他 OpenClaw Agent。
 *
 * Gateway RPC 协议:
 *   POST http://localhost:18789/rpc
 *   { method: 'sessions.send', params: { sessionKey, message, timeoutSeconds: 0 } }
 *   Header: openclaw-auth-token: <token>
 */

import { BaseDeliveryAdapter } from './base.js';

export class OpenClawAdapter extends BaseDeliveryAdapter {
  /**
   * @param {object} config
   * @param {string} config.gatewayUrl - Gateway URL (default: http://localhost:18789)
   * @param {string} [config.gatewayToken] - Gateway 认证 token
   * @param {number} [config.timeout=3000] - 投递超时(ms)
   */
  constructor(config = {}) {
    super(config);
    this.gatewayUrl = config.gatewayUrl || 'http://localhost:18789';
    this.gatewayToken = config.gatewayToken || '';
  }

  /**
   * 通过 Gateway sessions_send 投递消息
   * @param {string} agentId - 目标 Agent ID
   * @param {object} envelope - 消息信封
   * @returns {Promise<boolean>}
   */
  async deliver(agentId, envelope) {
    const sessionKey = `agent:${agentId}:main`;
    const messageText = this._buildMessage(envelope);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.gatewayToken) {
        headers['openclaw-auth-token'] = this.gatewayToken;
      }

      const response = await fetch(`${this.gatewayUrl}/rpc`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          method: 'sessions.send',
          params: {
            sessionKey,
            message: messageText,
            timeoutSeconds: 0, // fire-and-forget
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(
          `[OpenClawAdapter] Gateway returned ${response.status} for ${agentId}`
        );
        return false;
      }

      const data = await response.json();
      console.log(
        `[OpenClawAdapter] Delivered to ${agentId} (sessionKey: ${sessionKey}): ${data.status || 'ok'}`
      );
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`[OpenClawAdapter] Timeout delivering to ${agentId}`);
      } else {
        console.warn(
          `[OpenClawAdapter] Failed to deliver to ${agentId}: ${err.message}`
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
