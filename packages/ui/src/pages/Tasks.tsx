import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  ListTodo, Plus, XCircle, CheckCircle, Play, Clock,
  Pause, AlertTriangle, ChevronUp, Hash, CornerDownLeft,
  Radio, Zap, Cpu,
} from "lucide-react";

const STATUS_GROUPS = ["pending", "in_progress", "completed", "failed", "cancelled"] as const;

const STATUS_STYLE: Record<string, { color: string; label: string; code: string; icon: any }> = {
  pending:     { color: "var(--warning)", label: "PENDING",     code: "00", icon: Clock },
  in_progress: { color: "var(--info)",    label: "IN_PROGRESS", code: "01", icon: Play },
  completed:   { color: "var(--success)", label: "COMPLETED",   code: "02", icon: CheckCircle },
  failed:      { color: "var(--danger)",  label: "FAILED",      code: "03", icon: XCircle },
  cancelled:   { color: "var(--muted)",   label: "CANCELLED",   code: "04", icon: Pause },
};

const PRIORITY_STYLE: Record<string, { color: string; label: string }> = {
  urgent: { color: "var(--danger)",  label: "URG" },
  high:   { color: "var(--warning)", label: "HIGH" },
  medium: { color: "var(--info)",    label: "MED" },
  low:    { color: "var(--muted)",   label: "LOW" },
};

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/* ════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════ */
export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();

  const load = () => api.listTasks().then(setTasks).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // 1 Hz heartbeat
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleAdd = async () => {
    if (!title.trim()) return;
    await api.createTask({ title, priority });
    setTitle("");
    setShowAdd(false);
    load();
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
          <span className="agents-telem-label"><ListTodo size={11} /> TOTAL</span>
          <span className="agents-telem-value mono">{String(tasks.length).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--warning)" }}><Clock size={11} /> PENDING</span>
          <span className="agents-telem-value mono" style={{ color: "var(--warning)" }}>{String(counts.pending).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--info)" }}><Play size={11} /> ACTIVE</span>
          <span className="agents-telem-value mono" style={{ color: "var(--info)" }}>{String(counts.in_progress).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--success)" }}><CheckCircle size={11} /> DONE</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>{String(counts.completed).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--danger)" }}><XCircle size={11} /> FAILED</span>
          <span className="agents-telem-value mono" style={{ color: "var(--danger)" }}>{String(counts.failed).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-spacer" />
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><Radio size={11} /> TICK</span>
          <span className="agents-telem-value mono">{String(tick % 1000).padStart(3, "0")}<span className="agents-telem-unit">s</span></span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label">UPLINK</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>SYNC</span>
        </div>
      </div>

      {/* ═══ Action bar ═══ */}
      <div className="projects-actions">
        <span className="projects-actions-meta">
          <span className="projects-actions-dot" />
          TASK QUEUE · {tasks.length} ENTRIES · {counts.pending} AWAITING
        </span>
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
              TITLE · 任务标题
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="输入任务标题，回车提交"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="projects-add-input flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                autoFocus
              />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="projects-add-input"
                style={{ width: 120, cursor: "pointer" }}
              >
                <option value="urgent">紧急</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
              <button
                onClick={handleAdd}
                disabled={!title.trim()}
                className="projects-add-submit"
                style={{ width: 80, height: "100%" }}
              >
                <CornerDownLeft size={12} /> 提交
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Kanban columns ═══ */}
      {loading ? (
        <div className="dashboard-feed-empty" style={{ minHeight: 200 }}>
          <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>LOADING · AWAITING DATA...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="agents-empty">
          <div className="agents-empty-grid" />
          <div className="agents-empty-body">
            <div className="flex items-center gap-2 mb-3">
              <Radio size={14} style={{ color: "var(--muted)" }} />
              <span className="agents-eyebrow">NO SIGNAL · QUEUE EMPTY</span>
            </div>
            <p className="agents-empty-title">No tasks in the queue</p>
            <p className="agents-empty-sub">Create your first task to start tracking.</p>
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
                    <div className="tasks-column-empty mono">— EMPTY —</div>
                  ) : (
                    groupTasks.map((task: any) => {
                      const pri = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.medium;
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
                            {task.assignee_id && (
                              <span className="task-card-assignee mono">{task.assignee_id}</span>
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
