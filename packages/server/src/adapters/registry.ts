import type { AgentPlatformAdapter } from './interface.js';

type AdapterFactory = () => Promise<AgentPlatformAdapter>;

const _registry = new Map<string, AdapterFactory>();

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

// Auto-register adapters
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
