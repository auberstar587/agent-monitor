// Runtime Service — 同步 EngineAdapter → agent_runtimes 表
// 借鉴 Multica daemon: 每个 CLI engine 对应一行 runtime
//
// 启动时/手动 sync 时遍历已注册引擎，调 detectInstalled()，upsert 到 DB。
// 30s 健康检查：轻量方式更新 last_seen_at（不每次 spawn CLI）。

import { query, queryOne, execute } from "../db/client.js";
import { getRegisteredEngines, getEngine } from "../adapters/registry.js";

export interface AgentRuntime {
  id: string;
  engine_id: string;
  provider?: string;
  status: string;
  version?: string;
  device_name?: string;
  last_seen_at?: string;
  installed: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const HEALTH_CHECK_INTERVAL_MS = 30 * 1000;
let _healthTimer: NodeJS.Timeout | null = null;

/** 遍历 getRegisteredEngines()，detectInstalled 后 upsert agent_runtimes */
export async function syncRuntimes(): Promise<number> {
  const names = getRegisteredEngines();
  let synced = 0;
  for (const engineId of names) {
    const engine = await getEngine(engineId);
    if (!engine) continue;
    let installed = false;
    try {
      installed = await engine.detectInstalled();
    } catch (err) {
      console.warn(`[runtime-service] detectInstalled failed for ${engineId}:`, (err as Error).message);
    }
    const runtimeId = `runtime-${engineId}`;
    const status = installed ? "online" : "offline";
    await upsertRuntime(runtimeId, {
      engine_id: engineId,
      status,
      installed,
      last_seen_at: installed ? new Date().toISOString() : undefined,
    });
    synced++;
  }
  console.log(`[runtime-service] synced ${synced} runtimes`);
  return synced;
}

/** Upsert 一行 agent_runtime */
async function upsertRuntime(
  id: string,
  patch: {
    engine_id: string;
    status: string;
    installed: boolean;
    provider?: string;
    version?: string;
    last_seen_at?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await queryOne(
    `INSERT INTO agent_runtimes (id, engine_id, provider, status, version, last_seen_at, installed, metadata, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET
       status      = EXCLUDED.status,
       installed   = EXCLUDED.installed,
       provider    = COALESCE(EXCLUDED.provider, agent_runtimes.provider),
       version     = COALESCE(EXCLUDED.version, agent_runtimes.version),
       last_seen_at= EXCLUDED.last_seen_at,
       metadata    = agent_runtimes.metadata || EXCLUDED.metadata,
       updated_at  = now()`,
    [
      id,
      patch.engine_id,
      patch.provider ?? null,
      patch.status,
      patch.version ?? null,
      patch.last_seen_at ?? null,
      patch.installed,
      JSON.stringify(patch.metadata ?? {}),
    ],
  );
}

/** 查询引擎当前正在运行的进程数（不查 DB，走适配器内存） */
export async function getActiveRunCount(engineId: string): Promise<number> {
  const engine = await getEngine(engineId);
  if (!engine?.activeRunCount) return 0;
  try {
    return engine.activeRunCount();
  } catch {
    return 0;
  }
}

/** 获取单个 runtime 状态 */
export async function getRuntimeStatus(engineId: string): Promise<AgentRuntime | null> {
  return queryOne<AgentRuntime>(
    "SELECT * FROM agent_runtimes WHERE engine_id = $1",
    [engineId],
  );
}

/** 列出所有 runtimes */
export async function listRuntimes(): Promise<AgentRuntime[]> {
  return query<AgentRuntime>(
    "SELECT * FROM agent_runtimes ORDER BY engine_id",
  );
}

/** 启动 30s 周期健康检查（轻量：仅更新 installed 状态行的 last_seen_at） */
export function startHealthCheck(): void {
  if (_healthTimer) return;
  _healthTimer = setInterval(() => {
    void runHealthCheck().catch((err) =>
      console.warn("[runtime-service] health check error:", (err as Error).message),
    );
  }, HEALTH_CHECK_INTERVAL_MS);
  _healthTimer.unref?.();
}

export function stopHealthCheck(): void {
  if (_healthTimer) {
    clearInterval(_healthTimer);
    _healthTimer = null;
  }
}

async function runHealthCheck(): Promise<void> {
  // 轻量策略：对所有 installed=true 的 runtime，更新 last_seen_at=now()
  // 不在此处重新调 detectInstalled（30s 内 spawn CLI 太重；由手动 sync 触发完整检测）
  await execute(
    "UPDATE agent_runtimes SET last_seen_at = now(), updated_at = now() WHERE installed = true",
  );
}
