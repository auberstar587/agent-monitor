import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import CustomSelect from "../components/CustomSelect";
import {
  ListTodo, Plus, XCircle, CheckCircle, Play, Clock,
  Pause, AlertTriangle, ChevronUp, Hash, CornerDownLeft,
  Radio, Zap, Cpu,
} from "lucide-react";

const STATUS_GROUPS = ["pending", "in_progress", "completed", "failed", "cancelled"] as const;

const STATUS_STYLE: Record<string, { color: string; label: string; code: string; icon: any }> = {
  pending:     { color: "var(--warning)", label: "待处理",     code: "00", icon: Clock },
  in_progress: { color: "var(--info)",    label: "进行中", code: "01", icon: Play },
  completed:   { color: "var(--success)", label: "已完成",   code: "02", icon: CheckCircle },
  failed:      { color: "var(--danger)",  label: "失败",      code: "03", icon: XCircle },
  cancelled:   { color: "var(--muted)",   label: "已取消",   code: "04", icon: Pause },
};

const PRIORITY_STYLE: Record<string, { color: string; label: string }> = {
  urgent: { color: "var(--danger)",  label: "URG" },
  high:   { color: "var(--warning)", label: "HIGH" },
  medium: { color: "var(--info)",    label: "MED" },
  low:    { color: "var(--muted)",   label: "LOW" },
};

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_OPTIONS = [
  { value: "urgent", label: "紧急" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];
const PRIORITY_FILTER_OPTIONS = [
  { value: "", label: "全部优先级" },
  ...PRIORITY_OPTIONS,
];
const STATUS_FILTER_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待处理" },
  { value: "in_progress", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "cancelled", label: "已取消" },
];
const TASK_TYPE_OPTIONS = [
  { value: "general", label: "通用" },
  { value: "bug", label: "缺陷" },
  { value: "feature", label: "功能" },
  { value: "review", label: "审查" },
  { value: "analysis", label: "分析" },
];

