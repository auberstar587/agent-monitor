import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import CustomSelect from "../components/CustomSelect";
import {
  ArrowLeft,
  FolderKanban,
  Edit3,
  Check,
  X,
  GitBranch,
  FileOutput,
  Cpu,
  Clock,
  Hash,
  Target,
  MapPin,
  Layers,
  Plus,
  Trash2,
  // cockpit 新增图标
  Activity,
  AlertTriangle,
  Play,
  CheckCircle,
  XCircle,
  Timer,
  Zap,
  Coins,
  Inbox as InboxIcon,
  Radio,
  Eye,
  ChevronDown,
  ChevronRight,
  MessageSquare,
} from "lucide-react";

/* ── Relative time helper ── */
function relTime(iso?: string) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/* ── 状态颜色映射 ── */
function statusStyle(status: string) {
  switch (status) {
    case "active":
      return { color: "var(--success)", label: "ACTIVE", code: "01" };
    case "paused":
      return { color: "var(--warning)", label: "PAUSED", code: "02" };
    case "archived":
      return { color: "var(--muted)", label: "ARCHIVED", code: "00" };
    default:
      return {
        color: "var(--muted)",
        label: (status ?? "UNKNOWN").toUpperCase(),
        code: "??",
      };
  }
}

/* ── Direction label map ── */
const DIR_LABEL: Record<string, string> = {
  analysis: "分析",
  implementation: "实现",
  decision: "决策",
  review: "审查",
  question: "提问",
};
const PROJECT_STATUS_OPTIONS = [
  { value: "active", label: "ACTIVE" },
  { value: "paused", label: "PAUSED" },
  { value: "archived", label: "ARCHIVED" },
];
const RELATION_TYPE_OPTIONS = ["dependency", "reference", "blocks", "related"]
  .map((type) => ({ value: type, label: type }));

/* ── Trace 状态映射 ── */
const TRACE_STATUS: Record<string, { pill: string; label: string; icon: typeof CheckCircle; color: string }> = {
  completed:   { pill: "status-succeeded", label: "已完成", icon: CheckCircle, color: "var(--success)" },
  failed:      { pill: "status-failed",    label: "失败",   icon: XCircle,     color: "var(--danger)" },
  running:     { pill: "status-running",   label: "运行中", icon: Play,        color: "var(--info)" },
  pending:     { pill: "status-queued",    label: "等待中", icon: Clock,       color: "var(--muted)" },
};

/* ── Session 状态映射 ── */
const SESSION_STATUS: Record<string, { pill: string; color: string; label: string }> = {
  running:      { pill: "status-running",   color: "var(--info)",    label: "运行中" },
  waiting_user: { pill: "status-queued",    color: "var(--warning)", label: "待用户" },
  completed:    { pill: "status-succeeded", color: "var(--success)", label: "已完成" },
  failed:       { pill: "status-failed",    color: "var(--danger)",  label: "失败" },
  idle:         { pill: "status-queued",    color: "var(--muted)",   label: "空闲" },
};

/* ── Artifact 状态映射 ── */
const ARTIFACT_STATUS: Record<string, { pill: string; color: string; label: string }> = {
  draft:     { pill: "status-queued",    color: "var(--muted)",   label: "草稿" },
  submitted: { pill: "status-running",   color: "var(--warning)", label: "待审查" },
  accepted:  { pill: "status-succeeded", color: "var(--success)", label: "已接受" },
  rejected:  { pill: "status-failed",    color: "var(--danger)",  label: "已拒绝" },
};

/* ── Task 状态映射 ── */
const TASK_STATUS: Record<string, { pill: string; color: string; label: string }> = {
  pending:     { pill: "status-queued",    color: "var(--muted)",   label: "待处理" },
  in_progress: { pill: "status-running",   color: "var(--info)",    label: "进行中" },
  completed:   { pill: "status-succeeded", color: "var(--success)", label: "已完成" },
  failed:      { pill: "status-failed",    color: "var(--danger)",  label: "失败" },
  cancelled:   { pill: "status-queued",    color: "var(--muted)",   label: "已取消" },
};

