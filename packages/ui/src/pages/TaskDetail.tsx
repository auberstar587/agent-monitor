import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowLeft, Edit3, Check, X, Play, CheckCircle, XCircle, RotateCcw, Plus } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理", in_progress: "进行中", completed: "已完成", failed: "失败", cancelled: "已取消",
};
const PRIORITY_LABELS: Record<string, string> = { urgent: "紧急", high: "高", medium: "中", low: "低" };
const TYPE_LABELS: Record<string, string> = { general: "通用", bug: "缺陷", feature: "功能", review: "审查", analysis: "分析" };

// Valid transitions for each status
const TRANSITIONS: Record<string, { status: string; label: string; icon: any; color: string }[]> = {
  pending: [{ status: "in_progress", label: "开始执行", icon: Play, color: "var(--accent)" }],
  in_progress: [
    { status: "completed", label: "完成", icon: CheckCircle, color: "var(--success)" },
    { status: "failed", label: "标记失败", icon: XCircle, color: "var(--danger)" },
  ],
  failed: [{ status: "in_progress", label: "重试", icon: RotateCcw, color: "var(--warning)" }],
  cancelled: [{ status: "in_progress", label: "重新打开", icon: Play, color: "var(--accent)" }],
  completed: [],
};

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<any>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  // P8-13: labels 编辑态
  const [editingLabels, setEditingLabels] = useState(false);
  const [labelDraft, setLabelDraft] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    if (!id) return;
    api.getTask(id).then(setTask);
  }, [id]);

  if (!task) return <div className="p-6 text-sm" style={{ color: "var(--muted)" }}>加载中...</div>;

  const startEdit = (field: string, value: string) => { setEditing(field); setEditVal(value); };

  const saveEdit = async (field: string) => {
    if (!editVal.trim()) { setEditing(null); return; }
    await api.updateTask(task.id, { [field]: editVal });
    setTask({ ...task, [field]: editVal });
    setEditing(null);
  };

  const handleTransition = async (status: string) => {
    const updated = await api.transitionTask(task.id, status);
    setTask(updated);
  };

  const handleDelete = async () => {
    if (!confirm("确认删除此任务？")) return;
    await api.deleteTask(task.id);
    navigate("/tasks");
  };

  // P8-13: labels 编辑
  const startEditLabels = () => {
    setLabelDraft([...(task.labels || [])]);
    setNewLabel("");
    setEditingLabels(true);
  };
  const cancelEditLabels = () => {
    setEditingLabels(false);
    setLabelDraft([]);
    setNewLabel("");
  };
  const saveLabels = async () => {
    const cleaned = labelDraft.map((l) => l.trim()).filter(Boolean);
    await api.updateTask(task.id, { labels: cleaned });
    setTask({ ...task, labels: cleaned });
    setEditingLabels(false);
  };
  const addLabelDraft = () => {
    const v = newLabel.trim();
    if (!v) return;
    if (labelDraft.includes(v)) { setNewLabel(""); return; }
    setLabelDraft([...labelDraft, v]);
    setNewLabel("");
  };
  const removeLabelDraft = (l: string) => {
    setLabelDraft(labelDraft.filter((x) => x !== l));
  };

  const transitions = TRANSITIONS[task.status] || [];

  return (
    <div className="p-6 max-w-3xl">
      <Link to="/tasks" className="flex items-center gap-1 text-xs mb-4" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={14} /> 返回任务列表
      </Link>

      {/* Title + actions */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          {editing === "title" ? (
            <div className="flex items-center gap-1">
              <input value={editVal} onChange={(e) => setEditVal(e.target.value)}
                className="config-input text-lg font-semibold" style={{ width: "100%" }} autoFocus />
              <button onClick={() => saveEdit("title")} className="icon-btn"><Check size={14} /></button>
              <button onClick={() => setEditing(null)} className="icon-btn"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="page-title">{task.title}</h1>
              <button onClick={() => startEdit("title", task.title)} className="icon-btn"><Edit3 size={12} /></button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`status-pill ${task.status === 'completed' ? 'status-succeeded' : task.status === 'failed' ? 'status-failed' : task.status === 'in_progress' ? 'status-running' : 'status-queued'}`}>
              {STATUS_LABELS[task.status] || task.status}
            </span>
            <span className="type-badge" style={{
              color: task.priority === 'urgent' ? 'var(--danger)' : task.priority === 'high' ? 'var(--warning)' : 'var(--muted)',
              background: task.priority === 'urgent' ? 'var(--danger-bg)' : task.priority === 'high' ? 'var(--warning-bg)' : 'transparent',
            }}>
              {PRIORITY_LABELS[task.priority] || task.priority}
            </span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>{TYPE_LABELS[task.type] || task.type}</span>
          </div>
        </div>
      </div>

      {/* Transition buttons */}
      {transitions.length > 0 && (
        <div className="flex items-center gap-2 mb-6">
          {transitions.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.status} onClick={() => handleTransition(t.status)}
                className="button text-xs flex items-center gap-1.5"
                style={{ borderColor: t.color, color: t.color }}>
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
          <button onClick={handleDelete} className="button text-xs" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            <XCircle size={13} /> 删除
          </button>
        </div>
      )}

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="content-card p-4">
          <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>描述</div>
          {editing === "description" ? (
            <div className="flex items-start gap-1">
              <textarea value={editVal} onChange={(e) => setEditVal(e.target.value)}
                className="config-input text-xs" rows={3} autoFocus />
              <button onClick={() => saveEdit("description")} className="icon-btn mt-1"><Check size={14} /></button>
              <button onClick={() => setEditing(null)} className="icon-btn mt-1"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="text-sm" style={{ color: task.description ? "var(--text)" : "var(--muted)" }}>
                {task.description || "暂无描述"}
              </p>
              <button onClick={() => startEdit("description", task.description || "")} className="icon-btn shrink-0"><Edit3 size={12} /></button>
            </div>
          )}
        </div>
        <div className="content-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--muted)" }}>元数据</div>
          </div>
          <div className="text-xs space-y-1.5" style={{ color: "var(--text-secondary)" }}>
            <div>类型: {TYPE_LABELS[task.type] || task.type}</div>
            <div>指派人: {task.assignee_id || "未分配"}</div>
            <div>创建: {new Date(task.created_at).toLocaleString("zh-CN")}</div>
            {task.started_at && <div>开始: {new Date(task.started_at).toLocaleString("zh-CN")}</div>}
            {task.completed_at && <div>完成: {new Date(task.completed_at).toLocaleString("zh-CN")}</div>}

            {/* P8-13: labels 区域 */}
            <div className="mt-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--muted)" }}>标签</span>
                {!editingLabels && (
                  <button
                    type="button"
                    onClick={startEditLabels}
                    className="icon-btn"
                    style={{ width: 22, height: 22 }}
                    title="编辑标签"
                  >
                    <Edit3 size={10} />
                  </button>
                )}
              </div>
              {editingLabels ? (
                <div>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {labelDraft.length === 0 && (
                      <span className="text-[11px]" style={{ color: "var(--muted)" }}>暂无标签</span>
                    )}
                    {labelDraft.map((l) => (
                      <span key={l} className="tech-badge flex items-center gap-1">
                        {l}
                        <button
                          type="button"
                          onClick={() => removeLabelDraft(l)}
                          className="icon-btn"
                          style={{ width: 16, height: 16, padding: 0 }}
                          title="移除"
                        >
                          <X size={9} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      placeholder="新标签"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addLabelDraft(); }
                      }}
                      className="form-input"
                      style={{ fontSize: 11, padding: "2px 6px", flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={addLabelDraft}
                      className="icon-btn"
                      style={{ width: 24, height: 24, color: "var(--accent)" }}
                      title="添加"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      type="button"
                      onClick={saveLabels}
                      className="button text-[11px]"
                      style={{ padding: "2px 10px", height: 24 }}
                    >
                      <Check size={11} /> 保存
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditLabels}
                      className="button text-[11px]"
                      style={{ padding: "2px 10px", height: 24 }}
                    >
                      <X size={11} /> 取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {(!task.labels || task.labels.length === 0) ? (
                    <span className="text-[11px]" style={{ color: "var(--muted)" }}>暂无标签</span>
                  ) : (
                    task.labels.map((l: string) => <span key={l} className="tech-badge">{l}</span>)
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trace */}
      {task.trace && (
        <div>
          <h3 className="section-title mb-3">关联执行轨迹</h3>
          <Link to={`/traces/${task.trace.task_id}`} className="list-row no-underline cursor-pointer">
            <span className={`status-pill ${task.trace.status === 'completed' ? 'status-succeeded' : 'status-failed'}`}>
              {task.trace.status}
            </span>
            <span className="text-sm flex-1" style={{ color: "var(--text)" }}>{task.trace.title || task.trace.task_id}</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {task.trace.input_tokens + task.trace.output_tokens > 0 ? `${task.trace.input_tokens + task.trace.output_tokens} tokens` : ""}
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
