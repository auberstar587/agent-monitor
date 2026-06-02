import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import { useStore } from "../stores";
import { Link } from "react-router-dom";
import {
  FolderKanban, Bot, Activity, Inbox, Brain,
  ArrowUpRight, Clock, Timer, Zap, Radio,
  ChevronRight, Database,
} from "lucide-react";

/* ── Relative time ── */
function relTime(iso?: string) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

const DIR_LABEL: Record<string, string> = {
  analysis: "分析", implementation: "实现", decision: "决策", review: "审查", question: "提问",
};

/* ════════════════════════════════════════════════════════
   MAIN — Command Center Cockpit
   ════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { projects, agents, outputs, inbox, fetchProjects, fetchAgents, fetchOutputs, fetchInbox } = useStore();
  const [memoryStats, setMemoryStats] = useState<any>(null);
  const [scheduled, setScheduled] = useState<any[]>([]);

  useEffect(() => {
    fetchProjects();
    fetchAgents();
    fetchOutputs();
    fetchInbox();
    import("../lib/api").then(({ api }) => {
      api.memoryStats().then(setMemoryStats);
      api.listScheduled().then(setScheduled);
    });
  }, []);

  const onlineAgents = agents.filter((a: any) => a.status === "online").length;
  const busyAgents = agents.filter((a: any) => a.status === "busy").length;
  const pendingInbox = inbox.filter((i: any) => i.status === "pending").length;

  return (
    <div className="cockpit">
      {/* ═══ Status overview grid ═══ */}
      <div className="cockpit-grid">
        {/* Projects */}
        <Link to="/projects" className="cockpit-tile no-underline">
          <div className="cockpit-tile-icon" style={{ background: "var(--accent-soft)", border: "1px solid rgba(18,215,255,0.18)" }}>
            <FolderKanban size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div className="cockpit-tile-value">{projects.length}</div>
          <div className="cockpit-tile-label">PROJECTS</div>
          <ChevronRight size={14} className="cockpit-tile-go" />
        </Link>

        {/* Agents */}
        <Link to="/agents" className="cockpit-tile no-underline">
          <div className="cockpit-tile-icon" style={{ background: "var(--success-bg)", border: "1px solid rgba(40,224,111,0.18)" }}>
            <Bot size={18} style={{ color: "var(--success)" }} />
          </div>
          <div className="cockpit-tile-value" style={{ display: "flex", gap: 8 }}>
            <span>{agents.length}</span>
            <span className="cockpit-tile-sub">
              <span style={{ color: "var(--success)" }}>{onlineAgents}</span>
              <span style={{ color: "var(--muted)" }}>/</span>
              <span style={{ color: "var(--info)" }}>{busyAgents}</span>
            </span>
          </div>
          <div className="cockpit-tile-label">AGENTS · ON / BUSY</div>
          <ChevronRight size={14} className="cockpit-tile-go" />
        </Link>

        {/* Outputs */}
        <Link to="/outputs" className="cockpit-tile no-underline">
          <div className="cockpit-tile-icon" style={{ background: "var(--brand-soft)", border: "1px solid rgba(167,139,250,0.18)" }}>
            <Activity size={18} style={{ color: "var(--brand)" }} />
          </div>
          <div className="cockpit-tile-value">{outputs.length}</div>
          <div className="cockpit-tile-label">OUTPUTS</div>
          <ChevronRight size={14} className="cockpit-tile-go" />
        </Link>

        {/* Inbox */}
        <Link to="/inbox" className="cockpit-tile no-underline" style={pendingInbox > 0 ? { borderColor: "rgba(251,113,133,0.3)" } : undefined}>
          <div className="cockpit-tile-icon" style={{
            background: pendingInbox > 0 ? "var(--danger-bg)" : "rgba(110,116,144,0.08)",
            border: pendingInbox > 0 ? "1px solid rgba(251,113,133,0.22)" : "1px solid var(--line)",
          }}>
            <Inbox size={18} style={{ color: pendingInbox > 0 ? "var(--danger)" : "var(--muted)" }} />
          </div>
          <div className="cockpit-tile-value" style={{ color: pendingInbox > 0 ? "var(--danger)" : "var(--text)" }}>
            {pendingInbox}
          </div>
          <div className="cockpit-tile-label">INBOX · PENDING</div>
          {pendingInbox > 0 && <Zap size={12} className="cockpit-tile-go" style={{ color: "var(--danger)" }} />}
          <ChevronRight size={14} className="cockpit-tile-go" />
        </Link>

        {/* Memory */}
        <Link to="/memory" className="cockpit-tile no-underline">
          <div className="cockpit-tile-icon" style={{ background: "var(--brand-soft)", border: "1px solid rgba(167,139,250,0.13)" }}>
            <Brain size={18} style={{ color: "var(--brand)" }} />
          </div>
          <div className="cockpit-tile-value">
            {memoryStats?.active ?? "—"}
          </div>
          <div className="cockpit-tile-label">
            MEMORY · {memoryStats ? `AVG ${memoryStats.avgImportance}/10` : "LOADING"}
          </div>
          <ChevronRight size={14} className="cockpit-tile-go" />
        </Link>
      </div>

      {/* ═══ Two-column: Timeline + Agents ═══ */}
      <div className="cockpit-body">
        {/* ── LEFT: Activity timeline ── */}
        <div className="cockpit-timeline">
          <div className="cockpit-section-head">
            <span className="cockpit-section-label mono">
              <Activity size={11} /> ACTIVITY FEED
            </span>
            <Link to="/outputs" className="cockpit-section-link">
              ALL <ArrowUpRight size={10} />
            </Link>
          </div>

          <div className="cockpit-feed">
            {outputs.length === 0 ? (
              <div className="cockpit-feed-empty">
                <Activity size={20} style={{ color: "var(--muted)" }} />
                <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>NO ACTIVITY · IDLE</span>
              </div>
            ) : (
              outputs.slice(0, 12).map((o: any, idx: number) => (
                <div key={o.id} className="cockpit-feed-item">
                  <div className="cockpit-feed-rail">
                    <div className="cockpit-feed-dot" />
                    {idx < 11 && <div className="cockpit-feed-line" />}
                  </div>
                  <div className="cockpit-feed-content">
                    <div className="cockpit-feed-meta">
                      <span className={`cockpit-feed-source source-${o.source}`}>{o.source}</span>
                      <span className={`type-badge type-${o.direction}`} style={{ fontSize: 9 }}>
                        {DIR_LABEL[o.direction] || o.direction}
                      </span>
                      <span className="cockpit-feed-time mono">
                        {formatRelativeTime(o.created_at)}
                      </span>
                    </div>
                    <p className="cockpit-feed-title">{o.title}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: Agent quick view ── */}
        <div className="cockpit-agents">
          <div className="cockpit-section-head">
            <span className="cockpit-section-label mono">
              <Bot size={11} /> AGENT STATUS
            </span>
            <Link to="/agents" className="cockpit-section-link">
              ALL <ArrowUpRight size={10} />
            </Link>
          </div>

          {agents.length === 0 ? (
            <div className="cockpit-feed-empty">
              <Bot size={20} style={{ color: "var(--muted)" }} />
              <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>NO AGENTS · AWAITING</span>
            </div>
          ) : (
            <div className="cockpit-agent-list">
              {agents.map((agent: any) => {
                const ch = agentStatusStyle(agent.status);
                return (
                  <Link key={agent.id} to={`/agents/${agent.id}`}
                    className="cockpit-agent-row no-underline">
                    <div className="cockpit-agent-dot" style={{ background: ch.color, boxShadow: `0 0 6px ${ch.color}` }} />
                    <div className="cockpit-agent-info">
                      <span className="cockpit-agent-name">{agent.name}</span>
                      <span className="cockpit-agent-meta mono">{agent.platform} · {ch.label}</span>
                    </div>
                    <ChevronRight size={12} style={{ color: "var(--muted)", flexShrink: 0 }} />
                  </Link>
                );
              })}
            </div>
          )}

          {/* Scheduled jobs */}
          {scheduled.length > 0 && (
            <>
              <div className="cockpit-section-head" style={{ marginTop: 16 }}>
                <span className="cockpit-section-label mono">
                  <Timer size={11} /> CRON · {scheduled.length} ACTIVE
                </span>
              </div>
              <div className="cockpit-agent-list">
                {scheduled.map((s: any) => (
                  <div key={s.id} className="cockpit-agent-row">
                    <div className="cockpit-agent-dot" style={{ background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }} />
                    <div className="cockpit-agent-info">
                      <span className="cockpit-agent-name">{s.blueprintName}</span>
                      <span className="cockpit-agent-meta mono">{s.cronExpression}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function agentStatusStyle(status: string) {
  switch (status) {
    case "online": return { color: "var(--success)", label: "ONLINE" };
    case "busy":   return { color: "var(--info)",    label: "BUSY" };
    case "offline":return { color: "var(--muted)",   label: "OFFLINE" };
    default:       return { color: "var(--muted)",   label: status.toUpperCase() };
  }
}