/* ── 格式化工具 ── */
function fmtDuration(ms?: number) {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtCost(cents?: number) {
  if (cents == null) return "--";
  if (cents === 0) return "$0";
  if (cents < 100) return `$0.${String(cents).padStart(2, "0")}`;
  return `$${(cents / 100).toFixed(2)}`;
}

/* ══════════════════════════════════════════════════════════════
   ProjectDetail — 项目级 Cockpit
   ══════════════════════════════════════════════════════════════ */
export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── 基础数据 ──
  const [project, setProject] = useState<any>(null);
  const [relations, setRelations] = useState<any[]>([]);
  const [outputs, setOutputs] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);

  // ── 编辑状态 ──
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editArr, setEditArr] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  // ── 关系表单 ──
  const [showAddRel, setShowAddRel] = useState(false);
  const [relTarget, setRelTarget] = useState("");
  const [relType, setRelType] = useState("dependency");
  const [relDesc, setRelDesc] = useState("");

  // ── 新建任务表单 ──
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskType, setNewTaskType] = useState("general");

  // ── Cockpit 摘要数据 ──
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [recentTraces, setRecentTraces] = useState<any[]>([]);
  const [recentArtifacts, setRecentArtifacts] = useState<any[]>([]);
  const [pendingInboxCount, setPendingInboxCount] = useState(0);

  // ── 元数据折叠 ──
  const [metaExpanded, setMetaExpanded] = useState(true);

  // ── 加载基础数据 + cockpit 数据 ──
  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getProject(id),
      api.getRelations(id).catch(() => []),
      api.listOutputs({ project_id: id }).catch(() => []),
      api.listProjects().catch(() => []),
    ]).then(([p, r, o, ap]) => {
      setProject(p);
      setRelations(r);
      setOutputs(o);
      setAllProjects(ap.filter((x: any) => x.id !== p.id));
    });

    // Cockpit 摘要数据并行加载
    api.listTasks({ project_id: id, limit: "5" }).then(setRecentTasks).catch(() => {});
    api.listAgentSessions({ project_id: id, limit: "5" }).then(setRecentSessions).catch(() => {});
    api.listTraces({ project_id: id }).then((list: any[]) => setRecentTraces(list.slice(0, 5))).catch(() => {});
    api.listArtifacts({ project_id: id }).then((list: any[]) => setRecentArtifacts(list.slice(0, 5))).catch(() => {});
    api.listInbox("pending")
      .then((items: any[]) => setPendingInboxCount(items.filter((i: any) => i.project_id === id).length))
      .catch(() => {});
  }, [id]);

  // 1 Hz heartbeat
  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  if (!project)
    return (
      <div className="pd-loading">
        <span className="mono">加载中…</span>
      </div>
    );

  const ch = statusStyle(project.status);
  const techCount = (project.tech_stack || []).length;
  const goalCount = (project.goals || []).length;

  // ── 统计指标 ──
  const allTasks = recentTasks; // 当前加载的即项目任务
  const runningTasks = allTasks.filter((t: any) => t.status === "in_progress").length;
  const failedTasks = allTasks.filter((t: any) => t.status === "failed").length;
  const activeSessions = recentSessions.filter((s: any) => s.status === "running" || s.status === "waiting_user").length;
  const submittedArtifacts = recentArtifacts.filter((a: any) => a.status === "submitted").length;

  /* ═══ 编辑操作（保留原有逻辑） ═══ */
  const startEdit = (field: string, value: string) => {
    setEditing(field);
    setEditVal(value);
  };
  const saveEdit = async (field: string) => {
    if (!editVal.trim()) { setEditing(null); return; }
    await api.updateProject(project.id, { [field]: editVal });
    setProject({ ...project, [field]: editVal });
    setEditing(null);
  };
  const cancelEdit = () => setEditing(null);

  const startEditArray = (field: "tech_stack" | "goals") => {
    setEditing(field);
    setEditArr([...(project[field] || [])]);
  };
  const saveEditArray = async (field: "tech_stack" | "goals") => {
    const cleaned = editArr.map((s) => s.trim()).filter(Boolean);
    await api.updateProject(project.id, { [field]: cleaned });
    setProject({ ...project, [field]: cleaned });
    setEditing(null);
  };

  const handleStatusChange = async (newStatus: string) => {
    await api.updateProject(project.id, { status: newStatus });
    setProject({ ...project, status: newStatus });
  };

  const handleAddRelation = async () => {
    if (!relTarget || !relType.trim()) return;
    await api.addRelation(project.id, relTarget, relType, relDesc || undefined);
    const r = await api.getRelations(project.id).catch(() => []);
    setRelations(r);
    setShowAddRel(false);
    setRelTarget("");
    setRelType("dependency");
    setRelDesc("");
  };
  const handleRemoveRelation = async (relId: string) => {
    if (!confirm("确定删除该关系？")) return;
    await api.removeRelation(relId);
    setRelations(relations.filter((r: any) => r.id !== relId));
  };

  const handleDelete = async () => {
    if (!confirm(`确定删除项目 "${project.name}"？关联数据将保留。`)) return;
    await api.deleteProject(project.id);
    navigate("/projects");
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    await api.createTask({
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim() || undefined,
      priority: newTaskPriority,
      type: newTaskType,
      project_id: project.id,
    });
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskPriority("medium");
    setNewTaskType("general");
    setShowAddTask(false);
    // 刷新任务摘要
    api.listTasks({ project_id: project.id, limit: "5" }).then(setRecentTasks).catch(() => {});
  };

  /* ═══ 健康条指标 ═══ */
  const healthItems = [
    { label: "待处理", value: pendingInboxCount, color: "var(--warning)", link: `/inbox?status=pending` },
    { label: "运行中", value: runningTasks, color: "var(--info)", link: `/tasks?status=in_progress&project_id=${project.id}` },
    { label: "失败", value: failedTasks, color: "var(--danger)", link: `/tasks?status=failed&project_id=${project.id}` },
    { label: "待审查", value: submittedArtifacts, color: "var(--accent)", link: `/artifacts?status=submitted` },
    { label: "活跃会话", value: activeSessions, color: "var(--success)", link: "/agents" },
  ];

  return (
    <div className="pd-page project-detail-scroll">
      {/* ═══ Back nav ═══ */}
      <Link to="/projects" className="pd-back">
        <ArrowLeft size={13} />
        <span className="mono">返回项目列表</span>
      </Link>

      {/* ═══ Telemetry bar ═══ */}
      <div className="pd-telemetry">
        <div className="pd-telem-cell">
          <span className="pd-telem-label">
            <Hash size={11} /> 项目
          </span>
          <span className="pd-telem-value mono">
            {project.id?.slice(0, 8).toUpperCase()}
          </span>
        </div>
        <div className="pd-telem-cell">
          <span className="pd-telem-label" style={{ color: ch.color }}>
            <FolderKanban size={11} /> 状态
          </span>
          {/* P8-03: 状态切换下拉 */}
          <CustomSelect
            value={project.status}
            onChange={handleStatusChange}
            options={PROJECT_STATUS_OPTIONS}
            style={{ width: 104, color: ch.color }}
            title="切换项目状态"
            variant="badge"
          />
        </div>
        <div className="pd-telem-cell">
          <span className="pd-telem-label">
            <GitBranch size={11} /> 关联
          </span>
          <span className="pd-telem-value mono">
            {String(relations.length).padStart(3, "0")}
          </span>
        </div>
        <div className="pd-telem-cell">
          <span className="pd-telem-label">
            <FileOutput size={11} /> 输出
          </span>
          <span className="pd-telem-value mono">
            {String(outputs.length).padStart(3, "0")}
          </span>
        </div>
        <div className="pd-telem-spacer" />
        <div className="pd-telem-cell">
          <span className="pd-telem-label">
            <Clock size={11} /> 最近活跃
          </span>
          <span className="pd-telem-value mono">
            {relTime(project.last_activity || project.updated_at)}
          </span>
        </div>
        {/* P8-06: 详情页删除按钮 */}
        <button
          onClick={handleDelete}
          className="icon-btn"
          style={{ color: "var(--danger)", marginLeft: 8 }}
          title="删除项目"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* ═══ Header: 项目名 / 路径 / 状态 / 操作按钮 ═══ */}
      <div className="pd-header-card" style={{ "--ch": ch.color } as any}>
        <div className="pd-header-rail" />
        <div className="pd-header-body">
          <div className="pd-header-head">
            <span className="pd-header-index mono">
              PRJ{project.id?.slice(0, 3).toUpperCase()}
            </span>
            <span className="pd-header-channel mono" style={{ color: ch.color }}>
              · {ch.code}
            </span>
            <span className="pd-header-status mono" style={{ color: ch.color }}>
              {ch.label}
            </span>
            {/* 状态切换下拉 */}
            <CustomSelect
              value={project.status}
              onChange={handleStatusChange}
              options={[
                { value: "active", label: "ACTIVE" },
                { value: "paused", label: "PAUSED" },
                { value: "archived", label: "ARCHIVED" },
              ]}
              style={{ width: 104, color: ch.color, marginLeft: 8 }}
              title="切换项目状态"
              variant="badge"
            />
            <div style={{ flex: 1 }} />
            <button
              onClick={handleDelete}
              className="icon-btn"
              style={{ color: "var(--danger)" }}
              title="删除项目"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {editing === "name" ? (
            <div className="pd-edit-row">
              <input value={editVal} onChange={(e) => setEditVal(e.target.value)} className="pd-edit-input" autoFocus />
              <button onClick={() => saveEdit("name")} className="icon-btn"><Check size={14} /></button>
              <button onClick={cancelEdit} className="icon-btn"><X size={14} /></button>
            </div>
          ) : (
            <div className="pd-title-row">
              <h1 className="pd-title">{project.name}</h1>
              <button onClick={() => startEdit("name", project.name)} className="icon-btn" title="编辑名称">
                <Edit3 size={12} />
              </button>
            </div>
          )}

          <div className="pd-path-row">
            <MapPin size={11} style={{ color: "var(--muted)" }} />
            <span className="mono pd-path-text">{project.path}</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)", marginLeft: 16 }}>
              <Hash size={10} style={{ display: "inline", verticalAlign: "middle" }} />
              {" "}{project.id?.slice(0, 8).toUpperCase()}
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)", marginLeft: 12 }}>
              <GitBranch size={10} style={{ display: "inline", verticalAlign: "middle" }} />
              {" "}{relations.length} 关联
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)", marginLeft: 12 }}>
              <FileOutput size={10} style={{ display: "inline", verticalAlign: "middle" }} />
              {" "}{outputs.length} 输出
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)", marginLeft: 12 }}>
              <Clock size={10} style={{ display: "inline", verticalAlign: "middle" }} />
              {" "}{relTime(project.last_activity || project.updated_at)}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ 健康条（Health Strip）: 5 个关键指标卡片 ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
        {healthItems.map((item) => (
          <Link
            key={item.label}
            to={item.link}
            className="metric-card no-underline"
            style={{ padding: "12px 14px", textDecoration: "none", display: "block" }}
          >
            <p className="text-xl font-semibold mono" style={{ color: item.color, margin: 0 }}>
              {item.value}
            </p>
            <p className="text-[10px]" style={{ color: "var(--muted)", margin: 0, marginTop: 2 }}>
              {item.label}
            </p>
          </Link>
        ))}
      </div>

      {/* ═══ 摘要网格（Main Grid）: 2 列布局 ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>

        {/* ── 左列：任务摘要 ── */}
        <div className="content-card" style={{ padding: "14px 16px" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--muted)" }}>
              任务
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              · {allTasks.length}
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setShowAddTask(true)}
              className="icon-btn"
              style={{ padding: "0 4px" }}
              title="新建任务"
            >
              <Plus size={11} />
            </button>
            <Link
              to={`/tasks?project_id=${project.id}`}
              className="text-[10px] font-medium"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              查看全部 →
            </Link>
          </div>
          {allTasks.length === 0 ? (
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>暂无任务</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {allTasks.slice(0, 5).map((task: any) => {
                const ts = TASK_STATUS[task.status] || TASK_STATUS.pending;
                return (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="list-row no-underline"
                    style={{ minHeight: 40, padding: "8px 12px", gap: 8, textDecoration: "none" }}
                  >
                    <span className={`status-pill ${ts.pill}`} style={{ fontSize: 9, padding: "1px 6px" }}>
                      {ts.label}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {task.title}
                    </span>
                    {task.priority && (
                      <span className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em" }}>
                        {task.priority}
                      </span>
                    )}
                    {task.assignee_id && (
                      <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                        {task.assignee_id.length > 8 ? task.assignee_id.slice(0, 8) + "…" : task.assignee_id}
                      </span>
                    )}
                    <span className="mono text-[10px]" style={{ color: "var(--muted)", flexShrink: 0 }}>
                      {relTime(task.created_at)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 右列：Agent 会话摘要 ── */}
        <div className="content-card" style={{ padding: "14px 16px" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--muted)" }}>
              Agent 会话
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              · {recentSessions.length}
            </span>
            <div style={{ flex: 1 }} />
            <Link
              to="/agents"
              className="text-[10px] font-medium"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              查看全部 →
            </Link>
          </div>
          {recentSessions.length === 0 ? (
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>暂无 Agent 会话</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {recentSessions.map((s: any) => {
                const ss = SESSION_STATUS[s.status] || SESSION_STATUS.idle;
                const isWaiting = s.status === "waiting_user";
                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      minHeight: 40, padding: "8px 12px",
                      border: `1px solid ${isWaiting ? "var(--warning)" : "var(--line)"}`,
                      borderRadius: "var(--radius-lg)",
                      background: isWaiting ? "var(--warning-bg)" : "var(--bg-card)",
                      fontSize: 12,
                    }}
                  >
                    <span className={`status-pill ${ss.pill}`} style={{ fontSize: 9, padding: "1px 6px" }}>
                      {ss.label}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {s.agent_id?.length > 12 ? s.agent_id.slice(0, 12) + "…" : (s.agent_id || "—")}
                    </span>
                    {(s.last_output || s.output) && (
                      <span className="text-[10px]" style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                        {(s.last_output || s.output).slice(0, 30)}
                      </span>
                    )}
                    <span className="mono text-[10px]" style={{ color: "var(--muted)", flexShrink: 0 }}>
                      {relTime(s.updated_at ?? s.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 左列：Trace 摘要 ── */}
        <div className="content-card" style={{ padding: "14px 16px" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--muted)" }}>
              执行轨迹
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              · {recentTraces.length}
            </span>
            <div style={{ flex: 1 }} />
            <Link
              to={`/traces?project_id=${project.id}`}
              className="text-[10px] font-medium"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              查看全部 →
            </Link>
          </div>
          {recentTraces.length === 0 ? (
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>暂无执行轨迹</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {recentTraces.map((trace: any) => {
                const ts = TRACE_STATUS[trace.status] || TRACE_STATUS.pending;
                const isFailed = trace.status === "failed";
                return (
                  <Link
                    key={trace.task_id}
                    to={`/traces/${trace.task_id}`}
                    className="list-row no-underline"
                    style={{
                      minHeight: 40, padding: "8px 12px", gap: 8, textDecoration: "none",
                      borderColor: isFailed ? "var(--danger)" : undefined,
                    }}
                  >
                    <span className={`status-pill ${ts.pill}`} style={{ fontSize: 9, padding: "1px 6px" }}>
                      {ts.label}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {trace.title || trace.task_id?.slice(0, 12)}
                    </span>
                    <span className="mono text-[10px]" style={{ color: "var(--muted)" }}>
                      <Timer size={9} style={{ display: "inline", verticalAlign: "middle" }} />
                      {" "}{fmtDuration(trace.duration_ms)}
                    </span>
                    <span className="mono text-[10px]" style={{ color: "var(--muted)" }}>
                      <Coins size={9} style={{ display: "inline", verticalAlign: "middle" }} />
                      {" "}{fmtCost(trace.cost_cents)}
                    </span>
                    <span className="mono text-[10px]" style={{ color: "var(--muted)", flexShrink: 0 }}>
                      {relTime(trace.created_at)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 右列：Artifact 摘要 ── */}
        <div className="content-card" style={{ padding: "14px 16px" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--muted)" }}>
              产出物
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              · {recentArtifacts.length}
            </span>
            <div style={{ flex: 1 }} />
            <Link
              to={`/artifacts?project_id=${project.id}`}
              className="text-[10px] font-medium"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              查看全部 →
            </Link>
          </div>
          {recentArtifacts.length === 0 ? (
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>暂无产出物</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {recentArtifacts.map((art: any) => {
                const as = ARTIFACT_STATUS[art.status] || ARTIFACT_STATUS.draft;
                const isSubmitted = art.status === "submitted";
                return (
                  <div
                    key={art.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      minHeight: 40, padding: "8px 12px",
                      border: `1px solid ${isSubmitted ? "var(--warning)" : "var(--line)"}`,
                      borderRadius: "var(--radius-lg)",
                      background: isSubmitted ? "var(--warning-bg)" : "var(--bg-card)",
                      fontSize: 12,
                    }}
                  >
                    <span className={`status-pill ${as.pill}`} style={{ fontSize: 9, padding: "1px 6px" }}>
                      {as.label}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {art.title || art.name || art.id?.slice(0, 12)}
                    </span>
                    {art.type && (
                      <span className="tech-badge mono" style={{ fontSize: 9, padding: "1px 4px" }}>
                        {art.type}
                      </span>
                    )}
                    <span className="mono text-[10px]" style={{ color: "var(--muted)", flexShrink: 0 }}>
                      {relTime(art.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ 新建任务内联表单 ═══ */}
      {showAddTask && (
        <div className="content-card" style={{ padding: 12, marginBottom: 16 }}>
          <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>
            新建任务
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="输入任务标题"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && newTaskTitle.trim()) handleAddTask(); }}
              className="form-input flex-1"
              style={{ fontSize: 12 }}
              autoFocus
            />
            <CustomSelect
              value={newTaskPriority}
              onChange={setNewTaskPriority}
              options={[
                { value: "urgent", label: "紧急" },
                { value: "high", label: "高" },
                { value: "medium", label: "中" },
                { value: "low", label: "低" },
              ]}
              style={{ width: 80 }}
            />
            <CustomSelect
              value={newTaskType}
              onChange={setNewTaskType}
              options={[
                { value: "general", label: "通用" },
                { value: "bug", label: "缺陷" },
                { value: "feature", label: "功能" },
                { value: "review", label: "审查" },
                { value: "analysis", label: "分析" },
              ]}
              style={{ width: 90 }}
            />
            <button onClick={handleAddTask} disabled={!newTaskTitle.trim()} className="button button-primary" style={{ fontSize: 11, padding: "4px 12px" }}>
              提交
            </button>
            <button
              onClick={() => { setShowAddTask(false); setNewTaskTitle(""); setNewTaskDesc(""); setNewTaskPriority("medium"); setNewTaskType("general"); }}
              className="button"
              style={{ fontSize: 11, padding: "4px 12px" }}
            >
              取消
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <textarea
              placeholder="任务描述（可选）"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              className="form-input flex-1"
              style={{ fontSize: 12, minHeight: 44, maxHeight: 72, resize: "vertical", lineHeight: 1.4, paddingTop: 6, paddingBottom: 6 }}
              rows={2}
            />
          </div>
        </div>
      )}

      {/* ═══ 输出记录 ═══ */}
      {outputs.length > 0 && (
        <section className="pd-section" style={{ marginBottom: 16 }}>
          <h3 className="pd-section-title">
            输出记录
            <span className="pd-section-count mono">{outputs.length}</span>
          </h3>
          <div className="pd-outputs-list">
            {outputs.slice(0, 10).map((o: any) => (
              <div key={o.id} className="pd-output-row">
                <span className={`pd-output-source mono source-${o.source}`}>
                  {o.source}
                </span>
                <span className={`type-badge type-${o.direction}`}>
                  {DIR_LABEL[o.direction] || o.direction}
                </span>
                <span className="pd-output-title">{o.title}</span>
                <span className="pd-output-time mono">
                  {new Date(o.created_at).toLocaleDateString("zh-CN")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ 关联项目 ═══ */}
      <section className="pd-section" style={{ marginBottom: 16 }}>
        <h3 className="pd-section-title">
          关联项目
          <span className="pd-section-count mono">
            {String(relations.length).padStart(3, "0")}
          </span>
          <button
            onClick={() => setShowAddRel((s) => !s)}
            className="icon-btn ml-auto"
            title="添加关系"
          >
            <Plus size={12} />
          </button>
        </h3>
        {showAddRel && (
          <div className="pd-section-card mb-3" style={{ padding: 12 }}>
            <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>
              新建关联
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ minWidth: 60, color: "var(--muted)" }}>目标</span>
                <CustomSelect
                  value={relTarget}
                  onChange={setRelTarget}
                  options={[
                    { value: "", label: "选择项目..." },
                    ...allProjects.map((p: any) => ({ value: p.id, label: p.name })),
                  ]}
                  className="flex-1"
                  style={{ height: 30 }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ minWidth: 60, color: "var(--muted)" }}>类型</span>
                <CustomSelect
                  value={relType}
                  onChange={setRelType}
                  options={RELATION_TYPE_OPTIONS}
                  className="flex-1"
                  style={{ height: 30 }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ minWidth: 60, color: "var(--muted)" }}>描述</span>
                <input value={relDesc} onChange={(e) => setRelDesc(e.target.value)} placeholder="可选描述" className="form-input flex-1" style={{ fontSize: 11 }} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddRelation} disabled={!relTarget} className="button button-primary" style={{ fontSize: 11, padding: "4px 12px" }}>提交</button>
                <button onClick={() => { setShowAddRel(false); setRelTarget(""); setRelType("dependency"); setRelDesc(""); }} className="button" style={{ fontSize: 11, padding: "4px 12px" }}>取消</button>
              </div>
            </div>
          </div>
        )}
        {relations.length === 0 ? (
          <div style={{ padding: "8px 0" }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>暂无关联项目</span>
          </div>
        ) : (
          <div className="pd-relations-list">
            {relations.map((r: any) => (
              <div key={r.id} className="pd-relation-row">
                <span className="pd-rel-id mono">
                  {r.target_id?.slice(0, 8) || r.id?.slice(0, 8)}
                </span>
                <span className="type-badge type-context">
                  {r.relation_type}
                </span>
                {r.description && (
                  <span className="pd-rel-desc">{r.description}</span>
                )}
                <button onClick={() => handleRemoveRelation(r.id)} className="icon-btn ml-auto" style={{ color: "var(--danger)" }} title="删除关系">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ 折叠区：项目详情（元数据降级） ═══ */}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <button
          onClick={() => setMetaExpanded((v) => !v)}
          className="flex items-center gap-2"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
        >
          {metaExpanded ? <ChevronDown size={13} style={{ color: "var(--muted)" }} /> : <ChevronRight size={13} style={{ color: "var(--muted)" }} />}
          <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: "var(--muted)" }}>
            项目详情
          </span>
        </button>

        {metaExpanded && (
          <div className="pd-meta-grid">
            {/* 描述 */}
            <div className="pd-meta-card">
              <div className="pd-meta-label">
                <Layers size={11} /> 描述
              </div>
              {editing === "description" ? (
                <div className="pd-edit-col">
                  <textarea value={editVal} onChange={(e) => setEditVal(e.target.value)} className="pd-edit-textarea" rows={3} autoFocus />
                  <div className="pd-edit-actions">
                    <button onClick={() => saveEdit("description")} className="icon-btn"><Check size={14} /></button>
                    <button onClick={cancelEdit} className="icon-btn"><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <div className="pd-desc-body">
                  <p className="pd-desc-text" style={{ color: project.description ? "var(--text)" : "var(--muted)" }}>
                    {project.description || "NO DESCRIPTION ON FILE"}
                  </p>
                  <button onClick={() => startEdit("description", project.description || "")} className="icon-btn" title="编辑">
                    <Edit3 size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* 技术栈 */}
            <div className="pd-meta-card">
              <div className="pd-meta-label">
                <Cpu size={11} /> 技术栈 ·{" "}
                <span className="mono">{String(techCount).padStart(2, "0")}</span>
                {editing !== "tech_stack" && (
                  <button onClick={() => startEditArray("tech_stack")} className="icon-btn ml-auto" title="编辑技术栈">
                    <Edit3 size={11} />
                  </button>
                )}
              </div>
              {editing === "tech_stack" ? (
                <div className="pd-tech-list">
                  {editArr.map((t, i) => (
                    <span key={i} className="tech-badge mono flex items-center gap-1">
                      <input value={t} onChange={(e) => { const next = [...editArr]; next[i] = e.target.value; setEditArr(next); }} className="bg-transparent border-none outline-none" style={{ width: Math.max(t.length * 7, 30) }} />
                      <button onClick={() => setEditArr(editArr.filter((_, j) => j !== i))} className="icon-btn" style={{ padding: 0 }}><X size={9} /></button>
                    </span>
                  ))}
                  <span className="tech-badge mono flex items-center gap-1" style={{ background: "var(--bg-elevated)" }}>
                    <input value="" onChange={(e) => e.target.value && setEditArr([...editArr, e.target.value])} placeholder="+ 添加" className="bg-transparent border-none outline-none" style={{ width: 60 }} />
                  </span>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => saveEditArray("tech_stack")} className="icon-btn" title="保存"><Check size={12} /></button>
                    <button onClick={cancelEdit} className="icon-btn" title="取消"><X size={12} /></button>
                  </div>
                </div>
              ) : (project.tech_stack || []).length > 0 ? (
                <div className="pd-tech-list">
                  {(project.tech_stack || []).map((t: string) => (
                    <span key={t} className="tech-badge mono">{t}</span>
                  ))}
                </div>
              ) : (
                <span className="mono pd-empty">未检测</span>
              )}
            </div>

            {/* 目标 */}
            <div className="pd-meta-card">
              <div className="pd-meta-label">
                <Target size={11} /> 目标 ·{" "}
                <span className="mono">{String(goalCount).padStart(2, "0")}</span>
                {editing !== "goals" && (
                  <button onClick={() => startEditArray("goals")} className="icon-btn ml-auto" title="编辑目标">
                    <Edit3 size={11} />
                  </button>
                )}
              </div>
              {editing === "goals" ? (
                <div className="pd-goals-list">
                  {editArr.map((g, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="pd-goal-index mono">{String(i + 1).padStart(2, "0")}</span>
                      <input value={g} onChange={(e) => { const next = [...editArr]; next[i] = e.target.value; setEditArr(next); }} className="config-input text-xs flex-1" />
                      <button onClick={() => setEditArr(editArr.filter((_, j) => j !== i))} className="icon-btn" style={{ padding: 0 }}><X size={11} /></button>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    <input value="" onChange={(e) => e.target.value && setEditArr([...editArr, e.target.value])} placeholder="+ 添加目标" className="config-input text-xs flex-1" />
                  </div>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => saveEditArray("goals")} className="icon-btn" title="保存"><Check size={12} /></button>
                    <button onClick={cancelEdit} className="icon-btn" title="取消"><X size={12} /></button>
                  </div>
                </div>
              ) : (project.goals || []).length > 0 ? (
                <div className="pd-goals-list">
                  {(project.goals || []).map((g: string, i: number) => (
                    <div key={i} className="pd-goal-item">
                      <span className="pd-goal-index mono">{String(i + 1).padStart(2, "0")}</span>
                      <span className="pd-goal-dash">╌</span>
                      <span className="pd-goal-text">{g}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="mono pd-empty">未设置目标</span>
              )}
            </div>

            {/* 时间线 */}
            <div className="pd-meta-card">
              <div className="pd-meta-label">
                <Clock size={11} /> 时间线
              </div>
              <div className="pd-time-list">
                <div className="pd-time-row">
                  <span className="pd-time-key mono">创建</span>
                  <span className="pd-time-val">{new Date(project.created_at).toLocaleString("zh-CN")}</span>
                </div>
                <div className="pd-time-row">
                  <span className="pd-time-key mono">更新</span>
                  <span className="pd-time-val">{new Date(project.updated_at).toLocaleString("zh-CN")}</span>
                </div>
                {project.last_activity && (
                  <div className="pd-time-row">
                    <span className="pd-time-key mono">活跃</span>
                    <span className="pd-time-val">{new Date(project.last_activity).toLocaleString("zh-CN")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
