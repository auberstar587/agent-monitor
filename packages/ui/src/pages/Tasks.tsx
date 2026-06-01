import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ListTodo, Plus, CheckCircle, Play, XCircle } from "lucide-react";

const STATUS_GROUPS = ["pending", "in_progress", "completed", "failed", "cancelled"];
const STATUS_LABELS: Record<string, string> = {
  pending: "待处理", in_progress: "进行中", completed: "已完成", failed: "失败", cancelled: "已取消",
};
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const navigate = useNavigate();

  const load = () => api.listTasks().then(setTasks).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!title.trim()) return;
    await api.createTask({ title, priority });
    setTitle("");
    setShowAdd(false);
    load();
  };

  // Group tasks by status, respecting priority order
  const grouped = STATUS_GROUPS.map((status) => ({
    status,
    label: STATUS_LABELS[status] || status,
    tasks: tasks.filter((t) => t.status === status).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)),
  }));

  return (
    <div>
      {/* Actions */}
      <div className="flex items-center justify-end">
        <button className="button button-primary" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={14} /> 创建任务
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="content-card p-4 mb-5">
          <div className="flex gap-2 mb-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="任务标题" className="config-input flex-1 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()} autoFocus />
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="config-input text-xs" style={{ width: 100 }}>
              <option value="urgent">紧急</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
            <button onClick={handleAdd} className="button button-primary text-xs">创建</button>
          </div>
        </div>
      )}

      {/* Kanban-style columns */}
      {loading ? (
        <div className="text-sm py-12 text-center" style={{ color: "var(--muted)" }}>加载中...</div>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <ListTodo size={32} style={{ color: "var(--muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>暂无任务</p>
          <p className="text-xs mt-1">创建你的第一个任务</p>
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {grouped.map(({ status, label, tasks: groupTasks }) => (
            <div key={status} className="content-card overflow-hidden">
              <div className="px-4 py-3 border-b text-xs font-semibold flex items-center gap-2"
                style={{ borderColor: "var(--line)", color: "var(--text-secondary)" }}>
                {label} <span style={{ color: "var(--muted)" }}>({groupTasks.length})</span>
              </div>
              <div className="p-3 space-y-2 min-h-[120px]">
                {groupTasks.length === 0 ? (
                  <div className="text-[11px] py-3 text-center" style={{ color: "var(--muted)" }}>—</div>
                ) : (
                  groupTasks.map((task) => (
                    <Link key={task.id} to={`/tasks/${task.id}`}
                      className="block p-3 rounded-lg no-underline transition-colors"
                      style={{ background: "var(--bg-card-hover)", border: "1px solid var(--line)" }}>
                      <div className="text-[13px] font-medium mb-1.5" style={{ color: "var(--text)" }}>{task.title}</div>
                      <div className="flex items-center gap-1.5">
                        {task.priority === "urgent" && <span className="type-badge type-decision" style={{ fontSize: 9 }}>紧急</span>}
                        {task.priority === "high" && <span className="type-badge type-experience" style={{ fontSize: 9 }}>高</span>}
                        {task.priority === "low" && <span className="type-badge type-context" style={{ fontSize: 9 }}>低</span>}
                        {task.assignee_id && (
                          <span className="text-[9px]" style={{ color: "var(--muted)" }}>{task.assignee_id}</span>
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
