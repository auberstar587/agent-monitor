import { useCallback, useEffect, useState } from "react";
import { useStore } from "../stores";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Bot, Cpu, Radio, Zap, ArrowUpRight, Search, Filter, RefreshCw } from "lucide-react";

// === Utility: relative time without any extra dep ===
function relTime(iso?: string) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// === Status channel: drives left rail + pulse ===
function channelStyle(status: string) {
  switch (status) {
    case "online": return { color: "var(--success)", label: "在线", code: "01" };
    case "busy":   return { color: "var(--info)",    label: "忙碌", code: "02" };
    case "offline":return { color: "var(--muted)",   label: "离线", code: "00" };
    default:       return { color: "var(--muted)",   label: status?.toUpperCase() ?? "未知", code: "??" };
  }
}

export default function Agents() {
  const { agents, fetchAgents } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "busy" | "offline">("all");
  useEffect(() => { fetchAgents(); }, []);

  // 同步按钮：从 adapter 全量回灌到 DB
  const [syncing, setSyncing] = useState(false);
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try { await api.syncAgents(); } catch { /* 静默：sync 失败已在后端吞 */ }
    await fetchAgents();
    setSyncing(false);
  }, []);

  const onlineCount = agents.filter((a: any) => a.status === "online").length;
  const busyCount   = agents.filter((a: any) => a.status === "busy").length;
  const offlineCount= agents.filter((a: any) => a.status === "offline").length;

  const visible = agents.filter((a: any) => {
    const matchQ = !query || a.name?.toLowerCase().includes(query.toLowerCase()) || a.role?.toLowerCase().includes(query.toLowerCase());
    const matchF = filter === "all" || a.status === filter;
    return matchQ && matchF;
  });

  if (agents.length === 0) {
    return (
      <div className="agents-empty">
        <div className="agents-empty-grid" />
        <div className="agents-empty-body">
          <div className="flex items-center gap-2 mb-3">
            <Radio size={14} style={{ color: "var(--muted)" }} />
            <span className="agents-eyebrow">暂无 Agent</span>
          </div>
          <p className="agents-empty-title">未检测到任何 Agent</p>
          <p className="agents-empty-sub">配置适配器以接入 Agent</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agents-page">
      {/* ===== Telemetry bar (fixed count strip) ===== */}
      <div className="agents-telemetry">
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><Cpu size={11} /> 总数</span>
          <span className="agents-telem-value mono">{String(agents.length).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--success)" }}><Zap size={11} /> 在线</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>{String(onlineCount).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--info)" }}><Radio size={11} /> 忙碌</span>
          <span className="agents-telem-value mono" style={{ color: "var(--info)" }}>{String(busyCount).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--muted)" }}>离线</span>
          <span className="agents-telem-value mono" style={{ color: "var(--muted)" }}>{String(offlineCount).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-spacer" />
      </div>

      {/* ===== Filter / Search row ===== */}
      <div className="agents-toolbar">
        <div className="agents-search">
          <Search size={13} style={{ color: "var(--muted)" }} />
          <input
            className="agents-search-input"
            placeholder="搜索 · 名称/角色"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="agents-filters">
          <Filter size={11} style={{ color: "var(--muted)" }} />
          {(["all", "online", "busy", "offline"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`agents-filter-btn ${filter === f ? "active" : ""}`}
            >
              {f === "all" ? "全部" : f === "online" ? "在线" : f === "busy" ? "忙碌" : "离线"}
            </button>
          ))}
        </div>
        <div className="agents-toolbar-spacer" />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="agents-filter-btn agents-filter-btn--icon"
          title="从 adapter 同步最新 agent 列表"
        >
          <RefreshCw
            size={11}
            style={syncing ? { animation: "agents-spin 1s linear infinite" } : undefined}
          />
          {syncing ? "同步中…" : "同步"}
        </button>
      </div>

      {/* ===== Agent grid ===== */}
      <div className="agents-grid">
        {visible.length === 0 ? (
          <div className="agents-empty-row">
            <span className="mono">无匹配 · {query || (filter === "all" ? "全部" : filter === "online" ? "在线" : filter === "busy" ? "忙碌" : "离线")}</span>
          </div>
        ) : (
          visible.map((agent: any, idx: number) => {
            const ch = channelStyle(agent.status);
            return (
              <Link
                key={agent.id}
                to={`/agents/${agent.id}`}
                className="agent-card"
                style={{ ["--ch" as any]: ch.color }}
              >
                {/* Left rail — status channel */}
                <div className="agent-card-rail" />
                <div className="agent-card-body">
                  {/* Meta header */}
                  <div className="agent-card-head">
                    <span className="agent-card-index mono">A{String(idx + 1).padStart(3, "0")}</span>
                    <span className="agent-card-channel mono" style={{ color: ch.color }}>
                      · {ch.code}
                    </span>
                    <span className="agent-card-status mono" style={{ color: ch.color }}>
                      {ch.label}
                    </span>
                    {agent.status === "busy" && <span className="agent-pulse" style={{ background: ch.color }} />}
                  </div>

                  {/* Identity */}
                  <div className="agent-card-id">
                    <div className="agent-avatar">
                      <Bot size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="agent-name">{agent.name}</h3>
                      <p className="agent-role mono">{agent.role}</p>
                    </div>
                    <ArrowUpRight size={14} className="agent-go" />
                  </div>

                  {/* Stats grid */}
                  <div className="agent-stats">
                    <div className="agent-stat">
                      <span className="agent-stat-label">平台</span>
                      <span className="agent-stat-value">{agent.platform || "—"}</span>
                    </div>
                    <div className="agent-stat">
                      <span className="agent-stat-label">最后在线</span>
                      <span className="agent-stat-value mono">{relTime(agent.last_seen_at)}</span>
                    </div>
                  </div>

                  {/* Current task strip */}
                  {agent.current_task_id && (
                    <Link to={`/tasks/${agent.current_task_id}`} className="agent-task no-underline" style={{ textDecoration: "none" }}>
                      <span className="agent-task-label">任务</span>
                      <span className="agent-task-value mono">{agent.current_task_id.length > 12 ? agent.current_task_id.slice(0, 8) + "…" : agent.current_task_id}</span>
                    </Link>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
