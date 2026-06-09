import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertCircle, Clock, Zap, Database, Sparkles } from "lucide-react";
import { api } from "../lib/api";

const REFRESH_MS = 10 * 60 * 1000;

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
  start_time: number;
  end_time: number;
  weekly_end_time: number;
  remains_time: number;
  weekly_remains_time: number;
}

const UNIT_LABEL: Record<number, string> = {
  1: "天",
  3: "小时",
  5: "月",
  6: "日",
};

function formatReset(ts?: number) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", { hour12: false });
}

function formatRemain(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "已重置";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}天${h % 24}时`;
  if (h > 0) return `${h}时${m}分`;
  return `${m}分`;
}

function pctColor(pct: number) {
  if (pct >= 90) return "var(--danger, #ef4444)";
  if (pct >= 70) return "var(--warning, #f59e0b)";
  return "var(--success)";
}

function pctBar(pct: number) {
  return { width: `${Math.max(0, Math.min(100, pct))}%` };
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

  return (
    <div className="p-0 max-w-6xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="page-subtitle">智谱 GLM Coding Plan 与 Minimax 套餐实时余量</p>
        </div>
        <div className="flex items-center gap-3">
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

      {error && (
        <div className="quota-error">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="quota-grid">
        {/* GLM */}
        <section className="quota-panel">
          <header className="quota-panel-head">
            <div className="quota-icon"><Zap size={17} /></div>
            <div>
              <h2>智谱 GLM <small>Coding Plan</small></h2>
              <p>套餐等级：{data?.glm?.level ?? "—"} · {data?.glm?.ok ? "在线" : "异常"}</p>
            </div>
          </header>

          {!data?.glm?.ok && data?.glm?.error && (
            <div className="quota-error-inner">
              <AlertCircle size={12} /> {data.glm.error}
            </div>
          )}

          {data?.glm?.ok && data.glm.limits.length === 0 && (
            <div className="quota-empty">该账号暂无可显示的限额</div>
          )}

          <ul className="quota-list">
            {(data?.glm?.limits ?? []).map((l: GlmLimit, i: number) => {
              const reset = formatReset(l.nextResetTime);
              const isTime = l.type === "TIME_LIMIT";
              return (
                <li key={i} className="quota-row">
                  <div className="quota-row-head">
                    <span className="quota-tag">
                      {isTime ? <Database size={11} /> : <Zap size={11} />}
                      {isTime ? "调用次数" : "Token 额度"}
                    </span>
                    <span className="quota-period">每 {l.number} {UNIT_LABEL[l.unit] ?? `unit=${l.unit}`}</span>
                    <span className="quota-reset">下次重置 {reset}</span>
                  </div>
                  <div className="quota-bar-track">
                    <div
                      className="quota-bar-fill"
                      style={{ ...pctBar(l.percentage), background: pctColor(l.percentage) }}
                    />
                  </div>
                  <div className="quota-row-foot">
                    <span>已用 <strong>{l.percentage}%</strong></span>
                    {isTime && l.remaining != null && (
                      <span>剩余 <strong>{l.remaining}</strong> / {l.usage}</span>
                    )}
                    {!isTime && l.currentValue != null && (
                      <span>当前 <strong>{l.currentValue}</strong></span>
                    )}
                  </div>
                  {l.usageDetails && l.usageDetails.length > 0 && (
                    <div className="quota-details">
                      {l.usageDetails.map((d) => (
                        <span key={d.modelCode} className="quota-chip">{d.modelCode} ×{d.usage}</span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Minimax */}
        <section className="quota-panel">
          <header className="quota-panel-head">
            <div className="quota-icon"><Sparkles size={17} /></div>
            <div>
              <h2>Minimax <small>mmx CLI</small></h2>
              <p>本地 mmx 探测 · {data?.minimax?.ok ? "在线" : "异常"}</p>
            </div>
          </header>

          {!data?.minimax?.ok && data?.minimax?.error && (
            <div className="quota-error-inner">
              <AlertCircle size={12} /> {data.minimax.error}
            </div>
          )}

          {data?.minimax?.ok && data.minimax.models.length === 0 && (
            <div className="quota-empty">暂无模型余量数据</div>
          )}

          <ul className="quota-list">
            {(data?.minimax?.models ?? []).map((m: MinimaxModel) => {
              const intervalPct = 100 - (m.current_interval_remaining_percent ?? 0);
              const weeklyPct = 100 - (m.current_weekly_remaining_percent ?? 0);
              return (
                <li key={m.model_name} className="quota-row">
                  <div className="quota-row-head">
                    <span className="quota-tag"><Sparkles size={11} />{m.model_name}</span>
                    <span className="quota-period">区间 {m.current_interval_usage_count}/{m.current_interval_total_count}</span>
                    <span className="quota-reset">剩余 {formatRemain(m.remains_time * 1000)}</span>
                  </div>
                  <div className="quota-bar-track">
                    <div
                      className="quota-bar-fill"
                      style={{ ...pctBar(intervalPct), background: pctColor(intervalPct) }}
                    />
                  </div>
                  <div className="quota-row-foot">
                    <span>区间已用 <strong>{intervalPct}%</strong></span>
                    <span>周剩余 <strong>{m.current_weekly_remaining_percent}%</strong></span>
                    <span>周限 {m.current_weekly_usage_count}/{m.current_weekly_total_count}</span>
                  </div>
                  <div className="quota-bar-track quota-bar-track-mini">
                    <div
                      className="quota-bar-fill"
                      style={{ ...pctBar(weeklyPct), background: pctColor(weeklyPct) }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
