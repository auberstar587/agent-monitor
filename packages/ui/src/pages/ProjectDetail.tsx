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

/* ── Status channel colours ── */
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

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [relations, setRelations] = useState<any[]>([]);
  const [outputs, setOutputs] = useState<any[]>([]);
  const [projectTasks, setProjectTasks] = useState<any[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [tick, setTick] = useState(0);
  // P8-01/02 数组编辑暂存
  const [editArr, setEditArr] = useState<string[]>([]);
  // P8-04 添加关系内联表单
  const [showAddRel, setShowAddRel] = useState(false);
  const [relTarget, setRelTarget] = useState("");
  const [relType, setRelType] = useState("dependency");
  const [relDesc, setRelDesc] = useState("");
  const [allProjects, setAllProjects] = useState<any[]>([]);
  // 新建任务内联表单
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

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
    // 加载项目任务列表
    api.listTasks({ project_id: id }).then(setProjectTasks).catch(() => {});
  }, [id]);

  // 1 Hz heartbeat for relative timestamps
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

  const startEdit = (field: string, value: string) => {
    setEditing(field);
    setEditVal(value);
  };
  const saveEdit = async (field: string) => {
    if (!editVal.trim()) {
      setEditing(null);
      return;
    }
    await api.updateProject(project.id, { [field]: editVal });
    setProject({ ...project, [field]: editVal });
    setEditing(null);
  };
  const cancelEdit = () => setEditing(null);

  // P8-01: 编辑 tech_stack 数组
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

  // P8-03: 状态切换
  const handleStatusChange = async (newStatus: string) => {
    await api.updateProject(project.id, { status: newStatus });
    setProject({ ...project, status: newStatus });
  };

  // P8-04: 添加关系
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

  // P8-06: 删除项目
  const handleDelete = async () => {
    if (!confirm(`确定删除项目 "${project.name}"？关联数据将保留。`)) return;
    await api.deleteProject(project.id);
    navigate("/projects");
  };

  // 新建任务
  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    await api.createTask({ title: newTaskTitle.trim(), project_id: project.id });
    setNewTaskTitle("");
    setShowAddTask(false);
    api.listTasks({ project_id: project.id }).then(setProjectTasks).catch(() => {});
  };

  return (
    <div className="pd-page">
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

      {/* ═══ Back nav ═══ */}
      <Link to="/projects" className="pd-back">
        <ArrowLeft size={13} />
        <span className="mono">返回项目列表</span>
      </Link>

      {/* ═══ Header card with status rail ═══ */}
      <div className="pd-header-card" style={{ "--ch": ch.color } as any}>
        <div className="pd-header-rail" />
        <div className="pd-header-body">
          {/* Name */}
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
          </div>

          {editing === "name" ? (
            <div className="pd-edit-row">
              <input
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                className="pd-edit-input"
                autoFocus
              />
              <button onClick={() => saveEdit("name")} className="icon-btn">
                <Check size={14} />
              </button>
              <button onClick={cancelEdit} className="icon-btn">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="pd-title-row">
              <h1 className="pd-title">{project.name}</h1>
              <button
                onClick={() => startEdit("name", project.name)}
                className="icon-btn"
                title="编辑名称"
              >
                <Edit3 size={12} />
              </button>
            </div>
          )}

          {/* Path + status pill */}
          <div className="pd-path-row">
            <MapPin size={11} style={{ color: "var(--muted)" }} />
            <span className="mono pd-path-text">{project.path}</span>
          </div>
        </div>
      </div>

      {/* ═══ Meta grid ═══ */}
      <div className="pd-meta-grid">
        {/* Description */}
        <div className="pd-meta-card">
          <div className="pd-meta-label">
            <Layers size={11} /> 描述
          </div>
          {editing === "description" ? (
            <div className="pd-edit-col">
              <textarea
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                className="pd-edit-textarea"
                rows={3}
                autoFocus
              />
              <div className="pd-edit-actions">
                <button
                  onClick={() => saveEdit("description")}
                  className="icon-btn"
                >
                  <Check size={14} />
                </button>
                <button onClick={cancelEdit} className="icon-btn">
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="pd-desc-body">
              <p
                className="pd-desc-text"
                style={{
                  color: project.description ? "var(--text)" : "var(--muted)",
                }}
              >
                {project.description || "NO DESCRIPTION ON FILE"}
              </p>
              <button
                onClick={() =>
                  startEdit("description", project.description || "")
                }
                className="icon-btn"
                title="编辑"
              >
                <Edit3 size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Tech Stack */}
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
                  <input
                    value={t}
                    onChange={(e) => {
                      const next = [...editArr];
                      next[i] = e.target.value;
                      setEditArr(next);
                    }}
                    className="bg-transparent border-none outline-none"
                    style={{ width: Math.max(t.length * 7, 30) }}
                  />
                  <button onClick={() => setEditArr(editArr.filter((_, j) => j !== i))} className="icon-btn" style={{ padding: 0 }}>
                    <X size={9} />
                  </button>
                </span>
              ))}
              <span className="tech-badge mono flex items-center gap-1" style={{ background: "var(--bg-elevated)" }}>
                <input
                  value=""
                  onChange={(e) => e.target.value && setEditArr([...editArr, e.target.value])}
                  placeholder="+ 添加"
                  className="bg-transparent border-none outline-none"
                  style={{ width: 60 }}
                />
              </span>
              <div className="flex gap-1 ml-2">
                <button onClick={() => saveEditArray("tech_stack")} className="icon-btn" title="保存">
                  <Check size={12} />
                </button>
                <button onClick={cancelEdit} className="icon-btn" title="取消">
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (project.tech_stack || []).length > 0 ? (
            <div className="pd-tech-list">
              {(project.tech_stack || []).map((t: string) => (
                <span key={t} className="tech-badge mono">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <span className="mono pd-empty">未检测</span>
          )}
        </div>

        {/* Goals */}
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
                  <input
                    value={g}
                    onChange={(e) => {
                      const next = [...editArr];
                      next[i] = e.target.value;
                      setEditArr(next);
                    }}
                    className="config-input text-xs flex-1"
                  />
                  <button onClick={() => setEditArr(editArr.filter((_, j) => j !== i))} className="icon-btn" style={{ padding: 0 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-1">
                <input
                  value=""
                  onChange={(e) => e.target.value && setEditArr([...editArr, e.target.value])}
                  placeholder="+ 添加目标"
                  className="config-input text-xs flex-1"
                />
              </div>
              <div className="flex gap-1 mt-2">
                <button onClick={() => saveEditArray("goals")} className="icon-btn" title="保存">
                  <Check size={12} />
                </button>
                <button onClick={cancelEdit} className="icon-btn" title="取消">
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (project.goals || []).length > 0 ? (
            <div className="pd-goals-list">
              {(project.goals || []).map((g: string, i: number) => (
                <div key={i} className="pd-goal-item">
                  <span className="pd-goal-index mono">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="pd-goal-dash">╌</span>
                  <span className="pd-goal-text">{g}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="mono pd-empty">未设置目标</span>
          )}
        </div>

        {/* Timestamps */}
        <div className="pd-meta-card">
          <div className="pd-meta-label">
            <Clock size={11} /> 时间线
          </div>
          <div className="pd-time-list">
            <div className="pd-time-row">
              <span className="pd-time-key mono">创建</span>
              <span className="pd-time-val">
                {new Date(project.created_at).toLocaleString("zh-CN")}
              </span>
            </div>
            <div className="pd-time-row">
              <span className="pd-time-key mono">更新</span>
              <span className="pd-time-val">
                {new Date(project.updated_at).toLocaleString("zh-CN")}
              </span>
            </div>
            {project.last_activity && (
              <div className="pd-time-row">
                <span className="pd-time-key mono">活跃</span>
                <span className="pd-time-val">
                  {new Date(project.last_activity).toLocaleString("zh-CN")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Relations ═══ */}
      <section className="pd-section">
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
        {/* P8-04: 内联添加关系表单 */}
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
                <input
                  value={relDesc}
                  onChange={(e) => setRelDesc(e.target.value)}
                  placeholder="可选描述"
                  className="form-input flex-1"
                  style={{ fontSize: 11 }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddRelation}
                  disabled={!relTarget}
                  className="button button-primary"
                  style={{ fontSize: 11, padding: "4px 12px" }}
                >
                  提交
                </button>
                <button
                  onClick={() => { setShowAddRel(false); setRelTarget(""); setRelType("dependency"); setRelDesc(""); }}
                  className="button"
                  style={{ fontSize: 11, padding: "4px 12px" }}
                >
                  取消
                </button>
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
                <button
                  onClick={() => handleRemoveRelation(r.id)}
                  className="icon-btn ml-auto"
                  style={{ color: "var(--danger)" }}
                  title="删除关系"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ 任务概况 ═══ */}
      <section className="pd-section">
        <h3 className="pd-section-title">
          任务概况
          <span className="pd-section-count mono" style={{ color: projectTasks.length > 0 ? undefined : "var(--muted)" }}>
            {projectTasks.length}
          </span>
        </h3>
        {projectTasks.length === 0 ? (
          <div className="flex items-center gap-3" style={{ padding: "12px 0" }}>
            <span className="text-xs" style={{ color: "var(--muted)" }}>暂无任务</span>
            <button
              onClick={() => setShowAddTask(true)}
              className="button button-primary"
              style={{ fontSize: 11, padding: "4px 12px" }}
            >
              <Plus size={12} /> 新建任务
            </button>
            <Link
              to={`/tasks`}
              className="text-xs"
              style={{ color: "var(--accent)" }}
            >
              前往任务页 →
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {[
                { key: "pending", label: "待处理", color: "var(--warning)" },
                { key: "in_progress", label: "进行中", color: "var(--info)" },
                { key: "completed", label: "已完成", color: "var(--success)" },
                { key: "failed", label: "失败", color: "var(--danger)" },
                { key: "cancelled", label: "已取消", color: "var(--muted)" },
              ].map((s) => {
                const count = projectTasks.filter((t: any) => t.status === s.key).length;
                return (
                  <div key={s.key} className="metric-card" style={{ padding: "8px 12px" }}>
                    <p className="text-lg font-semibold" style={{ color: s.color }}>{count}</p>
                    <p className="text-[10px]" style={{ color: "var(--muted)" }}>{s.label}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddTask(true)}
                className="button button-primary"
                style={{ fontSize: 11, padding: "4px 12px" }}
              >
                <Plus size={12} /> 新建任务
              </button>
              <Link
                to={`/tasks`}
                className="button"
                style={{ fontSize: 11, padding: "4px 12px", textDecoration: "none" }}
              >
                查看全部任务 →
              </Link>
            </div>
          </>
        )}
        {/* 内联新建任务表单 */}
        {showAddTask && (
          <div className="pd-meta-card" style={{ marginTop: 12, padding: 12 }}>
            <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>
              新建任务
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="输入任务标题，回车提交"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newTaskTitle.trim()) handleAddTask(); }}
                className="form-input flex-1"
                style={{ fontSize: 12 }}
                autoFocus
              />
              <button onClick={handleAddTask} disabled={!newTaskTitle.trim()} className="button button-primary" style={{ fontSize: 11, padding: "4px 12px" }}>
                提交
              </button>
              <button onClick={() => { setShowAddTask(false); setNewTaskTitle(""); }} className="button" style={{ fontSize: 11, padding: "4px 12px" }}>
                取消
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ═══ 输出记录 ═══ */}
      {outputs.length > 0 && (
        <section className="pd-section">
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
    </div>
  );
}
