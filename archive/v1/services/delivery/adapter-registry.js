/**
 * AdapterRegistry - 投递适配器工厂
 *
 * 根据 Agent 的 platform 字段选择对应的投递适配器。
 * 支持 OpenClaw、Hermes 和自定义适配器注册。
 */

import { OpenClawAdapter } from './adapters/openclaw-adapter.js';
import { HermesAdapter } from './adapters/hermes-adapter.js';

export class AdapterRegistry {
  /**
   * @param {object} config
   * @param {object} [config.openclaw] - OpenClaw 适配器配置
   * @param {object} [config.hermes] - Hermes 适配器配置
   * @param {number} [config.timeout=3000] - 默认投递超时(ms)
   */
  constructor(config = {}) {
    this._adapters = new Map();
    const timeout = config.timeout || 3000;

    // 注册内置适配器
    if (config.openclaw !== false) {
      this._adapters.set(
        'openclaw',
        new OpenClawAdapter({ timeout, ...config.openclaw })
      );
    }

    if (config.hermes !== false) {
      this._adapters.set(
        'hermes',
        new HermesAdapter({ timeout, ...config.hermes })
      );
    }
  }

  /**
   * 获取指定平台的适配器
   * @param {string} platform - 平台标识 (openclaw, hermes, ...)
   * @returns {import('./adapters/base.js').BaseDeliveryAdapter | null}
   */
  getAdapter(platform) {
    if (!platform) return null;
    return this._adapters.get(platform) || null;
  }

  /**
   * 注册自定义适配器
   * @param {string} platform - 平台标识
   * @param {import('./adapters/base.js').BaseDeliveryAdapter} adapter
   */
  registerAdapter(platform, adapter) {
    this._adapters.set(platform, adapter);
  }

  /**
   * 获取所有已注册的平台列表
   * @returns {string[]}
   */
  getRegisteredPlatforms() {
    return Array.from(this._adapters.keys());
  }
}
