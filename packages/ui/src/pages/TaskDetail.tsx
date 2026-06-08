import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import CustomSelect from "../components/CustomSelect";
import { ArrowLeft, Edit3, Check, X, Play, CheckCircle, XCircle, RotateCcw, Ban, Loader2, Plus } from "lucide-react";

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
  // failed 状态的重跑应走下方执行面板，直接调用 /execute，而不是只把状态切到 in_progress。
  failed: [],
  cancelled: [],
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

  // autoexec 参数：从 Dashboard 快捷任务跳转时自动执行
  const [searchParams] = useSearchParams();
  const autoexec = searchParams.get("autoexec");
  const autoexecDone = useRef(false);

  const loadTask = useCallback(async () => {
    if (!id) return null;
    const next = await api.getTask(id);
    setTask(next);
    return next;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    loadTask().catch((err: any) => setError(err?.message || "任务加载失败"));
  }, [id, loadTask]);

  useEffect(() => {
    if (!id || !task) return;
    const traceRunning = task.trace?.status === "running";
    if (task.status !== "in_progress" && !traceRunning && !executing) return;
    const timer = window.setInterval(() => {
      loadTask().catch(() => {});
    }, 2500);
    return () => window.clearInterval(timer);
  }, [id, task?.status, task?.trace?.status, executing, loadTask]);

  // autoexec：从 Dashboard 快捷任务跳转时自动执行
  useEffect(() => {
    if (!autoexec || autoexecDone.current || !task) return;
    if (task.status !== "pending" && task.status !== "failed") return;
    autoexecDone.current = true;
    handleExecute(autoexec);
  }, [autoexec, task]);

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
  const handleExecute = async (engineOverride?: string) => {
    const engine = engineOverride ?? execEngine;
    setExecuting(true);
    setExecOutput([]);
    try {
      const res = await api.executeTask(task.id, engine);
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
              await loadTask();
            } else if (eventType === "error") {
              setExecOutput(prev => [...prev, `❌ ${data.error}`]);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setExecOutput(prev => [...prev, `❌ ${err?.message || "执行失败"}`]);
    } finally {
      await loadTask().catch(() => {});
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
  const trace = task.trace;
  const traceToolCalls = trace?.tool_calls ?? [];
  const traceStatusClass =
    trace?.status === "completed" ? "status-succeeded"
    : trace?.status === "failed" ? "status-failed"
    : trace?.status === "running" ? "status-running"
    : "status-queued";
  const persistedOutput = trace?.summary ? [trace.summary] : [];
  const displayOutput = execOutput.length > 0 ? execOutput : persistedOutput;

  const project = task.project_id ? projects.find((p: any) => p.id === task.project_id) : null;
  const priorityColor =
    task.priority === 'urgent' ? 'var(--danger)' :
    task.priority === 'high' ? 'var(--warning)' :
    'var(--muted)';
  const priorityBg =
    task.priority === 'urgent' ? 'var(--danger-bg)' :
    task.priority === 'high' ? 'var(--warning-bg)' :
    'transparent';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* === Fixed header: title+description on first row, breadcrumb on second === */}
      <div className="shrink-0 task-detail-header">
        {/* Title + description row */}
        <div className="shrink-0" style={{ marginBottom: 8 }}>
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
              {task.description ? (
                <>
                  <span className="text-sm" style={{ color: "var(--text-secondary)", cursor: "pointer" }} onClick={() => startEdit("description", task.description)}>— {task.description}</span>
                  <button onClick={() => startEdit("description", task.description)} className="icon-btn" title="编辑描述"><Edit3 size={12} /></button>
                </>
              ) : (
                <span className="text-sm" style={{ color: "var(--muted)", cursor: "pointer" }} onClick={() => { setEditing("description"); setEditVal(""); }}>— 添加描述</span>
              )}
              <button onClick={() => startEdit("title", task.title)} className="icon-btn" title="编辑标题"><Edit3 size={12} /></button>
            </div>
          )}
          {editing === "description" && (
            <div className="flex items-start gap-1 mt-1">
              <textarea value={editVal} onChange={(e) => setEditVal(e.target.value)}
                className="config-input text-xs" rows={2} style={{ width: "100%" }} autoFocus />
              <button onClick={() => saveEdit("description")} className="icon-btn mt-1"><Check size={14} /></button>
              <button onClick={() => setEditing(null)} className="icon-btn mt-1"><X size={14} /></button>
            </div>
          )}
        </div>

        {/* Breadcrumb row */}
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Link to="/tasks" className="flex items-center gap-1 hover:opacity-80" style={{ color: "var(--muted)" }}>
            <ArrowLeft size={13} /> 返回任务列表
          </Link>
          {project && (
            <>
              <span style={{ color: "var(--line-strong)" }}>/</span>
              <Link
                to={`/projects/${task.project_id}`}
                className="flex items-center gap-1 hover:opacity-80"
                style={{ color: "var(--accent)" }}
              >
                📁 {project.name}
              </Link>
            </>
          )}
          <span className="ml-auto" style={{ color: "var(--text-secondary)" }}>
            #{task.id?.slice?.(0, 8) || task.id}
          </span>
        </div>
      </div>

      {/* === Scrollable content === */}
      <div className="flex-1 min-h-0 overflow-y-auto task-detail-scroll">

      {/* === Status / Priority / Type strip (scrolls with content) === */}
      <div className="flex items-center flex-wrap gap-2" style={{ marginBottom: 14 }}>
        <span className={`status-pill ${task.status === 'completed' ? 'status-succeeded' : task.status === 'failed' ? 'status-failed' : task.status === 'in_progress' ? 'status-running' : 'status-queued'}`}>
          {STATUS_LABELS[task.status] || task.status}
        </span>
        <CustomSelect
          style={{ color: priorityColor, background: priorityBg, minHeight: 30 }}
          value={task.priority}
          onChange={(value) => handleUpdate({ priority: value })}
          options={PRIORITY_OPTIONS}
          title="优先级"
          variant="badge"
        />
        <CustomSelect
          style={{ width: 88, minHeight: 30 }}
          value={task.type}
          onChange={(value) => handleUpdate({ type: value })}
          options={TYPE_OPTIONS}
          title="类型"
          variant="badge"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={handleDelete} className="button text-xs flex items-center gap-1" style={{ borderColor: "var(--danger)", color: "var(--danger)", minHeight: 30, padding: "0 12px" }} title="删除">
            <XCircle size={12} /> 删除
          </button>
        </div>
      </div>

      {error && (
        <div className="chat-error" role="alert" style={{ marginBottom: 14 }}>
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 opacity-70 hover:opacity-100"
            style={{ fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* === Main content stack === */}

      {/* 执行控制区 — pending 首次执行，failed 重跑，completed 再次执行；in_progress 状态展示 transition 按钮 */}
      {(task.status === "pending" || task.status === "failed" || task.status === "completed" || task.status === "in_progress" || task.status === "cancelled") && (
        <div className="content-card p-4">
          <div className="flex items-center gap-2 flex-wrap">
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
              style={{ minWidth: 140, height: 30 }}
            />
            {(task.status === "pending" || task.status === "failed" || task.status === "completed") && (
              <button
                onClick={() => handleExecute()}
                disabled={executing}
                className="button button-primary text-xs flex items-center gap-1"
                style={{ padding: "0 14px" }}
              >
                {executing
                  ? <><Loader2 size={12} style={{ animation: "agents-spin 1s linear infinite" }} /> 执行中…</>
                  : <>{task.status === "failed" ? <RotateCcw size={12} /> : <Play size={12} />} {task.status === "failed" ? "重新执行" : task.status === "completed" ? "再次执行" : "开始执行"}</>}
              </button>
            )}
            {transitions.length > 0 && <span style={{ width: 1, height: 20, background: "var(--line)" }} />}
            {transitions.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.status} onClick={() => handleTransition(t.status)}
                  className="button text-xs flex items-center gap-1.5"
                  style={{ borderColor: t.color, color: t.color, padding: "0 12px" }}>
                  <Icon size={12} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 输出展示区 — SSE 输出和已落库 trace 都展示，避免运行中/失败后空白 */}
      {(displayOutput.length > 0 || trace?.error_message || traceToolCalls.length > 0 || trace?.status === "running") && (
        <div className="content-card p-4">
          <div className="flex items-center gap-4">
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
              {executing || trace?.status === "running" ? "执行中" : "执行过程记录"}
            </span>
            {trace?.status && (
              <span className={`status-pill ${traceStatusClass}`} style={{ fontSize: 11 }}>
                {trace.status}
              </span>
            )}
            {(executing || trace?.status === "running") && <Loader2 size={12} style={{ animation: "agents-spin 1s linear infinite", color: "var(--muted)" }} />}
            {trace?.task_id && (
              <Link to={`/traces/${trace.task_id}`} className="text-xs ml-auto" style={{ color: "var(--accent)" }}>
                查看完整轨迹
              </Link>
            )}
          </div>
          {trace?.error_message && (
            <div className="chat-error" role="alert" style={{ whiteSpace: "pre-wrap", marginTop: 20, marginBottom: 20 }}>
              {trace.error_message}
            </div>
          )}
          <div style={{
            marginTop: 20,
            background: "var(--paper-strong)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 16px",
            maxHeight: 320,
            overflowY: "auto",
            fontFamily: "var(--mono)",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            color: "var(--text-secondary)",
          }}>
            {displayOutput.length > 0
              ? displayOutput.map((line, i) => <div key={i}>{line}</div>)
              : <span style={{ color: "var(--muted)" }}>执行已开始，等待 Agent 输出…</span>}
            {(executing || trace?.status === "running") && <span style={{ opacity: 0.6 }}>▊</span>}
          </div>
          {traceToolCalls.length > 0 && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--muted)" }}>
                工具调用 · {traceToolCalls.length}
              </div>
              {traceToolCalls.slice(-6).map((call: any, i: number) => (
                <div key={`${call.seq ?? i}-${call.tool_name ?? "tool"}`} className="list-row" style={{ padding: "10px 14px", minHeight: 0 }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                    #{String(call.seq ?? i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text)", flex: 1 }}>
                    {call.tool_name || call.type || "tool"}
                  </span>
                  {call.error_text && <span className="text-xs" style={{ color: "var(--danger)" }}>失败</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail card — quick nav + metadata */}
      <div className="content-card p-4">
        {/* Quick nav — useful when scrolled down far */}
        <div className="flex items-center gap-4 text-xs" style={{ color: "var(--muted)" }}>
          <Link to="/tasks" className="flex items-center gap-1 hover:opacity-80" style={{ color: "var(--accent)" }}>
            ← 任务列表
          </Link>
          {task.trace && (
            <Link to={`/traces/${task.trace.task_id}`} className="flex items-center gap-1 hover:opacity-80" style={{ color: "var(--accent)" }}>
              查看执行轨迹
            </Link>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 14 }}>
          <div className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--muted)" }}>元数据</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            <div className="flex items-center gap-2">
              <span className="shrink-0" style={{ minWidth: 56, color: "var(--muted)" }}>创建</span>
              <span>{new Date(task.created_at).toLocaleString("zh-CN")}</span>
            </div>
            {task.started_at && (
              <div className="flex items-center gap-2">
                <span className="shrink-0" style={{ minWidth: 56, color: "var(--muted)" }}>开始</span>
                <span>{new Date(task.started_at).toLocaleString("zh-CN")}</span>
              </div>
            )}
            {task.completed_at && (
              <div className="flex items-center gap-2">
                <span className="shrink-0" style={{ minWidth: 56, color: "var(--muted)" }}>完成</span>
                <span>{new Date(task.completed_at).toLocaleString("zh-CN")}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="shrink-0" style={{ minWidth: 56, color: "var(--muted)" }}>指派人</span>
              <CustomSelect
                value={task.assignee_id || ""}
                onChange={(value) => handleUpdate({ assignee_id: value || null })}
                options={[
                  { value: "", label: "未分配" },
                  ...agents.map((a: any) => ({ value: a.id, label: `${a.name} (${a.platform})` })),
                ]}
                className="flex-1"
                style={{ height: 32 }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0" style={{ minWidth: 56, color: "var(--muted)" }}>项目</span>
              <CustomSelect
                value={task.project_id || ""}
                onChange={(value) => handleUpdate({ project_id: value || null })}
                options={[
                  { value: "", label: "未指定" },
                  ...projects.map((p: any) => ({ value: p.id, label: p.name })),
                ]}
                className="flex-1"
                style={{ height: 32 }}
              />
            </div>
          </div>

          {/* P8-13: labels 区域 */}
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--muted)" }}>标签</span>
              {!editingLabels && (
                <button
                  type="button"
                  onClick={startEditLabels}
                  className="icon-btn"
                  style={{ width: 26, height: 26 }}
                  title="编辑标签"
                >
                  <Edit3 size={12} />
                </button>
              )}
            </div>
            {editingLabels ? (
              <div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {labelDraft.length === 0 && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>暂无标签</span>
                  )}
                  {labelDraft.map((l) => (
                    <span key={l} className="tech-badge flex items-center gap-1">
                      {l}
                      <button
                        type="button"
                        onClick={() => { setLabelDraft(labelDraft.filter((x) => x !== l)); }}
                        className="icon-btn"
                        style={{ width: 18, height: 18, padding: 0 }}
                        title="移除"
                      >
                        <X size={11} />
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
                    style={{ fontSize: 12, padding: "4px 8px", flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => { const v = newLabel.trim(); if (v && !labelDraft.includes(v)) { setLabelDraft([...labelDraft, v]); setNewLabel(""); } }}
                    className="icon-btn"
                    style={{ width: 28, height: 28, color: "var(--accent)" }}
                    title="添加"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  <button type="button" onClick={saveLabels} className="button text-xs" style={{ padding: "4px 10px", height: 28 }}>
                    <Check size={12} /> 保存
                  </button>
                  <button type="button" onClick={cancelEditLabels} className="button text-xs" style={{ padding: "4px 10px", height: 28 }}>
                    <X size={12} /> 取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {(!task.labels || task.labels.length === 0) ? (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>暂无标签</span>
                ) : (
                  task.labels.map((l: string) => <span key={l} className="tech-badge">{l}</span>)
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trace — only status badge + link; summary/error live in the output block above */}
      {task.trace && (
        <div>
          <h3 className="section-title mb-3">关联执行轨迹</h3>
          <Link
            to={`/traces/${task.trace.task_id}`}
            className="list-row no-underline cursor-pointer"
          >
            <span className={`status-pill ${task.trace.status === 'completed' ? 'status-succeeded' : task.trace.status === 'running' ? 'status-running' : 'status-failed'}`}>
              {task.trace.status === "running" ? "运行中" : task.trace.status === "completed" ? "已完成" : "失败"}
            </span>
            <span className="text-sm flex-1" style={{ color: "var(--text)" }}>{task.trace.title || task.trace.task_id}</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {(task.trace.input_tokens ?? 0) + (task.trace.output_tokens ?? 0) > 0 ? `${(task.trace.input_tokens ?? 0) + (task.trace.output_tokens ?? 0)} tokens` : "查看详情"}
            </span>
          </Link>
        </div>
      )}
    </div>
    </div>
  );
}
