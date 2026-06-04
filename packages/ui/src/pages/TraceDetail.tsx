import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Play, Zap, FileText,
  Activity, Coins, Timer, Cpu, ChevronDown, ChevronRight,
  Link2, Wrench, Hash, AlertTriangle, Bot, FolderOpen,
} from "lucide-react";

/* ═══ 类型 ════════════════════════════════════════════════ */
interface ToolCall {
  type?: string;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  error_text?: string;
  seq?: number;
}

interface TraceDetail {
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
  tool_calls?: ToolCall[];
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

function fmtTime(iso?: string) {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("zh-CN");
}

/* 尝试格式化 JSON 字符串 */
function tryPrettyJson(raw?: string) {
  if (!raw) return "--";
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(obj, null, 2);
  } catch {
    return raw;
  }
}

/* ═══ 指标卡片组件 ════════════════════════════════════════ */
function MetricCard({ label, value, icon: Icon }: {
  label: string; value: string; icon: typeof Zap;
}) {
  return (
    <div className="metric-card" style={{ padding: 16 }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} style={{ color: "var(--muted)" }} />
        <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--muted)" }}>
          {label}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

/* ═══ 工具调用展开项 ══════════════════════════════════════ */
function ToolCallItem({ call, index }: { call: ToolCall; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* 头部 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
        style={{ padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", color: "var(--text)" }}
      >
        {open ? <ChevronDown size={14} style={{ color: "var(--muted)" }} /> : <ChevronRight size={14} style={{ color: "var(--muted)" }} />}
        <Wrench size={12} style={{ color: "var(--accent)" }} />
        <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
          #{String(call.seq ?? index + 1).padStart(2, "0")}
        </span>
        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {call.tool_name || "未知工具"}
        </span>
        {call.type && (
          <span className="tech-badge mono" style={{ fontSize: 9 }}>{call.type}</span>
        )}
        {call.error_text && (
          <AlertTriangle size={12} style={{ color: "var(--danger)", marginLeft: 4 }} />
        )}
      </button>

      {/* 展开内容 */}
      {open && (
        <div style={{ padding: "0 14px 14px 14px", borderTop: "1px solid var(--line)" }}>
          {/* Input */}
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              输入
            </div>
            <pre className="mono" style={{
              fontSize: 11, lineHeight: 1.5, color: "var(--text-secondary)",
              background: "var(--paper-strong)", border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)", padding: "8px 10px",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 200, overflowY: "auto", margin: 0,
            }}>
              {tryPrettyJson(call.tool_input)}
            </pre>
          </div>
          {/* Output */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              输出
            </div>
            <pre className="mono" style={{
              fontSize: 11, lineHeight: 1.5,
              color: call.error_text ? "var(--danger)" : "var(--text-secondary)",
              background: "var(--paper-strong)",
              border: `1px solid ${call.error_text ? "var(--danger)" : "var(--line)"}`,
              borderRadius: "var(--radius-sm)", padding: "8px 10px",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 200, overflowY: "auto", margin: 0,
            }}>
              {call.error_text ?? tryPrettyJson(call.tool_output)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ 主组件 ══════════════════════════════════════════════ */
export default function TraceDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    api.getTrace(taskId)
      .then((data: any) => setTrace(data))
      .catch(() => setTrace(null))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    api.listProjects().then((list: any[]) => setProjects(list.map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {});
    api.listAgents().then((list: any[]) => setAgents(list.map((a: any) => ({ id: a.id, name: a.name })))).catch(() => {});
  }, []);

  if (loading) {
    return <div className="p-6 text-sm" style={{ color: "var(--muted)" }}>加载中...</div>;
  }

  if (!trace) {
    return (
      <div className="p-6">
        <Link to="/traces" className="flex items-center gap-1 text-xs mb-4" style={{ color: "var(--muted)" }}>
          <ArrowLeft size={14} /> 返回轨迹列表
        </Link>
        <div className="agents-empty">
          <div className="agents-empty-body">
            <p className="agents-empty-title">轨迹未找到</p>
            <p className="agents-empty-sub">该执行轨迹不存在或已被删除</p>
          </div>
        </div>
      </div>
    );
  }

  const sc = statusOf(trace.status);
  const SIcon = sc.icon;
  const totalTokens = (trace.input_tokens ?? 0) + (trace.output_tokens ?? 0);
  const toolCalls = (trace.tool_calls ?? []).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const proj = projects.find((p) => p.id === trace.project_id);
  const agent = agents.find((a) => a.id === trace.agent_id);

  return (
    <div className="p-6" style={{ maxWidth: 900 }}>
      {/* ═══ 面包屑 ═══ */}
      <div className="flex items-center mb-4">
        <Link to="/traces" className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
          <ArrowLeft size={14} /> 返回轨迹列表
        </Link>
      </div>

      {/* ═══ 标题 + 状态 ═══ */}
      <div className="flex items-start gap-3 mb-6">
        <div className="flex-1">
          <h1 className="page-title">{trace.title || trace.task_id}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`status-pill ${sc.pill}`}>
              <SIcon size={10} /> {sc.label}
            </span>
            {trace.model && (
              <span className="tech-badge mono" style={{ fontSize: 10 }}>{trace.model}</span>
            )}
            {trace.source && (
              <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                via {trace.source}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ═══ 错误信息 ═══ */}
      {trace.error_message && (
        <div className="chat-error mb-6" role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AlertTriangle size={14} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--danger)" }}>错误信息</div>
            <div className="text-xs" style={{ color: "var(--danger)", opacity: 0.85, whiteSpace: "pre-wrap" }}>
              {trace.error_message}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 成本指标卡片 ═══ */}
      <h3 className="section-title mb-3">成本指标</h3>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <MetricCard label="输入 Tokens" value={fmtTokens(trace.input_tokens)} icon={Zap} />
        <MetricCard label="输出 Tokens" value={fmtTokens(trace.output_tokens)} icon={Zap} />
        <MetricCard label="缓存 Tokens" value={fmtTokens(trace.cache_tokens)} icon={Hash} />
        <MetricCard label="总 Tokens" value={fmtTokens(totalTokens)} icon={Activity} />
        <MetricCard label="耗时" value={fmtDuration(trace.duration_ms)} icon={Timer} />
        <MetricCard label="成本" value={fmtCost(trace.cost_cents)} icon={Coins} />
      </div>

      {/* ═══ 基本信息 ═══ */}
      {(trace.description || trace.summary) && (
        <>
          <h3 className="section-title mb-3">基本信息</h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {trace.description && (
              <div className="content-card" style={{ padding: 16 }}>
                <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>
                  描述
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                  {trace.description}
                </p>
              </div>
            )}
            {trace.summary && (
              <div className="content-card" style={{ padding: 16 }}>
                <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>
                  总结
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                  {trace.summary}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ 工具调用时间线 ═══ */}
      {toolCalls.length > 0 && (
        <>
          <h3 className="section-title mb-3">
            工具调用 · {toolCalls.length} 次
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
            {toolCalls.map((call, idx) => (
              <ToolCallItem key={idx} call={call} index={idx} />
            ))}
          </div>
        </>
      )}

      {/* ═══ 关联对象 ═══ */}
      <h3 className="section-title mb-3">关联对象</h3>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {proj && (
          <Link to={`/projects/${proj.id}`} className="content-card no-underline" style={{ padding: 12 }}>
            <div className="flex items-center gap-2">
              <FolderOpen size={14} style={{ color: "var(--accent)" }} />
              <div>
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>项目</div>
                <div className="text-sm" style={{ color: "var(--text)" }}>{proj.name}</div>
              </div>
            </div>
          </Link>
        )}
        {agent && (
          <Link to={`/agents/${agent.id}`} className="content-card no-underline" style={{ padding: 12 }}>
            <div className="flex items-center gap-2">
              <Bot size={14} style={{ color: "var(--accent)" }} />
              <div>
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>Agent</div>
                <div className="text-sm" style={{ color: "var(--text)" }}>{agent.name}</div>
              </div>
            </div>
          </Link>
        )}
        <Link to={`/tasks/${trace.task_id}`} className="content-card no-underline" style={{ padding: 12 }}>
          <div className="flex items-center gap-2">
            <Link2 size={14} style={{ color: "var(--accent)" }} />
            <div>
              <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>任务</div>
              <div className="text-sm mono" style={{ color: "var(--text)" }}>
                {trace.task_id.length > 16 ? trace.task_id.slice(0, 8) + "…" : trace.task_id}
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* ═══ 时间信息 ═══ */}
      <h3 className="section-title mb-3">时间信息</h3>
      <div className="content-card" style={{ padding: 16 }}>
        <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          <div>
            <span style={{ color: "var(--muted)" }}>创建时间：</span>{fmtTime(trace.created_at)}
          </div>
          <div>
            <span style={{ color: "var(--muted)" }}>开始时间：</span>{fmtTime(trace.started_at)}
          </div>
          <div>
            <span style={{ color: "var(--muted)" }}>完成时间：</span>{fmtTime(trace.completed_at)}
          </div>
          <div>
            <span style={{ color: "var(--muted)" }}>更新时间：</span>{fmtTime(trace.updated_at)}
          </div>
          {trace.retry_count != null && trace.retry_count > 0 && (
            <div>
              <span style={{ color: "var(--muted)" }}>重试次数：</span>{trace.retry_count}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
