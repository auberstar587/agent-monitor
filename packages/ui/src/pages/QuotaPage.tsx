import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertCircle, Clock, Zap, Sparkles, Infinity as InfinityIcon } from "lucide-react";
import { api } from "../lib/api";
import QuotaSnapshot from "../components/QuotaSnapshot";

const REFRESH_MS = 10 * 60 * 1000;

const UNIT_LABEL: Record<number, string> = {
  1: "天",
  3: "小时",
  5: "月",
  6: "日",
};

function periodUnit(l: { unit: number; number: number }): string {
  // GLM 返回 unit=6(number=1) 表示"每1日"，但实际重置周期是7天=每周
  if (l.unit === 6 && l.number === 1) return "周";
  const label = UNIT_LABEL[l.unit] ?? `unit=${l.unit}`;
  // number > 1 时带上数字（如 "5小时"、"3天"）
  return l.number > 1 ? `${l.number}${label}` : label;
}

function relMin(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "已重置";
  const m = Math.floor(ms / 60_000);
  if (m >= 1440) {
    const d = Math.floor(m / 1440);
    const rm = m % 1440;
    return `${d}天${Math.floor(rm / 60)}小时${rm % 60}分`;
  }
  if (m >= 60) return `${Math.floor(m / 60)}小时${m % 60}分`;
  return `${m}分钟`;
}

function modelLabel(name: string): string {
  if (name === "general") return "通用";
  return name;
}

function formatReset(ts?: number) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function pctClass(pct: number) {
  if (pct >= 90) return "danger" as const;
  if (pct >= 70) return "warn" as const;
  return "" as const;
}

interface GlmLimit {
  type: string;
  unit: number;
  number: number;
  percentage: number;
  nextResetTime?: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  usageDetails?: { modelCode: string; usage: number }[];
}

interface MinimaxModel {
  model_name: string;
  current_interval_remaining_percent: number;
  current_weekly_remaining_percent: number;
  current_interval_usage_count: number;
  current_interval_total_count: number;
  current_weekly_usage_count: number;
  current_weekly_total_count: number;
  remains_time: number;
  weekly_remains_time: number;
}

