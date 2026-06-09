/**
 * /api/quota — 合并 GLM + Minimax 余量
 * 10 分钟 TTL 缓存；force=true 跳过缓存
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import { TtlCache } from "../services/quota-cache.js";
import { fetchGlmQuota, GlmQuotaResponse } from "../services/quota/glm.js";
import { fetchMinimaxQuota, MinimaxQuotaResponse } from "../services/quota/minimax.js";

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CombinedQuota {
  glm: GlmQuotaResponse;
  minimax: MinimaxQuotaResponse;
  fetchedAt: number;
  ageMs: number;
}

const cache = new TtlCache<CombinedQuota>(CACHE_TTL_MS);

async function loadCombined(): Promise<CombinedQuota> {
  const [glm, minimax] = await Promise.all([fetchGlmQuota(), fetchMinimaxQuota()]);
  return {
    glm,
    minimax,
    fetchedAt: Date.now(),
    ageMs: 0,
  };
}

export async function quotaRoutes(fastify: FastifyInstance) {
  fastify.get("/api/quota", async (request: FastifyRequest) => {
    const force = (request.query as { force?: string })?.force === "true";
    let entry: CombinedQuota | null = force ? null : cache.get();
    if (!entry) {
      entry = await loadCombined();
      cache.set(entry);
    }
    return { ...entry, ageMs: Date.now() - entry.fetchedAt };
  });
}
