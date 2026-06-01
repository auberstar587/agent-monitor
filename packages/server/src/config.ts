import path from 'path';
import os from 'os';
import fs from 'fs';

export interface AdapterConfig {
  enabled: boolean;
  api_url?: string;
  ws_url?: string;
  api_key?: string;
}

export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  corsOrigins: string[];
  adapter: string;
  adapters: Record<string, AdapterConfig>;
}

const CONFIG_PATH = path.join(os.homedir(), '.agent-manager', 'config.yaml');

export function loadConfig(): Config {
  const defaults: Config = {
    port: 3002,
    host: "127.0.0.1",
    databaseUrl: process.env.DATABASE_URL ?? "postgresql://localhost:5432/agent_monitor",
    corsOrigins: ["http://localhost:5173", "http://localhost:3000"],
    adapter: "mock",
    adapters: {
      multica: {
        enabled: false,
        api_url: "http://localhost:8080",
        ws_url: "ws://localhost:8080/ws",
        api_key: "",
      },
    },
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      // Simple flat YAML parser
      const parsed = parseFlatYaml(content);

      if (parsed["adapter"]) defaults.adapter = parsed["adapter"];
      if (parsed["server.port"]) defaults.port = parseInt(parsed["server.port"], 10);
      if (parsed["server.host"]) defaults.host = parsed["server.host"];
      if (parsed["database.url"]) defaults.databaseUrl = parsed["database.url"];

      // Multica adapter
      const mc = defaults.adapters.multica;
      if (parsed['adapters.multica.enabled'] != null) mc.enabled = parsed['adapters.multica.enabled'] === 'true';
      if (parsed['adapters.multica.api_url']) mc.api_url = parsed['adapters.multica.api_url'];
      if (parsed['adapters.multica.ws_url']) mc.ws_url = parsed['adapters.multica.ws_url'];
      if (parsed['adapters.multica.api_key']) mc.api_key = parsed['adapters.multica.api_key'];
    }
  } catch {
    // Use defaults
  }

  // Ensure config file exists
  if (!fs.existsSync(CONFIG_PATH)) {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const yaml = generateConfigYaml(defaults);
    fs.writeFileSync(CONFIG_PATH, yaml);
    console.log(`[Config] Created ${CONFIG_PATH}`);
  }

  return defaults;
}

function parseFlatYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  let currentPath: string[] = [];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const depth = Math.floor(indent / 2);

    const [rawKey, ...rawVal] = line.split(':');
    const key = rawKey.trim();
    const val = rawVal.join(':').trim().replace(/^['"](.*)['"]$/, '$1');

    if (!key) continue;

    // Update path based on indent
    currentPath = currentPath.slice(0, depth);
    currentPath.push(key);

    if (val) {
      result[currentPath.join('.')] = val;
    }
  }

  return result;
}

function generateConfigYaml(config: Config): string {
  return `# Agent Monitor v2 Configuration
# Edit and restart to apply changes

# Default adapter: mock | multica | openclaw
adapter: ${config.adapter}

server:
  port: ${config.port}
  host: ${config.host}

database:
  url: ${config.databaseUrl}

adapters:
  multica:
    enabled: ${config.adapters.multica.enabled}
    api_url: ${config.adapters.multica.api_url}
    ws_url: ${config.adapters.multica.ws_url}
    api_key: ${config.adapters.multica.api_key}
`;
}