export default function QuotaPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<number | null>(null);

  const fetchQuota = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getQuota(force);
      setData(res);
      setLastFetch(Date.now());
    } catch (e: any) {
      setError(e?.message ?? "获取余量失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuota();
    const id = setInterval(() => fetchQuota(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchQuota]);

  const ageSec = lastFetch ? Math.floor((Date.now() - lastFetch) / 1000) : null;
  const nextAuto = useMemo(() => (lastFetch ? new Date(lastFetch + REFRESH_MS) : null), [lastFetch]);

  const glmOk = data?.glm?.ok;
  const mmxOk = data?.minimax?.ok;
  const glmOnline = glmOk ? "ok" : "danger";
  const mmxOnline = mmxOk ? "ok" : "danger";

  return (
    <div className="p-0 max-w-6xl" style={{ ["--glm-blue" as any]: "#2F6BFF", ["--mmx-purple" as any]: "#8B5CF6", ["--mmx-green" as any]: "#4CB782" }}>

      {error && (
        <div className="quota-error">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* === Region 1: 智谱 GLM（智谱风：3 卡并排 + 蓝条） === */}
      <section className="quota-page-region" style={{ marginBottom: "var(--space-6)" }}>
        <div className="quota-page-region-head">
          <div className="quota-page-region-mark glm">智</div>
          <div>
            <span className="quota-page-region-name">智谱 GLM</span>
            <span className="quota-page-region-meta">
              Coding Plan · Level {data?.glm?.level ?? "—"}
            </span>
          </div>
          <div className="quota-page-region-status">
            <span className={`quota-page-region-dot ${glmOnline === "danger" ? "danger" : ""}`} />
            {glmOk ? "在线" : "异常"}
            {data?.glm?.error && (
              <span style={{ color: "var(--danger)" }}>· {data.glm.error}</span>
            )}
          </div>
          <div className="quota-page-region-actions">
            {ageSec != null && (
              <span className="quota-meta" title={nextAuto?.toLocaleString("zh-CN")}>
                <Clock size={12} /> {ageSec}s 前 · 下次 {nextAuto?.toLocaleTimeString("zh-CN", { hour12: false })}
              </span>
            )}
            <button
              className="button"
              disabled={loading}
              onClick={() => fetchQuota(true)}
              title="强制刷新（绕过 10 分钟缓存）"
            >
              <RefreshCw size={13} className={loading ? "quota-spin" : ""} />
              {loading ? "刷新中" : "立即刷新"}
            </button>
          </div>
        </div>

        <div className="quota-page-card-row cols-3">
          {(data?.glm?.limits ?? []).map((l: GlmLimit, i: number) => {
            const cls = pctClass(l.percentage);
            return (
              <div key={i} className="quota-mcard quota-mcard-glm">
                <div className="quota-mcard-title">
                  {l.type === "TIME_LIMIT" ? "调用次数" : `Token 额度 · ${periodUnit(l)}`}
                  <span className="info">ⓘ</span>
                </div>
                <div className={`quota-mcard-pct ${cls} mono`}>
                  {l.percentage}<small>%</small>
                </div>
                <div className="quota-mcard-used">已使用</div>
                <div className="quota-mcard-bar">
                  <div className="quota-mcard-bar-fill glm" style={{ width: `${Math.min(100, l.percentage)}%` }} />
                </div>
                <div className="quota-mcard-foot">
                  <strong>每{periodUnit(l)}</strong>
                </div>
                <div className="quota-mcard-foot">
                  重置时间：<strong>{formatReset(l.nextResetTime)}</strong>
                </div>
                {l.usageDetails && l.usageDetails.length > 0 && (
                  <div className="quota-mcard-chips">
                    {l.usageDetails.map((d) => (
                      <span key={d.modelCode} className="quota-mcard-chip">{d.modelCode} ×{d.usage}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {data?.glm?.ok && data.glm.limits.length === 0 && (
            <div className="quota-empty">该账号暂无可显示的限额</div>
          )}
        </div>
      </section>

      {/* === Region 2: Minimax（Minimax 风：横向左标 / 中条 / 右数字） === */}
      <section className="quota-page-region" style={{ marginBottom: "var(--space-6)" }}>
        <div className="quota-page-region-head">
          <div className="quota-page-region-mark mmx">M</div>
          <div>
            <span className="quota-page-region-name">Minimax</span>
            <span className="quota-page-region-meta">mmx CLI · 本地探测</span>
          </div>
          <div className="quota-page-region-status">
            <span className={`quota-page-region-dot ${mmxOnline === "danger" ? "danger" : ""}`} />
            {mmxOk ? "在线" : "异常"}
            {data?.minimax?.error && (
              <span style={{ color: "var(--danger)" }}>· {data.minimax.error}</span>
            )}
          </div>
        </div>

        <div className="quota-page-card-row" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div className="quota-mmx-scroll">
          {(data?.minimax?.models ?? []).filter((m: MinimaxModel) => m.model_name === 'general').flatMap((m: MinimaxModel) => {
            const intervalPct = 100 - (m.current_interval_remaining_percent ?? 100);
            const weeklyPct = 100 - (m.current_weekly_remaining_percent ?? 100);
            const weeklyUnlimited = m.current_weekly_total_count === 0 && m.current_weekly_usage_count === 0;
            const rows = [
              <div key={`${m.model_name}-intv`} className="quota-mmx-row">
                <div className="quota-mmx-row-main">
                  <div className="quota-mmx-row-label">
                    <span className="quota-mmx-row-name">{modelLabel(m.model_name)} · 5h</span>
                    {m.current_interval_total_count > 0 && (
                      <span className="quota-mmx-row-count mono">{m.current_interval_usage_count}/{m.current_interval_total_count}</span>
                    )}
                  </div>
                  <div className="quota-mcard-bar" style={{ flex: 1, minWidth: 80 }}>
                    <div className={`quota-mcard-bar-fill ${intervalPct >= 90 ? "mmx-danger" : intervalPct >= 70 ? "mmx-warn" : "mmx-green"}`} style={{ width: `${Math.min(100, intervalPct)}%` }} />
                  </div>
                  <span className={`quota-mmx-row-pct mono ${intervalPct >= 90 ? "danger" : intervalPct >= 70 ? "warn" : ""}`}>{intervalPct}%</span>
                </div>
                <div className="quota-mmx-row-reset-line">{relMin(m.remains_time)}后重置</div>
              </div>,
              <div key={`${m.model_name}-wk`} className="quota-mmx-row">
                <div className="quota-mmx-row-main">
                  <div className="quota-mmx-row-label">
                    <span className="quota-mmx-row-name">{modelLabel(m.model_name)} · 周</span>
                    {m.current_weekly_total_count > 0 && (
                      <span className="quota-mmx-row-count mono">{m.current_weekly_usage_count}/{m.current_weekly_total_count}</span>
                    )}
                  </div>
                  <div className="quota-mcard-bar" style={{ flex: 1, minWidth: 80, background: 'rgba(139, 92, 246, 0.78)' }}>
                    <div className="quota-mcard-bar-fill mmx-purple" style={{ width: `${Math.min(100, weeklyPct)}%` }} />
                  </div>
                  {weeklyUnlimited ? (
                    <span className="quota-mmx-unlimit"><InfinityIcon size={14} /> 无限</span>
                  ) : (
                    <span className="quota-mmx-row-pct mono">{weeklyPct}%</span>
                  )}
                </div>
                <div className="quota-mmx-row-reset-line">{relMin(m.weekly_remains_time)}后重置</div>
              </div>,
            ];
            return rows;
          })}
          </div>
          {data?.minimax?.ok && data.minimax.models.length === 0 && (
            <div className="quota-empty">暂无模型余量数据</div>
          )}
        </div>
      </section>

      {/* === 底部：Dashboard 风格速览卡 === */}
      <div style={{ marginTop: "var(--space-3)" }}>
        <QuotaSnapshot />
      </div>
    </div>
  );
}
