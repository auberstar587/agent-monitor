/**
 * BaseDeliveryAdapter - 投递适配器抽象基类
 *
 * 所有平台适配器必须继承此类并实现 deliver() 方法。
 * 设计原则：fire-and-forget，绝不 throw，所有错误仅 log。
 */

export class BaseDeliveryAdapter {
  /**
   * @param {object} config
   * @param {number} [config.timeout=3000] - 投递超时(ms)
   */
  constructor(config = {}) {
    this.config = config;
    this.timeout = config.timeout || 3000;
  }

  /**
   * 投递消息到目标 Agent
   * @param {string} agentId - 目标 Agent ID
   * @param {object} envelope - 消息信封 { sourceAgentId, sourceAgentName, content, timestamp }
   * @returns {Promise<boolean>} 是否投递成功
   */
  async deliver(agentId, envelope) {
    throw new Error('deliver() must be implemented by subclass');
  }

  /**
   * 带超时的 Promise 包装 (fire-and-forget 保证)
   * @param {Promise} promise
   * @param {number} [ms] - 超时毫秒，默认使用 this.timeout
   * @returns {Promise}
   */
  _withTimeout(promise, ms) {
    const timeout = ms || this.timeout;
    const controller = new AbortController();

    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Delivery timeout after ${timeout}ms`));
      }, timeout);
      // Keep timer ref for cleanup
      timeoutPromise._timer = timer;
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutPromise._timer);
    });
  }

  /**
   * 格式化投递信封
   * @param {object} message - 原始消息对象
   * @param {object} sourceAgent - 发送者 Agent 信息
   * @returns {object} 投递信封
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
}
