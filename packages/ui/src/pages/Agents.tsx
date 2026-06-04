import { useCallback, useEffect, useState } from "react";
import { useStore } from "../stores";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  Bot, Cpu, Radio, Zap, ArrowUpRight, Search, Filter, RefreshCw,
  CheckCircle, XCircle, Clock, Play, Pause, StopCircle, MessageSquare,
  FolderOpen, AlertTriangle, Activity, Send,
} from "lucide-react";

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

/* ═══ Agent Session 监督子组件 ═════════════════════════════ */
const SESSION_STATUS_CFG: Record<string, { pill: string; color: string; label: string; icon: typeof Play }> = {
  running:      { pill: "status-running",   color: "var(--info)",    label: "运行中", icon: Play },
  waiting_user: { pill: "status-queued",    color: "var(--warning)", label: "待用户", icon: AlertTriangle },
  completed:    { pill: "status-succeeded", color: "var(--success)", label: "已完成", icon: CheckCircle },
  failed:       { pill: "status-failed",    color: "var(--danger)",  label: "失败",   icon: XCircle },
  idle:         { pill: "status-queued",    color: "var(--muted)",   label: "空闲",   icon: Clock },
};

function AgentSessionsTab() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.listProjects().then((list: any[]) => setProjects(list.map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {});
    api.listAgents().then((list: any[]) => setAgents(list.map((a: any) => ({ id: a.id, name: a.name })))).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const f: Record<string, string> = {};
    if (filterStatus) f.status = filterStatus;
    api.listAgentSessions(Object.keys(f).length > 0 ? f : undefined)
      .then((list: any[]) => setSessions(list))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: "pause" | "stop") => {
    setActing(id + action);
    try {
      if (action === "pause") await api.pauseAgentSession(id);
      else await api.stopAgentSession(id);
      await load();
    } catch { /* 静默 */ }
    setActing(null);
  };

  const counts = {
    total: sessions.length,
    running: sessions.filter((s) => s.status === "running").length,
    waiting: sessions.filter((s) => s.status === "waiting_user").length,
    completed: sessions.filter((s) => s.status === "completed").length,
    failed: sessions.filter((s) => s.status === "failed").length,
  };

  const selected = selectedId ? sessions.find((s) => s.id === selectedId) ?? null : null;
  const selAgent = selected ? agents.find((a) => a.id === selected.agent_id) : null;
  const selProj = selected ? projects.find((p) => p.id === selected.project_id) : null;

  return (
    <div className="tasks-page">
      {/* ═══ Telemetry bar ═══ */}
      <div className="agents-telemetry">
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><Activity size={11} /> 全部</span>
          <span className="agents-telem-value mono">{String(counts.total).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--info)" }}><Play size={11} /> 运行中</span>
          <span className="agents-telem-value mono" style={{ color: "var(--info)" }}>{String(counts.running).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--warning)" }}><AlertTriangle size={11} /> 待用户</span>
          <span className="agents-telem-value mono" style={{ color: "var(--warning)" }}>{String(counts.waiting).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--success)" }}><CheckCircle size={11} /> 已完成</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>{String(counts.completed).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--danger)" }}><XCircle size={11} /> 失败</span>
          <span className="agents-telem-value mono" style={{ color: "var(--danger)" }}>{String(counts.failed).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-spacer" />
      </div>

      {/* ═══ 筛选栏 ═══ */}
      <div className="projects-actions">
        <span className="projects-actions-meta">
          <span className="projects-actions-dot" />
          会话监督 · {sessions.length} 条会话
        </span>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="projects-add-input" style={{ width: 120, height: 28, fontSize: 11 }}>
          <option value="">全部状态</option>
          <option value="running">运行中</option>
          <option value="waiting_user">待用户</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
          <option value="idle">空闲</option>
        </select>
        {filterStatus && (
          <button type="button"
            onClick={() => setFilterStatus("")}
            className="button" style={{ fontSize: 11, padding: "0 10px", height: 28 }}>
            清除筛选
          </button>
        )}
      </div>

      {/* ═══ 主体分栏 ═══ */}
      {loading ? (
        <div className="dashboard-feed-empty" style={{ minHeight: 200 }}>
          <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>加载中…</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="agents-empty">
          <div className="agents-empty-grid" />
          <div className="agents-empty-body">
            <div className="flex items-center gap-2 mb-3">
              <Radio size={14} style={{ color: "var(--muted)" }} />
              <span className="agents-eyebrow">暂无会话</span>
            </div>
            <p className="agents-empty-title">还没有 Agent 会话</p>
            <p className="agents-empty-sub">Agent 开始执行任务后将产生会话记录</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, minHeight: 400 }}>
          {/* ─── 左列：会话列表 (40%) ─── */}
          <div style={{ width: "40%", flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {sessions.map((s, idx) => {
              const sc = SESSION_STATUS_CFG[s.status] ?? SESSION_STATUS_CFG.idle;
              const Icon = sc.icon;
              const isSelected = selectedId === s.id;
              const isWaiting = s.status === "waiting_user";
              const agent = agents.find((a) => a.id === s.agent_id);
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  style={{
                    display: "flex", alignItems: "stretch", gap: 0,
                    border: `1px solid ${isSelected ? "var(--accent-line)" : isWaiting ? "var(--warning)" : "var(--line)"}`,
                    borderRadius: "var(--radius-lg)",
                    background: isSelected ? "var(--accent-soft)" : "var(--bg-card)",
                    cursor: "pointer", transition: "all 160ms var(--ease)",
                    overflow: "hidden", animationDelay: `${idx * 30}ms`,
                  }}
                >
                  {/* 状态色条 */}
                  <div style={{ width: 3, flexShrink: 0, background: sc.color, opacity: 0.7 }} />
                  <div style={{ flex: 1, padding: "10px 14px", minWidth: 0 }}>
                    {/* 第一行：状态 pill + Agent */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`status-pill ${sc.pill}`}>
                        <Icon size={10} /> {sc.label}
                      </span>
                      <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                        {agent?.name ?? s.agent_id ?? "—"}
                      </span>
                    </div>
                    {/* 第二行：项目/任务/最后输出摘要 */}
                    <div className="flex items-center gap-2" style={{ fontSize: 10, color: "var(--muted)" }}>
                      {s.project_id && <span><FolderOpen size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {projects.find((p) => p.id === s.project_id)?.name ?? s.project_id}</span>}
                      {s.task_id && <span>· 任务 {s.task_id.length > 8 ? s.task_id.slice(0, 8) + "…" : s.task_id}</span>}
                      <span style={{ marginLeft: "auto" }}>{relTime(s.updated_at ?? s.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── 右列：会话详情 (60%) ─── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!selected ? (
              <div className="content-card" style={{
                padding: "48px 24px", textAlign: "center",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", minHeight: 300,
              }}>
                <MessageSquare size={28} style={{ color: "var(--muted)", opacity: 0.4, marginBottom: 12 }} />
                <span className="text-xs" style={{ color: "var(--muted)" }}>选择左侧会话查看详情</span>
              </div>
            ) : (
              (() => {
                const sc = SESSION_STATUS_CFG[selected.status] ?? SESSION_STATUS_CFG.idle;
                const Icon = sc.icon;
                return (
                  <div className="content-card" style={{ padding: "20px 24px" }}>
                    {/* 详情头部 */}
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="page-title" style={{ fontSize: 16, margin: 0 }}>
                        {selAgent?.name ?? selected.agent_id ?? "会话"}
                      </h2>
                      <span className={`status-pill ${sc.pill}`}>
                        <Icon size={10} /> {sc.label}
                      </span>
                    </div>

                    {/* 关联对象 */}
                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                        关联
                      </div>
                      <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 12 }}>
                        {selProj && (
                          <Link to={`/projects/${selProj.id}`} className="flex items-center gap-1"
                            style={{ color: "var(--accent)", textDecoration: "none" }}>
                            <FolderOpen size={12} /> {selProj.name}
                          </Link>
                        )}
                        {selAgent && (
                          <Link to={`/agents/${selAgent.id}`} className="flex items-center gap-1"
                            style={{ color: "var(--accent)", textDecoration: "none" }}>
                            <Bot size={12} /> {selAgent.name}
                          </Link>
                        )}
                        {selected.task_id && (
                          <Link to={`/tasks/${selected.task_id}`} className="flex items-center gap-1"
                            style={{ color: "var(--accent)", textDecoration: "none" }}>
                            任务 {selected.task_id.slice(0, 8)}
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* 最后输出 */}
                    {(selected.last_output || selected.output) && (
                      <div className="mb-4">
                        <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                          最后输出
                        </div>
                        <div style={{
                          background: "var(--paper-strong)", border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm)", padding: "10px 14px",
                          fontSize: 12, color: "var(--text-secondary)",
                          whiteSpace: "pre-wrap", maxHeight: 240, overflowY: "auto",
                          lineHeight: 1.6,
                        }}>
                          {selected.last_output ?? selected.output}
                        </div>
                      </div>
                    )}

                    {/* 持续时间 */}
                    <div className="mb-4" style={{ fontSize: 11, color: "var(--muted)" }}>
                      <span>开始: {new Date(selected.created_at).toLocaleString("zh-CN")}</span>
                      {selected.updated_at && <span style={{ marginLeft: 16 }}>更新: {new Date(selected.updated_at).toLocaleString("zh-CN")}</span>}
                    </div>

                    {/* 操作按钮区 */}
                    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 8 }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 回复：running / waiting_user 都可触发 */}
                        {(selected.status === "running" || selected.status === "waiting_user") && (
                          <button type="button" className="button" disabled
                            title="后端回复接口开发中"
                            style={{ fontSize: 12, borderColor: "var(--info)", color: "var(--info)", opacity: 0.5, cursor: "not-allowed" }}>
                            <Send size={13} /> 回复
                          </button>
                        )}
                        {/* 暂停：仅 running */}
                        {selected.status === "running" && (
                          <button type="button" className="button"
                            disabled={acting === selected.id + "pause"}
                            onClick={() => handleAction(selected.id, "pause")}
                            style={{ fontSize: 12, borderColor: "var(--warning)", color: "var(--warning)" }}>
                            <Pause size={13} /> {acting === selected.id + "pause" ? "暂停中…" : "暂停"}
                          </button>
                        )}
                        {/* 停止：仅 running */}
                        {selected.status === "running" && (
                          <button type="button" className="button"
                            disabled={acting === selected.id + "stop"}
                            onClick={() => handleAction(selected.id, "stop")}
                            style={{ fontSize: 12, borderColor: "var(--danger)", color: "var(--danger)" }}>
                            <StopCircle size={13} /> {acting === selected.id + "stop" ? "停止中…" : "停止"}
                          </button>
                        )}
                        {selected.status !== "running" && (
                          <span className="text-xs" style={{ color: "var(--muted)" }}>
                            当前状态无可用操作
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ Agents Tab 主体（保留原行为） ═════════════════════════ */
export default function Agents() {
  const [tab, setTab] = useState<"agents" | "sessions">("agents");

  return (
    <div className="agents-page">
      {/* ═══ Tab 切换栏 ═══ */}
      <div className="agents-toolbar">
        <div className="agents-filters">
          <Filter size={11} style={{ color: "var(--muted)" }} />
          <button onClick={() => setTab("agents")}
            className={`agents-filter-btn ${tab === "agents" ? "active" : ""}`}>
            <Bot size={11} /> Agents
          </button>
          <button onClick={() => setTab("sessions")}
            className={`agents-filter-btn ${tab === "sessions" ? "active" : ""}`}>
            <Radio size={11} /> Sessions
          </button>
        </div>
        <div className="agents-toolbar-spacer" />
      </div>

      {/* ═══ Tab 内容 ═══ */}
      {tab === "agents" ? <AgentsTabContent /> : <AgentSessionsTab />}
    </div>
  );
}

/* ═══ 原 Agents 列表内容（拆分） ════════════════════════════ */
function AgentsTabContent() {
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
    <>
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
    </>
  );
}
