import { useEffect, useState } from "react";
import { useStore } from "../stores";
import { Link } from "react-router-dom";
import { Bot, Cpu, Radio, Zap, Clock, ArrowUpRight, Search, Filter } from "lucide-react";

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
    case "online": return { color: "var(--success)", label: "ONLINE", code: "01" };
    case "busy":   return { color: "var(--info)",    label: "BUSY",   code: "02" };
    case "offline":return { color: "var(--muted)",   label: "OFFLINE",code: "00" };
    default:       return { color: "var(--muted)",   label: status?.toUpperCase() ?? "UNKNOWN", code: "??" };
  }
}

export default function Agents() {
  const { agents, fetchAgents } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "busy" | "offline">("all");
  const [tick, setTick] = useState(0);

  useEffect(() => { fetchAgents(); }, []);

  // 1Hz heartbeat for the scanning line + relative timestamps
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
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
            <span className="agents-eyebrow">NO SIGNAL · CHANNEL IDLE</span>
          </div>
          <p className="agents-empty-title">No agents detected</p>
          <p className="agents-empty-sub">Configure an Adapter to bring agents online.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agents-page">
      {/* ===== Telemetry bar (fixed count strip) ===== */}
      <div className="agents-telemetry">
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><Cpu size={11} /> NODES</span>
          <span className="agents-telem-value mono">{String(agents.length).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--success)" }}><Zap size={11} /> ONLINE</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>{String(onlineCount).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--info)" }}><Radio size={11} /> BUSY</span>
          <span className="agents-telem-value mono" style={{ color: "var(--info)" }}>{String(busyCount).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--muted)" }}>OFFLINE</span>
          <span className="agents-telem-value mono" style={{ color: "var(--muted)" }}>{String(offlineCount).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-spacer" />
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><Clock size={11} /> TICK</span>
          <span className="agents-telem-value mono">{String(tick % 1000).padStart(3, "0")}<span className="agents-telem-unit">s</span></span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label">UPLINK</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>SYNC</span>
        </div>
      </div>

      {/* ===== Filter / Search row ===== */}
      <div className="agents-toolbar">
        <div className="agents-search">
          <Search size={13} style={{ color: "var(--muted)" }} />
          <input
            className="agents-search-input"
            placeholder="QUERY · name / role"
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
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Agent grid ===== */}
      <div className="agents-grid">
        {visible.length === 0 ? (
          <div className="agents-empty-row">
            <span className="mono">NO MATCH · {query || filter.toUpperCase()}</span>
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
                      <span className="agent-stat-label">PLATFORM</span>
                      <span className="agent-stat-value">{agent.platform || "—"}</span>
                    </div>
                    <div className="agent-stat">
                      <span className="agent-stat-label">LAST SEEN</span>
                      <span className="agent-stat-value mono">{relTime(agent.last_seen_at)}</span>
                    </div>
                  </div>

                  {/* Current task strip */}
                  {agent.current_task_id && (
                    <div className="agent-task">
                      <span className="agent-task-label">TASK</span>
                      <span className="agent-task-value mono">{agent.current_task_id}</span>
                    </div>
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
