/**
 * 套餐余量速览（Dashboard 顶部 + QuotaPage 复用）
 * 展示智谱 GLM 与 Minimax 的关键余量
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertCircle, ArrowUpRight, Zap, Sparkles } from "lucide-react";
import { api } from "../lib/api";

interface QuotaData {
  glm: {
    ok: boolean;
    error?: string;
    level?: string;
    limits: { type: string; unit: number; number: number; percentage: number; nextResetTime?: number; remaining?: number; usage?: number }[];
    fetchedAt: number;
  };
  minimax: {
    ok: boolean;
    error?: string;
    models: { model_name: string; current_interval_remaining_percent: number; current_weekly_remaining_percent: number; remains_time: number; weekly_remains_time: number }[];
    fetchedAt: number;
  };
  fetchedAt: number;
}

const REFRESH_MS = 10 * 60 * 1000;

function relMin(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "已重置";
  const m = Math.floor(ms / 60_000);
  if (m >= 60) return `${Math.floor(m / 60)}h${m % 60}m`;
  return `${m}m`;
}

function formatReset(ts?: number) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function pctColor(pct: number) {
  if (pct >= 90) return "var(--danger)";
  if (pct >= 70) return "var(--warning)";
  return "var(--success)";
}

export default function QuotaSnapshot({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<QuotaData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await api.getQuota();
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "获取余量失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) {
    return (
      <div className="content-card" style={{ padding: "16px 18px" }}>
        <div className="flex items-center gap-2">
          <Activity size={14} className="quota-snap-spin" style={{ color: "var(--muted)" }} />
          <span className="text-xs" style={{ color: "var(--muted)" }}>加载余量…</span>
        </div>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="content-card quota-snap-error" style={{ padding: "14px 18px" }}>
        <div className="flex items-center gap-2">
          <AlertCircle size={14} style={{ color: "var(--danger)" }} />
          <span className="text-xs" style={{ color: "var(--danger)" }}>{err}</span>
        </div>
      </div>
    );
  }

  const glm5h = data?.glm?.limits?.find((l) => l.unit === 3);
  const glmOk = data?.glm?.ok;
  const mmxOk = data?.minimax?.ok;
  const glmPct = glm5h?.percentage ?? 0;
  const mmx5h = data?.minimax?.models?.[0];
  const mmx5hUsed = mmx5h ? 100 - (mmx5h.current_interval_remaining_percent ?? 100) : 0;
  const mmxWeekUsed = data?.minimax?.models?.[0] ? 100 - (data.minimax.models[0].current_weekly_remaining_percent ?? 100) : 0;
  const onlineCount = (glmOk ? 1 : 0) + (mmxOk ? 1 : 0);
  const ageS = data ? Math.floor((Date.now() - data.fetchedAt) / 1000) : null;

  return (
    <div className="content-card quota-snapshot" style={{ padding: compact ? "12px 16px" : "14px 18px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: "var(--accent)" }} />
          <span className="section-title" style={{ fontSize: 14 }}>套餐余量</span>
          <span className="tech-badge mono" style={{
            fontSize: 12,
            color: onlineCount === 2 ? "var(--success)" : "var(--warning)",
            borderColor: onlineCount === 2 ? "var(--success)" : "var(--warning)",
          }}>
            {onlineCount}/2 源在线
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
            {ageS != null ? `${ageS}s 前 · 10min 自动` : "—"}
          </span>
          <Link
            to="/quota"
            className="quota-snap-link"
            style={{ fontSize: 11, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 2 }}
          >
            详情 <ArrowUpRight size={11} />
          </Link>
        </div>
      </div>

      <div className="quota-snap-grid">
        {/* GLM */}
        <div className="quota-snap-cell">
          <div className="quota-snap-cell-head">
            <span className="quota-snap-source glm"><Zap size={10} /> 智谱 GLM</span>
            <span className="mono quota-snap-pct" style={{ color: pctColor(glmPct) }}>{glmPct}%</span>
          </div>
          <div className="quota-snap-bar">
            <div className="quota-snap-bar-fill glm" style={{ width: `${Math.min(100, glmPct)}%` }} />
          </div>
          <div className="quota-snap-meta mono">
            {glm5h ? `5h 限额 · 重置 ${formatReset(glm5h.nextResetTime)}` : (data?.glm?.error ? `异常：${data.glm.error}` : "暂无数据")}
          </div>
        </div>

        {/* Minimax 5h */}
        <div className="quota-snap-cell">
          <div className="quota-snap-cell-head">
            <span className="quota-snap-source mmx-5h"><Sparkles size={10} /> Minimax · 5h</span>
            <span className="mono quota-snap-pct" style={{ color: pctColor(mmx5hUsed) }}>{mmx5hUsed}%</span>
          </div>
          <div className="quota-snap-bar">
            <div className="quota-snap-bar-fill mmx-5h" style={{ width: `${Math.min(100, mmx5hUsed)}%` }} />
          </div>
          <div className="quota-snap-meta mono">
            {mmx5h ? `剩 ${relMin(mmx5h.remains_time * 1000)} 后重置` : (data?.minimax?.error ? `异常：${data.minimax.error}` : "暂无数据")}
          </div>
        </div>

        {/* Minimax 周 */}
        <div className="quota-snap-cell">
          <div className="quota-snap-cell-head">
            <span className="quota-snap-source mmx-week"><Sparkles size={10} /> Minimax · 周</span>
            <span className="mono quota-snap-pct" style={{ color: pctColor(mmxWeekUsed) }}>{mmxWeekUsed}%</span>
          </div>
          <div className="quota-snap-bar">
            <div className="quota-snap-bar-fill mmx-week" style={{ width: `${Math.min(100, mmxWeekUsed)}%` }} />
          </div>
          <div className="quota-snap-meta mono">
            {data?.minimax?.models?.[0] ? `剩 ${relMin(data.minimax.models[0].weekly_remains_time * 1000)} 后重置` : "暂无数据"}
          </div>
        </div>
      </div>
    </div>
  );
}
