import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  Activity, CheckCircle, XCircle, Clock, Play, Radio,
  Zap, Cpu, Coins, Timer, FileText,
} from "lucide-react";

/* ═══ 类型 ════════════════════════════════════════════════ */
interface TraceRow {
  task_id: string;
  project_id?: string;
  agent_id?: string;
  source?: string;
  status: string;
  title?: string;
  description?: string;
  summary?: string;
  error_message?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_tokens?: number;
  cost_cents?: number;
  model?: string;
  duration_ms?: number;
  retry_count?: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at?: string;
}

/* ═══ 状态映射 ════════════════════════════════════════════ */
const STATUS_CFG: Record<string, { pill: string; label: string; icon: typeof CheckCircle; color: string }> = {
  completed:   { pill: "status-succeeded", label: "已完成", icon: CheckCircle, color: "var(--success)" },
  failed:      { pill: "status-failed",    label: "失败",   icon: XCircle,     color: "var(--danger)" },
  running:     { pill: "status-running",   label: "运行中", icon: Play,        color: "var(--info)" },
  pending:     { pill: "status-queued",    label: "等待中", icon: Clock,       color: "var(--muted)" },
};

function statusOf(s: string) {
  return STATUS_CFG[s] ?? STATUS_CFG.pending;
}

/* ═══ 工具函数 ════════════════════════════════════════════ */
function fmtDuration(ms?: number) {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtTokens(n?: number) {
  if (n == null) return "--";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(cents?: number) {
  if (cents == null) return "--";
  if (cents === 0) return "$0";
  if (cents < 100) return `$0.${String(cents).padStart(2, "0")}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function relTime(iso?: string) {
  if (!iso) return "--";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s 前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m 前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h 前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

/* ═══ 主组件 ══════════════════════════════════════════════ */
export default function TraceList() {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  // 加载项目/Agent 列表（筛选用）
  useEffect(() => {
    api.listProjects().then((list: any[]) => setProjects(list.map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {});
    api.listAgents().then((list: any[]) => setAgents(list.map((a: any) => ({ id: a.id, name: a.name })))).catch(() => {});
  }, []);

  // 加载轨迹
  useEffect(() => {
    setLoading(true);
    const f: Record<string, string> = {};
    if (filterStatus) f.status = filterStatus;
    if (filterProject) f.project_id = filterProject;
    if (filterAgent) f.agent_id = filterAgent;
    api.listTraces(Object.keys(f).length > 0 ? f : undefined)
      .then((list: any[]) => setTraces(list))
      .catch(() => setTraces([]))
      .finally(() => setLoading(false));
  }, [filterStatus, filterProject, filterAgent]);

  // 统计
  const counts = {
    total: traces.length,
    completed: traces.filter((t) => t.status === "completed").length,
    failed: traces.filter((t) => t.status === "failed").length,
    running: traces.filter((t) => t.status === "running").length,
  };

  return (
    <div className="tasks-page">
      {/* ═══ Telemetry bar ═══ */}
      <div className="agents-telemetry">
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><Activity size={11} /> 全部</span>
          <span className="agents-telem-value mono">{String(counts.total).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--success)" }}><CheckCircle size={11} /> 已完成</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>{String(counts.completed).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--danger)" }}><XCircle size={11} /> 失败</span>
          <span className="agents-telem-value mono" style={{ color: "var(--danger)" }}>{String(counts.failed).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--info)" }}><Play size={11} /> 运行中</span>
          <span className="agents-telem-value mono" style={{ color: "var(--info)" }}>{String(counts.running).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-spacer" />
      </div>

      {/* ═══ 筛选栏 ═══ */}
      <div className="projects-actions">
        <span className="projects-actions-meta">
          <span className="projects-actions-dot" />
          执行轨迹 · {traces.length} 条记录
        </span>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="projects-add-input"
          style={{ width: 120, height: 28, fontSize: 11 }}
        >
          <option value="">全部状态</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
          <option value="running">运行中</option>
          <option value="pending">等待中</option>
        </select>
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="projects-add-input"
          style={{ width: 140, height: 28, fontSize: 11 }}
        >
          <option value="">全部项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="projects-add-input"
          style={{ width: 140, height: 28, fontSize: 11 }}
        >
          <option value="">全部 Agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {(filterStatus || filterProject || filterAgent) && (
          <button
            type="button"
            onClick={() => { setFilterStatus(""); setFilterProject(""); setFilterAgent(""); }}
            className="button"
            style={{ fontSize: 11, padding: "0 10px", height: 28 }}
          >
            清除筛选
          </button>
        )}
      </div>

      {/* ═══ 列表 ═══ */}
      {loading ? (
        <div className="dashboard-feed-empty" style={{ minHeight: 200 }}>
          <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>加载中…</span>
        </div>
      ) : traces.length === 0 ? (
        <div className="agents-empty">
          <div className="agents-empty-grid" />
          <div className="agents-empty-body">
            <div className="flex items-center gap-2 mb-3">
              <Radio size={14} style={{ color: "var(--muted)" }} />
              <span className="agents-eyebrow">暂无轨迹</span>
            </div>
            <p className="agents-empty-title">还没有执行轨迹记录</p>
            <p className="agents-empty-sub">通过引擎执行任务后将自动产生轨迹</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {traces.map((trace, idx) => {
            const sc = statusOf(trace.status);
            const SIcon = sc.icon;
            const totalTokens = (trace.input_tokens ?? 0) + (trace.output_tokens ?? 0);
            const proj = projects.find((p) => p.id === trace.project_id);
            const agent = agents.find((a) => a.id === trace.agent_id);
            return (
              <Link
                key={trace.task_id}
                to={`/traces/${trace.task_id}`}
                className="list-row no-underline"
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                {/* 状态 rail */}
                <div style={{
                  width: 3, borderRadius: 2, flexShrink: 0, alignSelf: "stretch",
                  background: sc.color, opacity: 0.6,
                }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {/* 第一行：序号 + 状态 pill + 标题 */}
                  <div className="flex items-center gap-2">
                    <span className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.08em" }}>
                      T{String(idx + 1).padStart(3, "0")}
                    </span>
                    <span className={`status-pill ${sc.pill}`}>
                      <SIcon size={10} /> {sc.label}
                    </span>
                    <span className="text-sm" style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {trace.title || trace.task_id}
                    </span>
                    {trace.model && (
                      <span className="tech-badge mono" style={{ fontSize: 9 }}>{trace.model}</span>
                    )}
                  </div>
                  {/* 第二行：指标摘要 */}
                  <div className="flex items-center gap-4" style={{ fontSize: 11, color: "var(--muted)" }}>
                    {agent && (
                      <span className="flex items-center gap-1">
                        <Cpu size={10} /> {agent.name}
                      </span>
                    )}
                    {proj && (
                      <span className="flex items-center gap-1">
                        <FileText size={10} /> {proj.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Timer size={10} /> {fmtDuration(trace.duration_ms)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap size={10} /> {fmtTokens(totalTokens)} tokens
                    </span>
                    <span className="flex items-center gap-1">
                      <Coins size={10} /> {fmtCost(trace.cost_cents)}
                    </span>
                    <span style={{ marginLeft: "auto" }}>
                      {relTime(trace.created_at)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
