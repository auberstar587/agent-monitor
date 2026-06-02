import type { AgentPlatformAdapter } from './interface.js';

type AdapterFactory = () => Promise<AgentPlatformAdapter>;

const _registry = new Map<string, AdapterFactory>();
const _engineRegistry = new Map<string, () => Promise<import('./engine.js').EngineAdapter>>();

export function registerAdapter(name: string, factory: AdapterFactory): void {
  _registry.set(name, factory);
}

export function getRegisteredAdapters(): string[] {
  return Array.from(_registry.keys());
}

export async function getAdapter(name: string): Promise<AgentPlatformAdapter | null> {
  const factory = _registry.get(name);
  if (!factory) return null;
  return factory();
}

// --- Engine adapters (Phase 6) ---

export function registerEngine(name: string, factory: () => Promise<import('./engine.js').EngineAdapter>): void {
  _engineRegistry.set(name, factory);
}

export function getRegisteredEngines(): string[] {
  return Array.from(_engineRegistry.keys());
}

export async function getEngine(name: string): Promise<import('./engine.js').EngineAdapter | null> {
  const factory = _engineRegistry.get(name);
  if (!factory) return null;
  try {
    return await factory();
  } catch {
    // factory 抛错（如 multica 未配置）→ 返回 null 让调用方走 fallback
    return null;
  }
}

// --- Auto-register platform adapters ---

import { createMockAdapter } from './mock/index.js';
registerAdapter('mock', async () => createMockAdapter());

import { createManualAdapter } from './manual/index.js';
registerAdapter('manual', async () => createManualAdapter());

import { createMulticaAdapter } from './multica/index.js';
registerAdapter('multica', async () => {
  const { loadConfig } = await import('../config.js');
  const config = loadConfig();
  const mc = config.adapters?.multica;
  if (!mc?.enabled || !mc?.api_key) {
    throw new Error('Multica adapter not configured. Set adapters.multica in config.yaml with api_key.');
  }
  return createMulticaAdapter({
    apiUrl: mc.api_url || 'http://localhost:8080',
    wsUrl: mc.ws_url || 'ws://localhost:8080/ws',
    token: mc.api_key,
  });
});

// --- Auto-register engine adapters (Phase 6) ---

import { createClaudeCodeAdapter } from './claude-code.js';
registerEngine('claude-code', async () => createClaudeCodeAdapter());

import { createMulticaEngineAdapter } from './multica/engine.js';
registerEngine('multica', async () => {
  const { loadConfig } = await import('../config.js');
  const config = loadConfig();
  const mc = config.adapters?.multica;
  if (!mc?.enabled || !mc?.api_key) {
    throw new Error('Multica engine adapter not configured.');
  }
  return createMulticaEngineAdapter({
    apiUrl: mc.api_url || 'http://localhost:8080',
    wsUrl: mc.ws_url || 'ws://localhost:8080/ws',
    token: mc.api_key,
  });
});