/* ════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════ */
export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("general");
  // 筛选
  const [filterProject, setFilterProject] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [newProjectId, setNewProjectId] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const load = (extra?: { project_id?: string; priority?: string; status?: string }) => {
    const f: Record<string, string> = {};
    if (extra?.project_id) f.project_id = extra.project_id;
    else if (filterProject) f.project_id = filterProject;
    if (extra?.priority) f.priority = extra.priority;
    else if (filterPriority) f.priority = filterPriority;
    if (extra?.status) f.status = extra.status;
    else if (filterStatus) f.status = filterStatus;
    return api.listTasks(Object.keys(f).length > 0 ? f : undefined).then(setTasks).finally(() => setLoading(false));
  };
  // 从 URL 参数初始化筛选（只在 mount 时）
  useEffect(() => {
    const s = searchParams.get("status");
    const p = searchParams.get("project_id");
    if (s) setFilterStatus(s);
    if (p) setFilterProject(p);
  }, []);
  useEffect(() => { load(); }, [filterProject, filterPriority, filterStatus]);
  useEffect(() => { api.listProjects().then(setProjects).catch(() => {}); }, []);
  useEffect(() => { api.listAgents().then(setAgents).catch(() => {}); }, []);

  const handleAdd = async () => {
    if (!title.trim()) return;
    await api.createTask({ title, priority, description: description || undefined, type: taskType, project_id: newProjectId || undefined });
    setTitle("");
    setDescription("");
    setTaskType("general");
    setNewProjectId("");
    setShowAdd(false);
    load();
  };

  // 看板上直接转换状态（卡在 e.preventDefault() 阻止 Link 跳转）
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());
  const handleTransition = async (taskId: string, newStatus: string) => {
    setTransitioning((s) => new Set(s).add(taskId));
    try {
      await api.transitionTask(taskId, newStatus);
      await load();
    } catch {
      // 错误显示由 P8-16 在 TaskDetail 处理；看板简化用 alert
      alert("状态转换失败，请到详情页查看详情");
    } finally {
      setTransitioning((s) => { const n = new Set(s); n.delete(taskId); return n; });
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STATUS_GROUPS) c[s] = 0;
    for (const t of tasks) if (c[t.status] !== undefined) c[t.status]++;
    return c;
  }, [tasks]);

  const grouped = STATUS_GROUPS.map((status) => ({
    status,
    style: STATUS_STYLE[status],
    tasks: tasks
      .filter((t) => t.status === status)
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)),
  }));

  return (
    <div className="tasks-page">
      {/* ═══ Telemetry bar ═══ */}
      <div className="agents-telemetry">
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><ListTodo size={11} /> 全部</span>
          <span className="agents-telem-value mono">{String(tasks.length).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--warning)" }}><Clock size={11} /> 待处理</span>
          <span className="agents-telem-value mono" style={{ color: "var(--warning)" }}>{String(counts.pending).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--info)" }}><Play size={11} /> 进行中</span>
          <span className="agents-telem-value mono" style={{ color: "var(--info)" }}>{String(counts.in_progress).padStart(3, "0")}</span>
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

      {/* ═══ Action bar ═══ */}
      <div className="projects-actions">
        <span className="projects-actions-meta">
          <span className="projects-actions-dot" />
          任务队列 · {tasks.length} 个任务 · {counts.pending} 个待处理
        </span>
        {/* 项目筛选 */}
        <CustomSelect
          value={filterProject}
          onChange={setFilterProject}
          options={[
            { value: "", label: "全部项目" },
            ...projects.map((p: any) => ({ value: p.id, label: p.name })),
          ]}
          style={{ width: 140, height: 28, fontSize: 11 }}
        />
        {/* 优先级筛选 */}
        <CustomSelect
          value={filterPriority}
          onChange={setFilterPriority}
          options={PRIORITY_FILTER_OPTIONS}
          style={{ width: 120, height: 28, fontSize: 11 }}
        />
        {/* 状态筛选 */}
        <CustomSelect
          value={filterStatus}
          onChange={(v) => { setFilterStatus(v); load({ status: v }); }}
          options={STATUS_FILTER_OPTIONS}
          style={{ width: 120, height: 28, fontSize: 11 }}
        />
        {(filterProject || filterPriority || filterStatus) && (
          <button
            type="button"
            onClick={() => { setFilterProject(""); setFilterPriority(""); setFilterStatus(""); }}
            className="button"
            style={{ fontSize: 11, padding: "0 10px", height: 28 }}
          >
            清除筛选
          </button>
        )}
        <button
          className="button button-primary"
          onClick={() => setShowAdd((s) => !s)}
        >
          <Plus size={13} /> {showAdd ? "收起表单" : "新建任务"}
        </button>
      </div>

      {/* ═══ Add form (telemetry strip) ═══ */}
      {showAdd && (
        <div className="projects-add">
          <div className="projects-add-cell" style={{ gridColumn: "1 / -1" }}>
            <span className="projects-add-label">
              <Hash size={9} style={{ display: "inline", marginRight: 3, verticalAlign: -1 }} />
              标题 · 输入任务标题
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="输入任务标题，回车提交"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="projects-add-input flex-1"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleAdd(); }}
                autoFocus
              />
              <CustomSelect
                value={priority}
                onChange={setPriority}
                options={PRIORITY_OPTIONS}
                style={{ width: 120, cursor: "pointer" }}
              />
              <CustomSelect
                value={taskType}
                onChange={setTaskType}
                options={TASK_TYPE_OPTIONS}
                style={{ width: 100, cursor: "pointer" }}
              />
              <CustomSelect
                value={newProjectId}
                onChange={setNewProjectId}
                options={[
                  { value: "", label: "未指定项目" },
                  ...projects.map((p: any) => ({ value: p.id, label: p.name })),
                ]}
                style={{ width: 140, cursor: "pointer" }}
              />
              <button
                onClick={handleAdd}
                disabled={!title.trim()}
                className="projects-add-submit"
                style={{ width: 80, height: "100%" }}
              >
                <CornerDownLeft size={12} /> 提交
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <textarea
                placeholder="任务描述（可选）"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="projects-add-input flex-1"
                style={{ minHeight: 48, maxHeight: 72, resize: "vertical", lineHeight: 1.4, paddingTop: 6, paddingBottom: 6 }}
                rows={2}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══ Kanban columns ═══ */}
      {loading ? (
        <div className="dashboard-feed-empty" style={{ minHeight: 200 }}>
          <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>加载中…</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="agents-empty">
          <div className="agents-empty-grid" />
          <div className="agents-empty-body">
            <div className="flex items-center gap-2 mb-3">
              <Radio size={14} style={{ color: "var(--muted)" }} />
              <span className="agents-eyebrow">暂无任务</span>
            </div>
            <p className="agents-empty-title">创建第一个任务开始追踪</p>
            <p className="agents-empty-sub"></p>
          </div>
        </div>
      ) : (
        <div className="tasks-grid">
          {grouped.map(({ status, style, tasks: groupTasks }) => {
            const Icon = style.icon;
            return (
              <div key={status} className="tasks-column">
                {/* Column header */}
                <div className="tasks-column-head" style={{ borderColor: style.color + "33" }}>
                  <div className="tasks-column-rail" style={{ background: style.color }} />
                  <Icon size={12} style={{ color: style.color }} />
                  <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: style.color }}>
                    {style.label}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                    · {String(groupTasks.length).padStart(2, "0")}
                  </span>
                </div>

                {/* Column body */}
                <div className="tasks-column-body">
                  {groupTasks.length === 0 ? (
                    <div className="tasks-column-empty mono">— 空 —</div>
                  ) : (
                    groupTasks.map((task: any) => {
                      const pri = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.medium;
                      const busy = transitioning.has(task.id);
                      return (
                        <Link
                          key={task.id}
                          to={`/tasks/${task.id}`}
                          className="task-card no-underline"
                          style={{ "--pri": pri.color } as any}
                        >
                          <div className="task-card-rail" />
                          <div className="task-card-body">
                            <div className="task-card-head">
                              <span className="mono" style={{ fontSize: 9, color: pri.color, letterSpacing: "0.08em" }}>
                                {pri.label}
                              </span>
                            </div>
                            <p className="task-card-title">{task.title}</p>
                            {task.project_id && (() => {
                              const proj = projects.find((p: any) => p.id === task.project_id);
                              return proj ? (
                                <span className="mono" style={{ fontSize: 9, color: "var(--muted)", display: "block", marginTop: 2 }}>
                                  📁 {proj.name}
                                </span>
                              ) : null;
                            })()}
                            {task.assignee_id && (() => {
                              const a = agents.find((ag: any) => ag.id === task.assignee_id);
                              return (
                                <span className="task-card-assignee mono">
                                  {a ? a.name : task.assignee_id}
                                </span>
                              );
                            })()}
                            {/* 看板快捷操作（阻止 Link 跳转） */}
                            {(task.status === "pending" || task.status === "in_progress") && (
                              <div
                                className="task-card-actions"
                                onClick={(e) => e.preventDefault()}
                              >
                                {task.status === "pending" && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); handleTransition(task.id, "in_progress"); }}
                                    disabled={busy}
                                    className="icon-btn"
                                    title="开始执行"
                                  >
                                    <Play size={11} />
                                  </button>
                                )}
                                {task.status === "in_progress" && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); handleTransition(task.id, "completed"); }}
                                      disabled={busy}
                                      className="icon-btn"
                                      title="完成"
                                    >
                                      <CheckCircle size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); handleTransition(task.id, "failed"); }}
                                      disabled={busy}
                                      className="icon-btn"
                                      title="标记失败"
                                    >
                                      <XCircle size={11} />
                                    </button>
                                  </>
                                )}
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
          })}
        </div>
      )}
    </div>
  );
}
