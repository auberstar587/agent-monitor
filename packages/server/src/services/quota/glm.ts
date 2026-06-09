/**
 * 智谱 GLM Coding Plan 套餐余量
 * 端点：GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
 * 鉴权：Authorization: Bearer <ZAI_API_KEY>（读 env）
 */

export interface GlmLimitItem {
  type: "TOKENS_LIMIT" | "TIME_LIMIT" | string;
  unit: number; // 1=d 3=h 5=m 6=d
  number: number;
  percentage: number;
  nextResetTime?: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  usageDetails?: { modelCode: string; usage: number }[];
}

export interface GlmQuotaResponse {
  level?: string;
  limits: GlmLimitItem[];
  fetchedAt: number;
  ok: boolean;
  error?: string;
}

const ENDPOINT = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";

export async function fetchGlmQuota(): Promise<GlmQuotaResponse> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    return {
      limits: [],
      fetchedAt: Date.now(),
      ok: false,
      error: "ZAI_API_KEY 未配置",
    };
  }

  try {
    const res = await fetch(ENDPOINT, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return {
        limits: [],
        fetchedAt: Date.now(),
        ok: false,
        error: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      code: number;
      data?: { limits?: GlmLimitItem[]; level?: string };
      success: boolean;
    };
    if (!body.success || body.code !== 200 || !body.data) {
      return {
        limits: [],
        fetchedAt: Date.now(),
        ok: false,
        error: `上游返回异常: code=${body.code}`,
      };
    }
    return {
      level: body.data.level,
      limits: body.data.limits ?? [],
      fetchedAt: Date.now(),
      ok: true,
    };
  } catch (err) {
    return {
      limits: [],
      fetchedAt: Date.now(),
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
