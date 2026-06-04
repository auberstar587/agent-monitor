import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import CustomSelect from "../components/CustomSelect";
import { ArrowLeft, Edit3, Check, X, Play, CheckCircle, XCircle, RotateCcw, Ban, Rocket, Loader2, Plus } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理", in_progress: "进行中", completed: "已完成", failed: "失败", cancelled: "已取消",
};
const PRIORITY_LABELS: Record<string, string> = { urgent: "紧急", high: "高", medium: "中", low: "低" };
const TYPE_LABELS: Record<string, string> = { general: "通用", bug: "缺陷", feature: "功能", review: "审查", analysis: "分析" };
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }));
const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

// Valid transitions for each status (kept in sync with server task-manager.ts VALID_TRANSITIONS)
const TRANSITIONS: Record<string, { status: string; label: string; icon: any; color: string }[]> = {
  pending: [
    // 真正的执行通过下方"执行面板"的引擎调用完成，状态会自动转为 in_progress
    // 此处只保留"取消"操作，避免与执行按钮重复
    { status: "cancelled", label: "取消", icon: Ban, color: "var(--muted)" },
  ],
  in_progress: [
    { status: "completed", label: "完成", icon: CheckCircle, color: "var(--success)" },
    { status: "failed", label: "标记失败", icon: XCircle, color: "var(--danger)" },
    { status: "cancelled", label: "取消", icon: Ban, color: "var(--muted)" },
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
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [execEngine, setExecEngine] = useState("claude-code");
  const [execOutput, setExecOutput] = useState<string[]>([]);
  const [engines, setEngines] = useState<{id: string; label: string; installed: boolean}[]>([]);
  // P8-13: labels 编辑态
  const [editingLabels, setEditingLabels] = useState(false);
  const [labelDraft, setLabelDraft] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    api.getTask(id).then(setTask);
  }, [id]);

  useEffect(() => {
    api.listEngines().then(setEngines).catch(() => {});
  }, []);

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {});
  }, []);

  // 加载项目列表
  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {});
  }, []);

  if (!task) return <div className="p-6 text-sm" style={{ color: "var(--muted)" }}>加载中...</div>;

  const startEdit = (field: string, value: string) => { setEditing(field); setEditVal(value); };

  const saveEdit = async (field: string) => {
    if (!editVal.trim()) { setEditing(null); return; }
    await api.updateTask(task.id, { [field]: editVal });
    setTask({ ...task, [field]: editVal });
    setEditing(null);
  };

  const handleTransition = async (status: string) => {
    setError(null);
    try {
      const updated = await api.transitionTask(task.id, status);
      setTask(updated);
    } catch (err: any) {
      setError(err?.message || "状态转换失败");
    }
  };

  const handleDelete = async () => {
    if (!confirm("确认删除此任务？")) return;
    await api.deleteTask(task.id);
    navigate("/tasks");
  };

  // P8-14: 直接编辑 type/priority/assignee（P8-16 错误提示通用此 handler）
  const handleUpdate = async (patch: Record<string, any>) => {
    setError(null);
    try {
      const updated = await api.updateTask(task.id, patch);
      setTask(updated);
    } catch (err: any) {
      setError(err?.message || "保存失败");
    }
  };

  // SSE 执行处理
  const handleExecute = async () => {
    setExecuting(true);
    setExecOutput([]);
    try {
      const res = await api.executeTask(task.id, execEngine);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = "message";
          let dataStr = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "message" && data.type === "text" && data.content) {
              setExecOutput(prev => [...prev, data.content]);
            } else if (eventType === "message" && data.type === "tool_use") {
              setExecOutput(prev => [...prev, `▸ ${data.tool || "tool"}(${data.input ? JSON.stringify(data.input).slice(0, 80) : ""})`]);
            } else if (eventType === "done") {
              const updated = await api.getTask(task.id);
              setTask(updated);
            } else if (eventType === "error") {
              setExecOutput(prev => [...prev, `❌ ${data.error}`]);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setExecOutput(prev => [...prev, `❌ ${err?.message || "执行失败"}`]);
    } finally {
      setExecuting(false);
    }
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
      <div className="flex items-center mb-4">
        <Link to="/tasks" className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
          <ArrowLeft size={14} /> 返回任务列表
        </Link>
        {task.project_id && (() => {
          const proj = projects.find((p: any) => p.id === task.project_id);
          return proj ? (
            <Link
              to={`/projects/${task.project_id}`}
              className="flex items-center gap-1 text-xs ml-4"
              style={{ color: "var(--accent)" }}
            >
              📁 {proj.name}
            </Link>
          ) : null;
        })()}
      </div>

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
            <CustomSelect
              style={{
                color: task.priority === 'urgent' ? 'var(--danger)' : task.priority === 'high' ? 'var(--warning)' : 'var(--muted)',
                background: task.priority === 'urgent' ? 'var(--danger-bg)' : task.priority === 'high' ? 'var(--warning-bg)' : 'transparent',
              }}
              value={task.priority}
              onChange={(value) => handleUpdate({ priority: value })}
              options={PRIORITY_OPTIONS}
              title="优先级"
              variant="badge"
            />
            <CustomSelect
              style={{ width: 88 }}
              value={task.type}
              onChange={(value) => handleUpdate({ type: value })}
              options={TYPE_OPTIONS}
              title="类型"
              variant="badge"
            />
          </div>
        </div>
      </div>

      {/* Transition buttons */}
      {error && (
        <div className="chat-error mb-3" role="alert">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 opacity-70 hover:opacity-100"
            style={{ fontSize: 10 }}
          >
            ✕
          </button>
        </div>
      )}
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

      {/* 执行控制区 — 仅 pending/failed 状态显示（用于引擎选择和启动执行） */}
      {(task.status === "pending" || task.status === "failed") && (
        <div className="content-card p-4 mb-6">
          <div className="flex items-center gap-2">
            <Rocket size={14} style={{ color: "var(--accent)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>执行任务</span>
            <CustomSelect
              value={execEngine}
              onChange={setExecEngine}
              options={engines.length === 0
                ? [{ value: "claude-code", label: "Claude Code" }]
                : engines.map((eng) => ({
                  value: eng.id,
                  label: `${eng.label}${!eng.installed ? " (未安装)" : ""}`,
                  disabled: !eng.installed,
                }))}
              style={{ minWidth: 140, height: 28 }}
            />
            <button
              onClick={handleExecute}
              disabled={executing}
              className="button button-primary text-xs flex items-center gap-1"
              style={{ padding: "4px 12px" }}
            >
              {executing ? <><Loader2 size={12} style={{ animation: "agents-spin 1s linear infinite" }} /> 执行中…</> : <><Play size={12} /> 开始执行</>}
            </button>
          </div>
        </div>
      )}

      {/* 输出展示区 — 只要有 execOutput 就始终显示（不随状态变化而隐藏） */}
      {execOutput.length > 0 && (
        <div className="content-card p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
              {executing ? "执行输出" : "执行记录"}
            </span>
            {executing && <Loader2 size={12} style={{ animation: "agents-spin 1s linear infinite", color: "var(--muted)" }} />}
          </div>
          <div style={{
            background: "var(--paper-strong)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            maxHeight: 300,
            overflowY: "auto",
            fontFamily: "var(--mono)",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            color: "var(--text-secondary)",
          }}>
            {execOutput.map((line, i) => <div key={i}>{line}</div>)}
            {executing && <span style={{ opacity: 0.6 }}>▊</span>}
          </div>
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
            <div>创建: {new Date(task.created_at).toLocaleString("zh-CN")}</div>
            {task.started_at && <div>开始: {new Date(task.started_at).toLocaleString("zh-CN")}</div>}
            {task.completed_at && <div>完成: {new Date(task.completed_at).toLocaleString("zh-CN")}</div>}
            <div className="flex items-center gap-1.5">
              <span style={{ minWidth: 50 }}>指派人:</span>
              <CustomSelect
                value={task.assignee_id || ""}
                onChange={(value) => handleUpdate({ assignee_id: value || null })}
                options={[
                  { value: "", label: "未分配" },
                  ...agents.map((a: any) => ({ value: a.id, label: `${a.name} (${a.platform})` })),
                ]}
                className="flex-1"
                style={{ height: 26 }}
              />
            </div>

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
                          onClick={() => { setLabelDraft(labelDraft.filter((x) => x !== l)); }}
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
                        if (e.key === "Enter") { e.preventDefault(); const v = newLabel.trim(); if (v && !labelDraft.includes(v)) { setLabelDraft([...labelDraft, v]); setNewLabel(""); } }
                      }}
                      className="form-input"
                      style={{ fontSize: 11, padding: "2px 6px", flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => { const v = newLabel.trim(); if (v && !labelDraft.includes(v)) { setLabelDraft([...labelDraft, v]); setNewLabel(""); } }}
                      className="icon-btn"
                      style={{ width: 24, height: 24, color: "var(--accent)" }}
                      title="添加"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <button type="button" onClick={saveLabels} className="button text-[11px]" style={{ padding: "2px 10px", height: 24 }}>
                      <Check size={11} /> 保存
                    </button>
                    <button type="button" onClick={cancelEditLabels} className="button text-[11px]" style={{ padding: "2px 10px", height: 24 }}>
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
            <div className="flex items-center gap-1.5">
              <span style={{ minWidth: 50 }}>项目:</span>
              <CustomSelect
                value={task.project_id || ""}
                onChange={(value) => handleUpdate({ project_id: value || null })}
                options={[
                  { value: "", label: "未指定" },
                  ...projects.map((p: any) => ({ value: p.id, label: p.name })),
                ]}
                className="flex-1"
                style={{ height: 26 }}
              />
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
