import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Play, XCircle, CheckCircle, ChevronRight,
  Inbox as InboxIcon, Bot, FileText, Clock, ArrowUpRight,
  FolderKanban, Brain, Activity, Eye,
} from "lucide-react";
import { api } from "../lib/api";

/* ═══ 工具函数 ════════════════════════════════════════════ */

// 相对时间（用于已结束时间）
function relTime(iso?: string) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s 前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m 前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h 前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

// 持续时长（毫秒 → 可读）
function fmtDuration(ms?: number) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

/* ═══ 常量 ═══════════════════════════════════════════════ */

// 注意力队列类型映射
const ATTENTION_TYPE_LABEL: Record<string, string> = {
  decision_required: "决策",
  permission_request: "权限",
  blocked_task: "阻塞",
  review_request: "审查",
  failed_task: "失败",
  handoff_needed: "交接",
};
const ATTENTION_TYPE_COLOR: Record<string, string> = {
  decision_required: "var(--warning)",
  permission_request: "var(--info)",
  blocked_task: "var(--danger)",
  review_request: "var(--accent)",
  failed_task: "var(--danger)",
  handoff_needed: "var(--muted)",
};
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "var(--danger)",
  high: "var(--warning)",
  medium: "var(--accent)",
  low: "var(--muted)",
};

/* ═══ 区块：注意力队列 ══════════════════════════════════════ */

interface AttentionItem {
  kind: "inbox" | "session" | "artifact";
  id: string;
  title: string;
  href: string;
  badge: string;
  badgeColor: string;
  railColor?: string;
  meta?: string;
  time?: string;
}

function AttentionQueue({ items }: { items: AttentionItem[] }) {
  return (
    <div className="content-card" style={{ padding: "16px 18px" }}>
      {/* 区块标题 */}
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={14} style={{ color: "var(--warning)" }} />
        <span className="section-title" style={{ fontSize: 14 }}>待我处理</span>
        <span className="tech-badge mono" style={{
          fontSize: 10,
          color: items.length > 0 ? "var(--warning)" : "var(--muted)",
          borderColor: items.length > 0 ? "var(--warning)" : "var(--line)",
        }}>
          {items.length} 项
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-2" style={{ padding: "20px 0", justifyContent: "center" }}>
          <CheckCircle size={14} style={{ color: "var(--success)" }} />
          <span className="text-xs" style={{ color: "var(--success)" }}>没有需要处理的事项</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it, idx) => (
            <Link
              key={`${it.kind}-${it.id}`}
              to={it.href}
              className="list-row no-underline list-row-anim"
              style={{ minHeight: 48, padding: "10px 14px", animationDelay: `${idx * 30}ms` }}
            >
              {/* 优先级色条（仅 inbox） */}
              {it.railColor ? (
                <div style={{
                  width: 3, borderRadius: 2, flexShrink: 0, alignSelf: "stretch",
                  background: it.railColor, opacity: 0.7,
                }} />
              ) : (
                <div style={{ width: 3, flexShrink: 0 }} />
              )}
              {/* 类型 badge */}
              <span className="tech-badge" style={{
                fontSize: 10,
                color: it.badgeColor,
                borderColor: it.badgeColor,
                background: "transparent",
                flexShrink: 0,
              }}>
                {it.badge}
              </span>
              {/* 标题 */}
              <span className="text-sm" style={{
                color: "var(--text)",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {it.title}
              </span>
              {/* meta */}
              {it.meta && (
                <span className="mono" style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>
                  {it.meta}
                </span>
              )}
              {/* 时间 */}
              {it.time && (
                <span className="mono" style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0, minWidth: 50, textAlign: "right" }}>
                  {it.time}
                </span>
              )}
              <ChevronRight size={12} style={{ color: "var(--muted)", flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ 区块：正在运行 ════════════════════════════════════════ */

function RunningSection({ tasks, agents }: { tasks: any[]; agents: any[] }) {
  return (
    <div className="content-card" style={{ padding: "16px 18px" }}>
      <div className="flex items-center gap-2 mb-3">
        <Play size={14} style={{ color: "var(--info)" }} />
        <span className="section-title" style={{ fontSize: 14 }}>正在运行</span>
        <span className="tech-badge mono" style={{
          fontSize: 10,
          color: tasks.length > 0 ? "var(--info)" : "var(--muted)",
          borderColor: tasks.length > 0 ? "var(--info)" : "var(--line)",
        }}>
          {tasks.length} 项
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="text-xs" style={{
          color: "var(--muted)",
          padding: "20px 0",
          textAlign: "center",
          opacity: 0.7,
        }}>
          当前没有运行中的任务
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tasks.map((t: any, idx: number) => {
            const agent = agents.find((a: any) => a.id === t.agent_id);
            return (
              <Link
                key={t.id}
                to={`/tasks/${t.id}`}
                className="list-row no-underline list-row-anim"
                style={{ minHeight: 48, padding: "10px 14px", animationDelay: `${idx * 30}ms` }}
              >
                <div style={{ width: 3, borderRadius: 2, flexShrink: 0, alignSelf: "stretch", background: "var(--info)", opacity: 0.7 }} />
                <Bot size={13} style={{ color: "var(--info)", flexShrink: 0 }} />
                <span className="text-sm" style={{
                  color: "var(--text)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {t.title || t.id}
                </span>
                {agent && (
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>
                    {agent.name}
                  </span>
                )}
                <span className="flex items-center gap-1 mono" style={{ fontSize: 10, color: "var(--info)", flexShrink: 0 }}>
                  <Clock size={10} />
                  {relTime(t.started_at || t.updated_at || t.created_at)}
                </span>
                <ChevronRight size={12} style={{ color: "var(--muted)", flexShrink: 0 }} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══ 区块：风险与失败 ══════════════════════════════════════ */

function FailedSection({ tasks, traces }: { tasks: any[]; traces: any[] }) {
  return (
    <div className="content-card" style={{ padding: "16px 18px" }}>
      <div className="flex items-center gap-2 mb-3">
        <XCircle size={14} style={{ color: "var(--danger)" }} />
        <span className="section-title" style={{ fontSize: 14 }}>需要关注</span>
        <span className="tech-badge mono" style={{
          fontSize: 10,
          color: tasks.length > 0 ? "var(--danger)" : "var(--muted)",
          borderColor: tasks.length > 0 ? "var(--danger)" : "var(--line)",
        }}>
          {tasks.length} 项
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="flex items-center gap-2" style={{ padding: "20px 0", justifyContent: "center" }}>
          <CheckCircle size={14} style={{ color: "var(--success)" }} />
          <span className="text-xs" style={{ color: "var(--success)" }}>没有失败或阻塞的任务</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tasks.map((t: any, idx: number) => {
            // 优先从 task 自身取 error_message，否则从对应 trace 找
            let errMsg: string = t.error_message || "";
            if (!errMsg) {
              const tr = traces.find((x: any) => x.task_id === t.id);
              errMsg = tr?.error_message || tr?.summary || "";
            }
            const errShort = errMsg ? errMsg.slice(0, 60) + (errMsg.length > 60 ? "…" : "") : "查看轨迹了解详情";
            return (
              <div
                key={t.id}
                className="list-row"
                style={{ minHeight: 48, padding: "10px 14px", animationDelay: `${idx * 30}ms` }}
              >
                <div style={{ width: 3, borderRadius: 2, flexShrink: 0, alignSelf: "stretch", background: "var(--danger)", opacity: 0.7 }} />
                <span className="status-pill status-failed" style={{ fontSize: 10, padding: "0 6px", minHeight: 20 }}>
                  失败
                </span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="text-sm" style={{
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {t.title || t.id}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {errShort}
                  </span>
                </div>
                <Link
                  to={`/traces/${t.id}`}
                  className="flex items-center gap-1 no-underline"
                  style={{ fontSize: 10, color: "var(--accent)", flexShrink: 0 }}
                >
                  查看轨迹 <ArrowUpRight size={10} />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══ 区块：最近完成 ════════════════════════════════════════ */

function RecentSection({ tasks }: { tasks: any[] }) {
  return (
    <div className="content-card" style={{ padding: "16px 18px" }}>
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle size={14} style={{ color: "var(--success)" }} />
        <span className="section-title" style={{ fontSize: 14 }}>最近完成</span>
        <span className="tech-badge mono" style={{ fontSize: 10, color: "var(--muted)", borderColor: "var(--line)" }}>
          {tasks.length} 项
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="text-xs" style={{
          color: "var(--muted)",
          padding: "20px 0",
          textAlign: "center",
          opacity: 0.7,
        }}>
          暂无最近完成的任务
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tasks.map((t: any, idx: number) => (
            <Link
              key={t.id}
              to={`/tasks/${t.id}`}
              className="list-row no-underline list-row-anim"
              style={{ minHeight: 48, padding: "10px 14px", animationDelay: `${idx * 30}ms` }}
            >
              <div style={{ width: 3, borderRadius: 2, flexShrink: 0, alignSelf: "stretch", background: "var(--success)", opacity: 0.7 }} />
              <span className="status-pill status-succeeded" style={{ fontSize: 10, padding: "0 6px", minHeight: 20 }}>
                完成
              </span>
              <span className="text-sm" style={{
                color: "var(--text)",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {t.title || t.id}
              </span>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>
                {fmtDuration(t.duration_ms)}
              </span>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0, minWidth: 50, textAlign: "right" }}>
                {relTime(t.completed_at || t.updated_at || t.created_at)}
              </span>
              <ChevronRight size={12} style={{ color: "var(--muted)", flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ 区块：系统统计（降级显示） ═══════════════════════════ */

function SystemStats({
  projects, agents, outputs, inbox, memory,
}: { projects: number; agents: number; outputs: number; inbox: number; memory?: number }) {
  return (
    <div className="content-card" style={{ padding: "12px 18px", opacity: 0.65 }}>
      <div className="flex items-center gap-3 mb-2">
        <Activity size={11} style={{ color: "var(--muted)" }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em" }}>
          SYSTEM STATS
        </span>
      </div>
      <div className="flex items-center" style={{ gap: 24, fontSize: 11, color: "var(--muted)", flexWrap: "wrap" }}>
        <Link to="/projects" className="flex items-center gap-1 no-underline" style={{ color: "var(--muted)" }}>
          <FolderKanban size={11} /> 项目 <span className="mono" style={{ color: "var(--text-secondary)" }}>{projects}</span>
        </Link>
        <Link to="/agents" className="flex items-center gap-1 no-underline" style={{ color: "var(--muted)" }}>
          <Bot size={11} /> Agent <span className="mono" style={{ color: "var(--text-secondary)" }}>{agents}</span>
        </Link>
        <Link to="/outputs" className="flex items-center gap-1 no-underline" style={{ color: "var(--muted)" }}>
          <FileText size={11} /> 输出 <span className="mono" style={{ color: "var(--text-secondary)" }}>{outputs}</span>
        </Link>
        <Link to="/inbox" className="flex items-center gap-1 no-underline" style={{ color: "var(--muted)" }}>
          <InboxIcon size={11} /> Inbox <span className="mono" style={{ color: "var(--text-secondary)" }}>{inbox}</span>
        </Link>
        <Link to="/memory" className="flex items-center gap-1 no-underline" style={{ color: "var(--muted)" }}>
          <Brain size={11} /> 记忆 <span className="mono" style={{ color: "var(--text-secondary)" }}>{memory ?? "—"}</span>
        </Link>
      </div>
    </div>
  );
}

/* ═══ 主组件 ══════════════════════════════════════════════ */

export default function Dashboard() {
  // 数据状态
  const [pendingInbox, setPendingInbox] = useState<any[]>([]);
  const [waitingSessions, setWaitingSessions] = useState<any[]>([]);
  const [submittedArtifacts, setSubmittedArtifacts] = useState<any[]>([]);
  const [runningTasks, setRunningTasks] = useState<any[]>([]);
  const [failedTasks, setFailedTasks] = useState<any[]>([]);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [traces, setTraces] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [outputs, setOutputs] = useState<any[]>([]);
  const [memoryStats, setMemoryStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 并行加载所有数据
  useEffect(() => {
    Promise.all([
      api.listInbox("pending").catch(() => []),
      api.listAgentSessions({ status: "waiting_user", limit: 5 }).catch(() => []),
      api.listArtifacts({ status: "submitted", limit: 5 }).catch(() => []),
      api.listTasks({ status: "in_progress", limit: "5" }).catch(() => []),
      api.listTasks({ status: "failed", limit: "5" }).catch(() => []),
      api.listTasks({ limit: "5" }).catch(() => []),
      api.listTraces({ limit: 10 }).catch(() => []),
      api.listProjects().catch(() => []),
      api.listAgents().catch(() => []),
      api.listOutputs().catch(() => []),
      api.memoryStats().catch(() => null),
    ])
      .then(([inbox, sessions, artifacts, running, failed, recent, trs, projs, ags, outs, mem]) => {
        setPendingInbox(inbox);
        setWaitingSessions(sessions);
        setSubmittedArtifacts(artifacts);
        setRunningTasks(running);
        setFailedTasks(failed);
        setRecentTasks(recent);
        setTraces(trs);
        setProjects(projs);
        setAgents(ags);
        setOutputs(outs);
        setMemoryStats(mem);
      })
      .finally(() => setLoading(false));
  }, []);

  // 注意力队列：合并三类事项
  const attentionItems: AttentionItem[] = [];

  // inbox pending
  for (const item of pendingInbox.slice(0, 8)) {
    const badge = ATTENTION_TYPE_LABEL[item.type] || item.type || "Inbox";
    const badgeColor = ATTENTION_TYPE_COLOR[item.type] || "var(--muted)";
    const railColor = PRIORITY_COLOR[item.priority] || "var(--muted)";
    const title = item.title || item.description || `Inbox ${item.id?.slice?.(0, 8)}`;
    attentionItems.push({
      kind: "inbox",
      id: item.id,
      title,
      href: "/inbox",
      badge,
      badgeColor,
      railColor,
      time: relTime(item.created_at),
    });
  }

  // waiting_user sessions
  for (const s of waitingSessions.slice(0, 5)) {
    const agent = agents.find((a: any) => a.id === s.agent_id);
    const agentName = agent?.name || s.agent_name || "Agent";
    const title = s.title || s.summary || `会话 ${s.id?.slice?.(0, 8)}`;
    attentionItems.push({
      kind: "session",
      id: s.id,
      title: `${agentName} · ${title}`,
      href: "/agents",
      badge: "等待",
      badgeColor: "var(--warning)",
      time: relTime(s.updated_at || s.created_at),
    });
  }

  // submitted artifacts
  for (const a of submittedArtifacts.slice(0, 5)) {
    attentionItems.push({
      kind: "artifact",
      id: a.id,
      title: a.title || a.name || `产物 ${a.id?.slice?.(0, 8)}`,
      href: `/artifacts/${a.id}`,
      badge: "待审查",
      badgeColor: "var(--accent)",
      time: relTime(a.updated_at || a.created_at),
    });
  }

  // 按时间倒序（最新在前），但 inbox 优先排在最前
  // 这里简单按创建时间倒序即可
  attentionItems.sort((a, b) => (b.time || "").localeCompare(a.time || ""));

  // 截取最多 10 项避免太长
  const attentionLimited = attentionItems.slice(0, 10);

  // 最近完成：过滤掉 failed，只保留 completed
  const completedRecent = recentTasks.filter((t: any) => t.status === "completed").slice(0, 5);

  return (
    <div className="cockpit dashboard-scroll" style={{ gap: 16, display: "flex", flexDirection: "column" }}>
      {/* 区块标题 */}
      <div className="flex items-center justify-between">
        <h1 className="page-title" style={{ fontSize: 20 }}>处理中心</h1>
        <span className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em" }}>
          {loading ? "LOADING…" : `${attentionLimited.length} 待办 · ${runningTasks.length} 运行中 · ${failedTasks.length} 失败`}
        </span>
      </div>

      {/* 1. 注意力队列（最高优先级） */}
      <AttentionQueue items={attentionLimited} />

      {/* 2. 正在运行 */}
      <RunningSection tasks={runningTasks} agents={agents} />

      {/* 3. 风险与失败 */}
      <FailedSection tasks={failedTasks} traces={traces} />

      {/* 4. 最近完成 */}
      <RecentSection tasks={completedRecent} />

      {/* 5. 系统统计（降级到底部） */}
      <SystemStats
        projects={projects.length}
        agents={agents.length}
        outputs={outputs.length}
        inbox={pendingInbox.length}
        memory={memoryStats?.active}
      />
    </div>
  );
}
